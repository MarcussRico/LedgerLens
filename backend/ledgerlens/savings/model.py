"""
The three-tier savings model.

The rule that governs this module: **corroboration is not more money.** When
DUP-002, DUP-004 and DUP-007 all fire on the same pair of invoices, that is one
recoverable event described three ways. Summing them inflates the headline by
3x, and one number a judge can't trace makes every other number suspect.

So every tier deduplicates on the underlying economic event before it totals,
and every total carries the arithmetic that produced it.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from ledgerlens.contracts import Finding
from ledgerlens.detect._helpers import inr

# Which rules contribute to which tier. A rule absent here contributes risk
# but not a savings claim — we do not monetise what we cannot defend.
RECOVERABLE_RULES = {"DUP-001", "DUP-002", "DUP-004", "DUP-005", "DUP-006",
                     "DUP-007", "DUP-008", "CMP-001", "CMP-003"}
AVOIDABLE_RULES = {"PRC-001", "PRC-002", "PRC-003", "PRC-005", "PRC-009"}
NEGOTIABLE_RULES = {"PRC-004", "PRC-006", "PRC-007", "PRC-008"}


@dataclass
class TierLine:
    label: str
    amount: float
    rule_ids: list[str]
    finding_ids: list[str]
    basis: str


@dataclass
class Tier:
    name: str
    confidence: str
    amount: float
    lines: list[TierLine] = field(default_factory=list)
    derivation: str = ""
    deduped_events: int = 0
    raw_finding_count: int = 0

    def as_dict(self) -> dict:
        return {
            "name": self.name, "confidence": self.confidence,
            "amount": round(self.amount, 2),
            "display": inr(self.amount),
            "events": self.deduped_events,
            "findings_contributing": self.raw_finding_count,
            "derivation": self.derivation,
            "lines": [
                {"label": l.label, "amount": round(l.amount, 2),
                 "display": inr(l.amount), "rule_ids": l.rule_ids,
                 "finding_ids": l.finding_ids, "basis": l.basis}
                for l in sorted(self.lines, key=lambda x: -x.amount)[:25]
            ],
        }


@dataclass
class SavingsModel:
    tiers: list[Tier]
    total: float
    spend_analysed: float
    derivation: str

    def as_dict(self) -> dict:
        return {
            "tiers": [t.as_dict() for t in self.tiers],
            "total": round(self.total, 2),
            "total_display": inr(self.total),
            "spend_analysed": round(self.spend_analysed, 2),
            "spend_display": inr(self.spend_analysed),
            "share_of_spend": (
                round(self.total / self.spend_analysed * 100, 3)
                if self.spend_analysed else 0.0
            ),
            "derivation": self.derivation,
        }


def _event_key(f: Finding) -> tuple:
    """The economic event a finding describes.

    Two findings naming the same set of invoices are the same event however
    many detectors noticed it. Falling back to the finding id means anything we
    cannot confidently group stays separate rather than being silently merged
    away — under-merging costs us a claim, over-merging costs us the truth.
    """
    if f.entities.invoice_ids:
        return ("invoices", frozenset(f.entities.invoice_ids))
    if f.entities.po_ids:
        return ("pos", frozenset(f.entities.po_ids))
    if f.entities.sku_ids and f.entities.vendor_id:
        return ("sku-vendor", f.entities.vendor_id, frozenset(f.entities.sku_ids))
    return ("finding", f.id)


def _collapse(findings: list[Finding]) -> list[tuple[list[Finding], float]]:
    """Group findings by economic event. The event's value is the *maximum*
    claimed by any single detector, never the sum — corroboration raises
    confidence, not the amount."""
    grouped: dict[tuple, list[Finding]] = defaultdict(list)
    for f in findings:
        grouped[_event_key(f)].append(f)
    return [(fs, max(x.money_at_risk for x in fs)) for fs in grouped.values()]


def _tier(name: str, confidence: str, rules: set[str],
          findings: list[Finding], note: str) -> Tier:
    relevant = [f for f in findings if f.rule_id in rules]
    events = _collapse(relevant)
    lines = [
        TierLine(
            label=(fs[0].explanation[:110] + "…") if len(fs[0].explanation) > 110
                  else fs[0].explanation,
            amount=amount,
            rule_ids=sorted({f.rule_id for f in fs}),
            finding_ids=[f.id for f in fs],
            basis=(
                f"{len(fs)} detector(s) corroborate this event; counted once at "
                f"{inr(amount)}, the highest single assessment."
                if len(fs) > 1 else f"single detector, {inr(amount)}"
            ),
        )
        for fs, amount in events
    ]
    total = sum(l.amount for l in lines)
    collapsed = len(relevant) - len(events)
    derivation = (
        f"{note} {len(events)} distinct event(s) from {len(relevant)} finding(s)"
        + (f"; {collapsed} duplicate assessment(s) collapsed so no event is "
           f"counted twice" if collapsed else "")
        + f". Sum = {inr(total)}."
    )
    return Tier(name=name, confidence=confidence, amount=total, lines=lines,
                derivation=derivation, deduped_events=len(events),
                raw_finding_count=len(relevant))


def build_savings(findings: list[Finding], spend_analysed: float) -> SavingsModel:
    tiers = [
        _tier("Recoverable", "High", RECOVERABLE_RULES, findings,
              "Money already paid out that a debit note can pull back."),
        _tier("Avoidable", "Medium", AVOIDABLE_RULES, findings,
              "(unit price − peer median) × volume, after SKU resolution."),
        _tier("Negotiable", "Modelled", NEGOTIABLE_RULES, findings,
              "Consolidation and terms, achievable but not yet agreed."),
    ]
    total = sum(t.amount for t in tiers)
    share = (total / spend_analysed * 100) if spend_analysed else 0.0
    derivation = (
        " + ".join(f"{t.name} {inr(t.amount)}" for t in tiers)
        + f" = {inr(total)} on {inr(spend_analysed)} analysed = {share:.2f}% of spend."
    )
    return SavingsModel(tiers=tiers, total=total,
                        spend_analysed=spend_analysed, derivation=derivation)
