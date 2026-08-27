from __future__ import annotations

import pandas as pd

from ledgerlens.detect.duplicates import NearDuplicate, TranspositionDuplicate
from tests.conftest import ctx_with, invoices


def _pair(amount_b: float, date_b: str, no_b: str = "INV-2"):
    return invoices([
        {"invoice_id": "A", "vendor_id": "V1", "gst_invoice_no": "INV-1",
         "invoice_date": "01/03/2026", "amount": 100_000.0},
        {"invoice_id": "B", "vendor_id": "V1", "gst_invoice_no": no_b,
         "invoice_date": date_b, "amount": amount_b},
    ])


def test_near_duplicate_fires_on_same_amount_days_apart():
    ctx = ctx_with(invoices=_pair(100_000.0, "04/03/2026"))
    found = NearDuplicate().run(ctx)
    assert len(found) == 1
    f = found[0]
    assert f.rule_id == "DUP-002"
    assert f.money_at_risk == 100_000.0
    assert f.evidence["days_apart"] == 3
    # the evidence must carry exactly what the rule compared
    assert {"amount_a", "amount_b", "amount_delta_pct", "window_days"} <= f.evidence.keys()


def test_near_duplicate_silent_outside_the_date_window():
    ctx = ctx_with(invoices=_pair(100_000.0, "20/03/2026"))
    assert NearDuplicate().run(ctx) == []


def test_near_duplicate_silent_when_amounts_differ_beyond_tolerance():
    ctx = ctx_with(invoices=_pair(140_000.0, "04/03/2026"))
    assert NearDuplicate().run(ctx) == []


def test_near_duplicate_ignores_identical_invoice_numbers():
    """That case belongs to DUP-001; two detectors must not claim one event."""
    ctx = ctx_with(invoices=_pair(100_000.0, "04/03/2026", no_b="INV-1"))
    assert NearDuplicate().run(ctx) == []


def test_transposition_catches_one_character_slip():
    ctx = ctx_with(invoices=invoices([
        {"invoice_id": "A", "vendor_id": "V1", "gst_invoice_no": "INV-1042",
         "invoice_date": "01/03/2026", "amount": 50_000.0},
        {"invoice_id": "B", "vendor_id": "V1", "gst_invoice_no": "INV-I042",
         "invoice_date": "18/04/2026", "amount": 50_000.0},
    ]))
    found = TranspositionDuplicate().run(ctx)
    assert len(found) == 1
    assert found[0].evidence["levenshtein_distance"] == 1


def test_transposition_silent_on_genuinely_different_numbers():
    ctx = ctx_with(invoices=invoices([
        {"invoice_id": "A", "vendor_id": "V1", "gst_invoice_no": "INV-1042",
         "invoice_date": "01/03/2026", "amount": 50_000.0},
        {"invoice_id": "B", "vendor_id": "V1", "gst_invoice_no": "INV-9876",
         "invoice_date": "18/04/2026", "amount": 50_000.0},
    ]))
    assert TranspositionDuplicate().run(ctx) == []


def test_findings_are_claims_not_verdicts():
    """The contract refuses an explanation that reads as an accusation."""
    import pytest
    from ledgerlens.contracts import Action, Entities, Finding, Pillar

    with pytest.raises(ValueError, match="verdict"):
        Finding(
            id="x", rule_id="DUP-002", pillar=Pillar.DUPLICATES, severity="high",
            entities=Entities(invoice_ids=["A"]), evidence={"a": 1},
            money_at_risk=1.0, confidence=0.9,
            explanation="This vendor committed fraud.",
            recommended_action=Action(kind="recover", label="x", detail="y"),
        )


def test_finding_refuses_empty_evidence():
    import pytest
    from ledgerlens.contracts import Action, Entities, Finding, Pillar

    with pytest.raises(ValueError, match="evidence"):
        Finding(
            id="x", rule_id="DUP-002", pillar=Pillar.DUPLICATES, severity="high",
            entities=Entities(invoice_ids=["A"]), evidence={},
            money_at_risk=1.0, confidence=0.9, explanation="ok",
            recommended_action=Action(kind="recover", label="x", detail="y"),
        )
