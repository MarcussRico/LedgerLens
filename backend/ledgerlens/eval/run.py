"""One command: generate a labelled corpus, run the engine blind, score it.

    python -m ledgerlens.eval.run
"""
from __future__ import annotations

import argparse
import json
import time

from ledgerlens import registry
from ledgerlens.config import AnalysisConfig
from ledgerlens.context import AnalysisContext, RejectedRows
from ledgerlens.eval.generator import generate
from ledgerlens.eval.harness import evaluate
from ledgerlens.ingest.normalise import normalise_units, to_datetime
from ledgerlens.resolve.skus import resolve_skus
from ledgerlens.resolve.vendors import apply_resolution, resolve_vendors


def build(corpus, config: AnalysisConfig) -> AnalysisContext:
    frames = {"invoices": corpus.invoices.copy(), "pos": corpus.pos.copy(),
              "grns": corpus.grns.copy(), "vendors": corpus.vendors.copy(),
              "lines": corpus.lines.copy(), "employees": corpus.employees.copy()}
    for name, cols in (("invoices", ["invoice_date", "submitted_at", "paid_at"]),
                       ("pos", ["po_date"]), ("grns", ["grn_date"]),
                       ("vendors", ["onboarded_at"]), ("lines", ["invoice_date"])):
        for c in cols:
            if c in frames[name].columns:
                frames[name][c] = to_datetime(frames[name][c], dayfirst=False)

    resolved, alias_map, _ = resolve_vendors(frames["vendors"])
    apply_resolution(frames, alias_map)
    frames["vendors"] = (resolved.sort_values("vendor_id")
                                 .groupby("entity_id", as_index=False).first()
                                 .drop(columns=["vendor_id"], errors="ignore")
                                 .rename(columns={"entity_id": "vendor_id"}))
    lines, catalogue = resolve_skus(normalise_units(frames["lines"]))
    return AnalysisContext(
        invoices=frames["invoices"], pos=frames["pos"], grns=frames["grns"],
        vendors=frames["vendors"], skus=catalogue, lines=lines,
        employees=frames["employees"], config=config,
        rejected=RejectedRows(), alias_map=alias_map,
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="Score the engine against planted frauds")
    ap.add_argument("--seed", type=int, default=20260827)
    ap.add_argument("--invoices", type=int, default=1400)
    ap.add_argument("--frauds", type=int, default=150)
    ap.add_argument("--zero-trust", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    registry.load_all()
    corpus = generate(seed=args.seed, n_invoices=args.invoices, target_frauds=args.frauds)
    config = AnalysisConfig(seed=args.seed, zero_trust=args.zero_trust, headcount=420)
    ctx = build(corpus, config)

    started = time.perf_counter()
    findings = registry.run_all(ctx)
    elapsed = time.perf_counter() - started

    opportunity_rules = {d.rule_id for d in registry.all_detectors()
                         if getattr(d, "opportunity", False)}
    result = evaluate(findings, corpus.ground_truth,
                      clean_invoice_count=len(ctx.invoices),
                      opportunity_rules=opportunity_rules)
    if args.json:
        print(json.dumps(result.as_dict(), indent=2))
        return
    print(f"corpus: {len(ctx.invoices)} invoices · {len(ctx.pos)} POs · "
          f"{len(ctx.vendors)} entities · {len(ctx.skus)} resolved SKUs")
    print(f"engine: {len(registry.detectors_for(config))} detectors ran in {elapsed:.2f}s, "
          f"{len(findings)} findings"
          + (" (zero_trust)" if args.zero_trust else ""))
    print()
    print(result.report())


if __name__ == "__main__":
    main()
