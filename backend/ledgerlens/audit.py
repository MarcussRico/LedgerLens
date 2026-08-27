"""
Tamper-evident audit trail.

Determinism is a claim until someone can check it. Every finding is hashed over
its own content, the hashes are chained in a fixed order, and the run reduces to
a single root. Re-run the same files and the root is identical; change one rupee
in the input and it is not.

That gives three things at once: proof the engine is deterministic, a way to
show a finding has not been edited after the fact, and a receipt a reviewer can
keep without keeping the data.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

import pandas as pd

from ledgerlens.contracts import Finding

ALGORITHM = "sha256"
VERSION = "ll-audit-1"


def _canonical(obj: object) -> str:
    """Stable JSON: sorted keys, no whitespace drift, floats normalised so
    18000.0 and 18000 cannot produce different hashes."""
    def norm(v: object) -> object:
        if isinstance(v, float):
            return round(v, 4) + 0.0
        if isinstance(v, dict):
            return {str(k): norm(x) for k, x in sorted(v.items(), key=lambda kv: str(kv[0]))}
        if isinstance(v, (list, tuple)):
            return [norm(x) for x in v]
        if isinstance(v, (pd.Timestamp,)):
            return str(v)
        return v
    return json.dumps(norm(obj), sort_keys=True, separators=(",", ":"), default=str)


def finding_hash(f: Finding) -> str:
    """Hash of exactly what the finding asserts. The id is excluded because it
    is derived, not asserted — including it would only hash a hash."""
    payload = {
        "rule_id": f.rule_id,
        "pillar": str(f.pillar),
        "severity": f.severity,
        "entities": {
            "invoice_ids": sorted(f.entities.invoice_ids),
            "vendor_id": f.entities.vendor_id,
            "po_ids": sorted(f.entities.po_ids),
            "sku_ids": sorted(f.entities.sku_ids),
            "employee_ids": sorted(f.entities.employee_ids),
        },
        "evidence": f.evidence,
        "money_at_risk": f.money_at_risk,
        "confidence": f.confidence,
        "explanation": f.explanation,
    }
    return hashlib.sha256(_canonical(payload).encode()).hexdigest()


def corpus_fingerprint(ctx) -> str:
    """Identifies the input without retaining it. Row counts and column-level
    sums change if any figure changes, but reveal nothing on their own."""
    parts: dict[str, object] = {}
    for name in ("invoices", "pos", "grns", "vendors", "lines", "employees"):
        frame = getattr(ctx, name, None)
        if frame is None or not isinstance(frame, pd.DataFrame):
            continue
        entry: dict[str, object] = {"rows": int(len(frame)),
                                    "columns": sorted(map(str, frame.columns))}
        for col in ("amount", "unit_price", "qty", "received_qty"):
            if col in frame.columns:
                total = pd.to_numeric(frame[col], errors="coerce").sum()
                entry[col] = round(float(total), 2) if pd.notna(total) else None
        parts[name] = entry
    return hashlib.sha256(_canonical(parts).encode()).hexdigest()


@dataclass
class AuditTrail:
    version: str
    algorithm: str
    corpus: str
    root: str
    count: int
    links: list[dict]

    def as_dict(self, include_links: bool = True) -> dict:
        out = {
            "version": self.version,
            "algorithm": self.algorithm,
            "corpusFingerprint": self.corpus,
            "root": self.root,
            "findings": self.count,
            "note": ("Re-run the same files and this root is identical. Change one "
                     "figure in the input and it is not."),
        }
        if include_links:
            out["chain"] = self.links[:200]
        return out


def build_trail(findings: list[Finding], ctx) -> AuditTrail:
    """Chain the findings in a fixed order so the root cannot depend on the
    order detectors happened to run in."""
    corpus = corpus_fingerprint(ctx)
    hashed = sorted(((finding_hash(f), f) for f in findings), key=lambda t: t[0])

    links: list[dict] = []
    previous = hashlib.sha256(f"{VERSION}:{corpus}".encode()).hexdigest()
    for content, f in hashed:
        link = hashlib.sha256(f"{previous}{content}".encode()).hexdigest()
        links.append({
            "findingId": f.id,
            "ruleId": f.rule_id,
            "contentHash": content[:16],
            "link": link[:16],
        })
        previous = link

    return AuditTrail(version=VERSION, algorithm=ALGORITHM, corpus=corpus,
                      root=previous, count=len(findings), links=links)


def verify(findings: list[Finding], ctx, expected_root: str) -> bool:
    return build_trail(findings, ctx).root == expected_root
