"""Ring detection is the pillar that can do reputational harm — a false finding
here implicitly asserts a relationship between named parties. These tests pin
the evidence threshold that keeps it from over-asserting."""
from __future__ import annotations

import pandas as pd

from ledgerlens.config import AnalysisConfig
from ledgerlens.detect.integrity import VendorRings, _prevalence_discount
from tests.conftest import ctx_with


def _vendors(rows: list[dict]) -> pd.DataFrame:
    base = {"gstin": None, "pan": None, "bank_account": None, "address": None,
            "phone": None, "email_domain": None}
    return pd.DataFrame([{**base, **r} for r in rows])


def _run(rows, **cfg):
    ctx = ctx_with(vendors=_vendors(rows))
    object.__setattr__(ctx, "config", AnalysisConfig(**cfg))
    return VendorRings().run(ctx)


def test_shared_bank_account_alone_is_enough():
    """Two payees on one account are one payee for payment purposes."""
    found = _run([
        {"vendor_id": "A", "name": "Alpha Traders", "bank_account": "HDFC-4471"},
        {"vendor_id": "B", "name": "Beta Supplies", "bank_account": "HDFC 4471"},
    ])
    assert len(found) == 1
    assert "bank account" in found[0].evidence["shared_attributes"]
    assert found[0].evidence["link_evidence"] >= 1.0


def test_shared_free_mail_domain_is_never_a_ring():
    """Fifteen small vendors on gmail.com are fifteen small vendors."""
    rows = [{"vendor_id": f"V{i}", "name": f"Vendor {i}", "email_domain": "gmail.com"}
            for i in range(15)]
    assert _run(rows) == []


def test_one_industrial_estate_is_not_a_ring():
    """Co-location is normal. Eight vendors at one address says almost nothing
    about any pair within it."""
    rows = [{"vendor_id": f"V{i}", "name": f"Fab {i}",
             "address": "12 SIDCO Industrial Estate, Guindy"} for i in range(8)]
    assert _run(rows) == []


def test_one_accountants_phone_is_not_a_ring():
    rows = [{"vendor_id": f"V{i}", "name": f"Consult {i}", "phone": "+91 9840112233"}
            for i in range(3)]
    assert _run(rows) == []


def test_two_weak_attributes_together_do_qualify():
    """Address plus phone on a single pair clears the bar; either alone does not."""
    pair = [
        {"vendor_id": "A", "name": "Alpha", "address": "17/3 Anna Nagar", "phone": "+91 9000011111"},
        {"vendor_id": "B", "name": "Beta", "address": "17/3 Anna Nagar", "phone": "+91 9000011111"},
    ]
    assert len(_run(pair)) == 1
    address_only = [{k: v for k, v in r.items() if k != "phone"} for r in pair]
    assert _run(address_only) == []


def test_evidence_records_how_the_link_was_weighted():
    """Every score must be decomposable — the finding has to show its working."""
    found = _run([
        {"vendor_id": "A", "name": "Alpha", "bank_account": "HDFC-1"},
        {"vendor_id": "B", "name": "Beta", "bank_account": "HDFC-1"},
    ])
    ev = found[0].evidence
    assert "link_evidence" in ev and "link_threshold" in ev
    assert ev["attribute_weights"]["bank account"] == 1.0


def test_threshold_is_configurable_not_hardcoded():
    rows = [{"vendor_id": f"V{i}", "name": f"Fab {i}", "address": "12 SIDCO Estate"}
            for i in range(8)]
    assert _run(rows) == []
    # a client willing to accept weaker links can lower the bar
    assert _run(rows, ring_link_threshold=0.1)


def test_prevalence_discount_is_gentle_on_pairs_harsh_on_cohorts():
    assert _prevalence_discount(2) == 1.0
    assert _prevalence_discount(3) < 0.6
    assert _prevalence_discount(15) < 0.25
    assert _prevalence_discount(15) < _prevalence_discount(8) < _prevalence_discount(3)
