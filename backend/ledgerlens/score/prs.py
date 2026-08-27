"""
Procurement Risk Score — 0-100, five pillar sub-scores, every point traceable
to the rule that produced it.

There is no opaque weighted sum here. A score is a list of contributions, each
naming a rule_id, and the total is their weighted aggregation. If a controller
cannot be shown why a vendor scores 91, the score is worthless.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from ledgerlens.config import AnalysisConfig
from ledgerlens.contracts import Finding, Pillar

PREFIX_OF = {
    Pillar.DUPLICATES: "DUP", Pillar.PRICE: "PRC", Pillar.BEHAVIOURAL: "BHV",
    Pillar.INTEGRITY: "VND", Pillar.COMPLIANCE: "CMP",
}


@dataclass
class PillarScore:
    pillar: str
    prefix: str
    raw_points: float
    weight: float
    contribution: float          # points out of the pillar's weighted maximum
    max_contribution: float
    findings: int
    money: float
    components: list[dict] = field(default_factory=list)


@dataclass
class RiskScore:
    subject_type: str            # vendor | department | invoice | corpus
    subject_id: str
    subject_name: str
    score: int                   # 0-100
    band: str
    pillars: list[PillarScore]
    findings: int
    money_at_risk: float
    derivation: str

    def as_dict(self) -> dict:
        return {
            "subject_type": self.subject_type,
            "subject_id": self.subject_id,
            "subject_name": self.subject_name,
            "score": self.score,
            "band": self.band,
            "findings": self.findings,
            "money_at_risk": round(self.money_at_risk, 2),
            "derivation": self.derivation,
            "pillars": [
                {"pillar": p.pillar, "prefix": p.prefix,
                 "points": round(p.contribution, 2),
                 "max_points": round(p.max_contribution, 2),
                 "raw": round(p.raw_points, 2), "weight": p.weight,
                 "findings": p.findings, "money_at_risk": round(p.money, 2),
                 "components": p.components[:12]}
                for p in self.pillars
            ],
        }


def _band(score: int) -> str:
    if score >= 75:
        return "severe"
    if score >= 50:
        return "elevated"
    if score >= 25:
        return "moderate"
    return "low"


#: A pillar saturates: the tenth duplicate does not make a vendor ten times
#: riskier than the first. Diminishing returns keep one noisy detector from
#: dominating a score.
def _saturate(points: float, half: float = 60.0) -> float:
    return points / (points + half) if points > 0 else 0.0


def score_findings(
    findings: list[Finding],
    *,
    subject_type: str,
    subject_id: str,
    subject_name: str,
    config: AnalysisConfig,
) -> RiskScore:
    by_prefix: dict[str, list[Finding]] = defaultdict(list)
    for f in findings:
        by_prefix[f.rule_id.split("-")[0]].append(f)

    weights = config.pillar_weights
    total_weight = sum(weights.values()) or 1.0

    pillars: list[PillarScore] = []
    total = 0.0
    for pillar, prefix in PREFIX_OF.items():
        group = by_prefix.get(prefix, [])
        weight = weights.get(prefix, 0.0)
        max_contribution = weight / total_weight * 100.0

        # raw points: each finding contributes its own score_contribution,
        # scaled by the confidence the detector expressed in it
        raw = sum(
            sum(c.points for c in f.score_contribution) * f.confidence
            for f in group
        )
        contribution = _saturate(raw) * max_contribution
        total += contribution

        components: list[dict] = []
        for f in sorted(group, key=lambda x: -x.money_at_risk)[:12]:
            for c in f.score_contribution:
                components.append({
                    "component": c.component, "points": c.points,
                    "rule_id": c.rule_id or f.rule_id,
                    "finding_id": f.id,
                    "money_at_risk": round(f.money_at_risk, 2),
                })

        pillars.append(PillarScore(
            pillar=str(pillar), prefix=prefix, raw_points=raw, weight=weight,
            contribution=contribution, max_contribution=max_contribution,
            findings=len(group),
            money=sum(f.money_at_risk for f in group),
            components=components,
        ))

    score = int(round(min(total, 100.0)))
    parts = " + ".join(
        f"{p.prefix} {p.contribution:.1f}/{p.max_contribution:.0f}"
        for p in pillars if p.findings
    ) or "no findings"
    return RiskScore(
        subject_type=subject_type, subject_id=subject_id, subject_name=subject_name,
        score=score, band=_band(score), pillars=pillars, findings=len(findings),
        money_at_risk=sum(f.money_at_risk for f in findings),
        derivation=(
            f"{parts} = {total:.1f} -> {score}/100. Each pillar's raw points are "
            f"Σ(score_contribution × confidence), saturated as r/(r+60) so one "
            f"noisy detector cannot dominate, then scaled to its weight."
        ),
    )


def score_all_vendors(findings: list[Finding], ctx) -> list[RiskScore]:
    grouped: dict[str, list[Finding]] = defaultdict(list)
    for f in findings:
        if f.entities.vendor_id:
            grouped[f.entities.vendor_id].append(f)
    scores = [
        score_findings(fs, subject_type="vendor", subject_id=vid,
                       subject_name=ctx.vendor_name(vid), config=ctx.config)
        for vid, fs in grouped.items()
    ]
    return sorted(scores, key=lambda s: (-s.score, -s.money_at_risk))


def health_index(findings: list[Finding], ctx) -> RiskScore:
    """Corpus-level Procurement Health Index. Inverted risk: 100 is clean."""
    risk = score_findings(findings, subject_type="corpus", subject_id="corpus",
                          subject_name=ctx.config.client_name, config=ctx.config)
    healthy = 100 - risk.score
    return RiskScore(
        subject_type="corpus", subject_id="corpus",
        subject_name=ctx.config.client_name, score=healthy, band=_band(risk.score),
        pillars=risk.pillars, findings=risk.findings,
        money_at_risk=risk.money_at_risk,
        derivation=f"Health = 100 − risk {risk.score}. {risk.derivation}",
    )
