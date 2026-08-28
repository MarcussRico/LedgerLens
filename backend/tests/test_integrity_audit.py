"""The ledger is graded before it is interpreted, and every run is chainable."""
from __future__ import annotations

import pandas as pd

from ledgerlens.audit import build_trail, corpus_fingerprint, finding_hash, verify
from ledgerlens.config import AnalysisConfig
from ledgerlens.score.integrity import assess
from tests.conftest import ctx_with, invoices


def _ledger(amounts, ids=None, hours=None):
    n = len(amounts)
    rows = []
    for i, a in enumerate(amounts):
        rows.append({
            "invoice_id": (ids[i] if ids else f"INV-{i}"),
            "vendor_id": f"V-{i % 40}",
            "invoice_date": f"{(i % 28) + 1:02d}/03/2026",
            "submitted_at": f"{(i % 28) + 1:02d}/03/2026 {(hours[i] if hours else 9 + i % 9):02d}:15",
            "amount": float(a),
        })
    return invoices(rows)


def test_manufactured_ledger_scores_badly():
    """Round numbers, no Benford curve — the shape of chosen figures."""
    amounts = [round(50_000 + (i % 20) * 1_000) for i in range(600)]
    di = assess(ctx_with(invoices=_ledger(amounts)))
    assert di.score < 60, f"a manufactured ledger scored {di.score}"
    assert any("round" in c.name.lower() and c.score < 0.5 for c in di.checks)


def test_organic_ledger_scores_well():
    """Log-uniform amounts, which is what real spend looks like."""
    import math, random
    rng = random.Random(11)
    amounts = [round(math.exp(rng.uniform(math.log(3_000), math.log(900_000))), 2)
               for _ in range(900)]
    di = assess(ctx_with(invoices=_ledger(amounts)))
    assert di.score >= 70, f"an organic ledger scored {di.score}"


def test_grade_is_withheld_rather_than_guessed_on_a_tiny_file():
    di = assess(ctx_with(invoices=_ledger([1000.0, 2000.0, 3000.0])))
    assert di.score == 0 and "withheld" in di.headline.lower()


def test_duplicate_identifiers_are_caught():
    di = assess(ctx_with(invoices=_ledger([1234.56] * 80, ids=["INV-1"] * 80)))
    ident = next(c for c in di.checks if c.name == "Identifier integrity")
    assert ident.score < 0.5


def test_audit_root_is_stable_and_breaks_on_tampering():
    from ledgerlens import registry
    registry.load_all()
    ctx = ctx_with(invoices=_ledger([100_000.0, 100_000.0], ids=["A", "B"]))
    findings = registry.run_all(ctx)
    t1 = build_trail(findings, ctx)
    assert build_trail(findings, ctx).root == t1.root      # deterministic
    if findings:
        findings[0].evidence = {**findings[0].evidence, "_edited": True}
        assert not verify(findings, ctx, t1.root)          # tamper-evident


def test_corpus_fingerprint_changes_when_a_figure_changes():
    a = ctx_with(invoices=_ledger([1000.0, 2000.0]))
    b = ctx_with(invoices=_ledger([1000.0, 2000.01]))
    assert corpus_fingerprint(a) != corpus_fingerprint(b)


def test_float_normalisation_does_not_change_a_hash():
    from ledgerlens.contracts import Action, Entities, Finding, Pillar
    mk = lambda money: Finding(
        id="x", rule_id="DUP-002", pillar=Pillar.DUPLICATES, severity="high",
        entities=Entities(invoice_ids=["A"]), evidence={"a": 1},
        money_at_risk=money, confidence=0.9, explanation="ok",
        recommended_action=Action(kind="recover", label="l", detail="d"))
    assert finding_hash(mk(18000)) == finding_hash(mk(18000.0))


def test_ring_links_are_ordered_deterministically():
    """networkx yields edges in the iteration order of a Python set, and string
    hashing is randomised per process. Two hosts produced identical findings
    with differently-ordered link lists, so the audit root did not reproduce."""
    import pandas as pd
    from ledgerlens.detect.integrity import VendorRings

    rows = [{"vendor_id": v, "name": n, "bank_account": "HDFC-9", "gstin": None,
             "pan": None, "address": "1 Same Street", "phone": None,
             "email_domain": None}
            for v, n in [("V-C", "Gamma Co"), ("V-A", "Alpha Co"), ("V-B", "Beta Co")]]
    ctx = ctx_with(vendors=pd.DataFrame(rows))
    found = VendorRings().run(ctx)
    assert found, "the ring was not detected at all"
    links = found[0].evidence["links"]
    keys = [(l["a"], l["b"]) for l in links]
    assert keys == sorted(keys), f"links are not sorted: {keys}"
    for l in links:
        assert l["a"] <= l["b"], "edge pairs are not orientated"
        assert l["shared"] == sorted(l["shared"]), "shared attributes are not sorted"
