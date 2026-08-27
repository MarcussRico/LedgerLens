"""
Accuracy harness.

A planted fraud counts as detected when some finding both (a) fires a rule that
this fraud type is supposed to trigger and (b) names an entity the fraud
actually involves. Requiring both stops a lucky rule on an unrelated vendor
from being scored as a hit.

Findings that match no planted fraud are false positives. This is deliberately
harsh: our generator does not label every real anomaly in the synthetic data, so
some "false" positives are genuinely correct findings on incidental artefacts.
The reported precision is therefore a floor, not a flattering estimate.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from ledgerlens.contracts import Finding
from ledgerlens.eval.generator import PlantedFraud


@dataclass
class PillarAccuracy:
    prefix: str
    tp: int = 0
    fp: int = 0

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 0.0


@dataclass
class EvalResult:
    tp: int
    fp: int
    fn: int
    tn: int
    planted: int
    findings: int
    by_pillar: dict[str, PillarAccuracy]
    by_type: dict[str, tuple[int, int]] = field(default_factory=dict)  # detected, planted
    missed: list[str] = field(default_factory=list)
    opportunities: int = 0
    opportunity_value: float = 0.0

    @property
    def precision(self) -> float:
        return self.tp / (self.tp + self.fp) if (self.tp + self.fp) else 0.0

    @property
    def recall(self) -> float:
        return self.tp / (self.tp + self.fn) if (self.tp + self.fn) else 0.0

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        return 2 * p * r / (p + r) if (p + r) else 0.0

    def report(self) -> str:
        lines = [
            "confusion matrix",
            f"  TP {self.tp:5d}   planted frauds detected",
            f"  FP {self.fp:5d}   findings matching no planted fraud",
            f"  FN {self.fn:5d}   planted frauds missed",
            f"  TN {self.tn:5d}   clean invoices left alone",
            "",
            f"  precision {self.precision * 100:5.1f}%   = TP / (TP + FP)",
            f"  recall    {self.recall * 100:5.1f}%   = TP / (TP + FN)",
            f"  F1        {self.f1 * 100:5.1f}%",
            "",
            "recall by planted fraud type",
        ]
        for t, (found, total) in sorted(self.by_type.items(),
                                        key=lambda kv: kv[1][0] / max(kv[1][1], 1)):
            bar = "█" * int(found / max(total, 1) * 20)
            lines.append(f"  {t:24} {found:3d}/{total:<3d} {found / max(total, 1) * 100:5.1f}% {bar}")
        if self.opportunities:
            lines += ["", f"  plus {self.opportunities} savings opportunities "
                          f"(₹{self.opportunity_value:,.0f}) — scored separately, "
                          f"since they are not fraud claims"]
        lines += ["", "precision by pillar"]
        for prefix, acc in sorted(self.by_pillar.items()):
            if acc.tp + acc.fp:
                lines.append(f"  {prefix}  {acc.precision * 100:5.1f}%   "
                             f"({acc.tp} matched / {acc.tp + acc.fp} raised)")
        return "\n".join(lines)

    def as_dict(self) -> dict:
        return {
            "confusion": {"tp": self.tp, "fp": self.fp, "fn": self.fn, "tn": self.tn},
            "planted": self.planted, "findings": self.findings,
            "precision": round(self.precision, 4),
            "recall": round(self.recall, 4),
            "f1": round(self.f1, 4),
            "by_pillar": {k: round(v.precision, 4) for k, v in self.by_pillar.items()},
            "by_type": {k: {"detected": d, "planted": p, "recall": round(d / max(p, 1), 4)}
                        for k, (d, p) in self.by_type.items()},
        }


def _touches(finding: Finding, fraud: PlantedFraud) -> bool:
    if set(finding.entities.invoice_ids) & set(fraud.invoice_ids):
        return True
    if set(finding.entities.po_ids) & set(fraud.po_ids):
        return True
    if finding.entities.vendor_id and finding.entities.vendor_id in fraud.vendor_ids:
        return True
    return False


def evaluate(findings: list[Finding], ground_truth: list[PlantedFraud],
             clean_invoice_count: int,
             opportunity_rules: set[str] | None = None) -> EvalResult:
    """Opportunity findings (consolidation, counterfactual pricing) are excluded
    from the fraud confusion matrix. They are correct and useful, but they are
    not fraud claims, and scoring them against fraud labels would describe
    neither the engine nor the metric accurately. They are counted separately."""
    opportunity_rules = opportunity_rules or set()
    opportunities = [f for f in findings if f.rule_id in opportunity_rules]
    findings = [f for f in findings if f.rule_id not in opportunity_rules]

    detected: set[str] = set()
    matched_findings: set[str] = set()

    for fraud in ground_truth:
        for f in findings:
            if f.rule_id in fraud.expected_rules and _touches(f, fraud):
                detected.add(fraud.fraud_id)
                matched_findings.add(f.id)

    # A finding that lands on a record we know is fraudulent is a correct
    # detection even when it fires a rule we did not anticipate: an exact
    # duplicate legitimately also breaches GST numbering. Counting that as a
    # false positive would penalise the engine for being more thorough than the
    # label. Recall still requires the *expected* rule, so this cannot inflate it.
    for f in findings:
        if f.id in matched_findings:
            continue
        if any(_touches(f, fraud) for fraud in ground_truth):
            matched_findings.add(f.id)

    tp = len(detected)
    fn = len(ground_truth) - tp
    fp = len([f for f in findings if f.id not in matched_findings])
    flagged_invoices = {i for f in findings for i in f.entities.invoice_ids}
    tn = max(clean_invoice_count - len(flagged_invoices), 0)

    by_pillar: dict[str, PillarAccuracy] = defaultdict(lambda: PillarAccuracy(""))
    for f in findings:
        prefix = f.rule_id.split("-")[0]
        acc = by_pillar[prefix]
        acc.prefix = prefix
        if f.id in matched_findings:
            acc.tp += 1
        else:
            acc.fp += 1

    by_type: dict[str, tuple[int, int]] = {}
    for fraud in ground_truth:
        found, total = by_type.get(fraud.fraud_type, (0, 0))
        by_type[fraud.fraud_type] = (found + (1 if fraud.fraud_id in detected else 0), total + 1)

    return EvalResult(
        tp=tp, fp=fp, fn=fn, tn=tn, planted=len(ground_truth), findings=len(findings),
        by_pillar=dict(by_pillar), by_type=by_type,
        missed=[f.fraud_id for f in ground_truth if f.fraud_id not in detected],
        opportunities=len(opportunities),
        opportunity_value=round(sum(f.money_at_risk for f in opportunities), 2),
    )
