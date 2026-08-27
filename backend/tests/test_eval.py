"""The accuracy claim must be reproducible by anyone who runs it, and it must
not silently regress."""
from __future__ import annotations

from ledgerlens import registry
from ledgerlens.config import AnalysisConfig
from ledgerlens.eval.generator import generate
from ledgerlens.eval.harness import evaluate
from ledgerlens.eval.run import build


def _run(seed: int = 20260827):
    registry.load_all()
    corpus = generate(seed=seed)
    ctx = build(corpus, AnalysisConfig(seed=seed, headcount=420))
    findings = registry.run_all(ctx)
    opp = {d.rule_id for d in registry.all_detectors() if getattr(d, "opportunity", False)}
    return evaluate(findings, corpus.ground_truth, len(ctx.invoices), opportunity_rules=opp)


def test_generator_plants_exactly_the_target():
    assert len(generate(target_frauds=150).ground_truth) == 150


def test_generation_is_deterministic():
    a, b = generate(seed=7), generate(seed=7)
    assert a.invoices.equals(b.invoices)
    assert [f.fraud_id for f in a.ground_truth] == [f.fraud_id for f in b.ground_truth]


def test_accuracy_does_not_regress():
    r = _run()
    assert r.precision >= 0.80, f"precision regressed to {r.precision:.3f}"
    assert r.recall >= 0.90, f"recall regressed to {r.recall:.3f}"
    assert r.tp + r.fn == r.planted == 150


def test_every_pillar_contributes_detections():
    r = _run()
    for prefix in ("DUP", "PRC", "BHV", "VND", "CMP"):
        assert prefix in r.by_pillar, f"{prefix} produced no findings at all"


def test_zero_trust_keeps_only_baseline_free_detectors():
    registry.load_all()
    cfg = AnalysisConfig(zero_trust=True)
    kept = registry.detectors_for(cfg)
    assert kept, "zero_trust disabled everything"
    assert all(d.baseline_free for d in kept)
    assert len(kept) < len(registry.all_detectors())


def test_registry_has_42_detectors_across_5_pillars():
    registry.load_all()
    ds = registry.all_detectors()
    assert len(ds) == 42
    assert len({d.pillar for d in ds}) == 5
