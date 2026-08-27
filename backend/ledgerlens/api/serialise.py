"""camelCase at the API edge only.

Python stays snake_case internally per the conventions; the browser client was
written against camelCase. Converting in one place beats either side compromising.
"""
from __future__ import annotations

import re
from typing import Any

_SNAKE = re.compile(r"_([a-z0-9])")


def camel(name: str) -> str:
    return _SNAKE.sub(lambda m: m.group(1).upper(), name)


def camelise(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {camel(str(k)): camelise(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [camelise(v) for v in obj]
    return obj


def finding_to_dict(f) -> dict:
    return {
        "id": f.id,
        "ruleId": f.rule_id,
        "pillar": str(f.pillar),
        "severity": f.severity,
        "entities": {
            "invoiceIds": f.entities.invoice_ids,
            "vendorId": f.entities.vendor_id,
            "poIds": f.entities.po_ids,
            "skuIds": f.entities.sku_ids,
            "employeeIds": f.entities.employee_ids,
        },
        "evidence": camelise(f.evidence),
        "moneyAtRisk": f.money_at_risk,
        "confidence": f.confidence,
        "explanation": f.explanation,
        "recommendedAction": {
            "kind": f.recommended_action.kind,
            "label": f.recommended_action.label,
            "detail": f.recommended_action.detail,
        },
        "scoreContribution": [
            {"component": c.component, "points": c.points, "ruleId": c.rule_id}
            for c in f.score_contribution
        ],
        "detectedAt": f.detected_at,
    }
