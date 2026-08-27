"""Shared helpers for detectors. Detectors import from here, never from each
other — cross-imports are how a detector registry turns into a ball of mud."""
from __future__ import annotations

import hashlib

from ledgerlens.contracts import Action, Entities, Finding, ScoreComponent


def finding_id(rule_id: str, *parts: object) -> str:
    """Deterministic id: the same finding on the same data always has the same
    id across runs, so a user's 'mark false positive' survives a re-analysis."""
    digest = hashlib.sha1(
        "|".join([rule_id, *[str(p) for p in parts]]).encode()
    ).hexdigest()[:10]
    return f"{rule_id}-{digest}"


def severity_for(money: float, *, critical: float = 1_00_000,
                 high: float = 50_000, medium: float = 10_000) -> str:
    if money >= critical:
        return "critical"
    if money >= high:
        return "high"
    if money >= medium:
        return "medium"
    return "low"


def make(
    rule_id: str, *, key: tuple, evidence: dict, money: float, confidence: float,
    explanation: str, action: Action, score: list[tuple[str, int]],
    entities: Entities, detected_at: str | None = None,
    severity: str | None = None,
) -> Finding:
    from ledgerlens.contracts import PILLAR_PREFIX
    return Finding(
        id=finding_id(rule_id, *key),
        rule_id=rule_id,
        pillar=PILLAR_PREFIX[rule_id.split("-")[0]],
        severity=severity or severity_for(money),   # type: ignore[arg-type]
        entities=entities,
        evidence=evidence,
        money_at_risk=round(float(money), 2),
        confidence=round(float(confidence), 3),
        explanation=explanation,
        recommended_action=action,
        score_contribution=[ScoreComponent(component=c, points=p, rule_id=rule_id)
                            for c, p in score],
        detected_at=detected_at,
    )


def inr(amount: float) -> str:
    """Indian digit grouping, for evidence and explanation strings."""
    neg = amount < 0
    whole = f"{abs(amount):.0f}"
    if len(whole) > 3:
        head, tail = whole[:-3], whole[-3:]
        parts = []
        while len(head) > 2:
            parts.insert(0, head[-2:])
            head = head[:-2]
        if head:
            parts.insert(0, head)
        whole = ",".join(parts) + "," + tail
    return f"{'-' if neg else ''}₹{whole}"
