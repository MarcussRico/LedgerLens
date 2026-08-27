"""
Detector registry.

Adding a detector is one new file and one decorator — deliberately, because we
demo adding a rule live on stage. Detectors must not import each other; if two
need the same helper it belongs in a shared module, not a cross-import.
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Iterable

from ledgerlens.context import AnalysisContext
from ledgerlens.contracts import PILLAR_PREFIX, Detector, Finding, Pillar

log = logging.getLogger(__name__)

_REGISTRY: dict[str, Detector] = {}


def detector(
    rule_id: str,
    name: str,
    *,
    baseline_free: bool = False,
) -> Callable[[type], type]:
    """Register a detector class under its rule_id.

    baseline_free: True when the detector needs no trust in the client's own
    history — a mathematical invariant, an external fact, or a structural
    property. Only these survive `zero_trust` mode.
    """
    def wrap(cls: type) -> type:
        prefix = rule_id.split("-")[0]
        if prefix not in PILLAR_PREFIX:
            raise ValueError(f"{rule_id}: unknown pillar prefix {prefix!r}")
        if rule_id in _REGISTRY:
            raise ValueError(f"duplicate detector rule_id {rule_id!r}")
        cls.rule_id = rule_id            # type: ignore[attr-defined]
        cls.name = name                  # type: ignore[attr-defined]
        cls.pillar = PILLAR_PREFIX[prefix]   # type: ignore[attr-defined]
        cls.baseline_free = baseline_free    # type: ignore[attr-defined]
        _REGISTRY[rule_id] = cls()       # type: ignore[assignment]
        return cls
    return wrap


def all_detectors() -> list[Detector]:
    return [_REGISTRY[k] for k in sorted(_REGISTRY)]


def detectors_for(config) -> list[Detector]:
    """The detectors that may run under this configuration."""
    dets = all_detectors()
    if getattr(config, "zero_trust", False):
        dets = [d for d in dets if d.baseline_free]
    return dets


def by_pillar() -> dict[Pillar, list[Detector]]:
    out: dict[Pillar, list[Detector]] = {p: [] for p in Pillar}
    for d in all_detectors():
        out[d.pillar].append(d)
    return out


def run_all(ctx: AnalysisContext) -> list[Finding]:
    """Execute every eligible detector. One failing detector must never take
    the run down — it is reported and the rest continue."""
    findings: list[Finding] = []
    for det in detectors_for(ctx.config):
        try:
            produced = det.run(ctx)
        except Exception:
            log.exception("detector %s failed", det.rule_id)
            continue
        for f in produced:
            if f.rule_id != det.rule_id:
                log.warning("%s emitted a finding tagged %s", det.rule_id, f.rule_id)
        findings.extend(produced)
    findings.sort(key=lambda f: (-f.money_at_risk, f.rule_id))
    return findings


def load_all() -> None:
    """Import the detector modules so their decorators fire."""
    from ledgerlens.detect import (  # noqa: F401
        behaviour, compliance, duplicates, integrity, price,
    )


def summary() -> list[dict]:
    return [
        {"rule_id": d.rule_id, "name": d.name, "pillar": str(d.pillar),
         "baseline_free": d.baseline_free}
        for d in all_detectors()
    ]
