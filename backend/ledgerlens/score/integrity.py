"""
Data Integrity Score — grade the ledger before analysing it.

Every other number this engine produces assumes the records are a broadly honest
account of what happened. That assumption deserves a test of its own. If the
books look manufactured, that is finding zero, and everything downstream should
be read in its light.

Each check is a mathematical invariant: it holds for real accounting data
whatever the business does, so none of it needs a baseline from the client. That
is also why these survive `zero_trust`.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

# Expected first-digit frequencies under Benford's Law.
BENFORD_1 = {d: math.log10(1 + 1 / d) for d in range(1, 10)}
# Expected second-digit frequencies.
BENFORD_2 = {
    d: sum(math.log10(1 + 1 / (10 * k + d)) for k in range(1, 10))
    for d in range(0, 10)
}


@dataclass
class Check:
    name: str
    score: float                 # 0-1, 1 = indistinguishable from real data
    weight: float
    observed: str
    expected: str
    verdict: str
    applicable: bool = True

    def as_dict(self) -> dict:
        return {
            "name": self.name,
            "score": round(self.score, 4),
            "weight": self.weight,
            "observed": self.observed,
            "expected": self.expected,
            "verdict": self.verdict,
            "applicable": self.applicable,
        }


@dataclass
class DataIntegrity:
    score: int                   # 0-100
    band: str
    headline: str
    checks: list[Check] = field(default_factory=list)
    sample_size: int = 0

    def as_dict(self) -> dict:
        return {
            "score": self.score,
            "band": self.band,
            "headline": self.headline,
            "sample_size": self.sample_size,
            "checks": [c.as_dict() for c in self.checks],
        }


def _band(score: int) -> str:
    if score >= 85:
        return "consistent with genuine records"
    if score >= 70:
        return "broadly consistent, with exceptions"
    if score >= 50:
        return "irregular — read findings with care"
    return "does not behave like organically generated data"


def _conformity_from_chi2(chi2: float, df: int) -> float:
    """Map a χ² statistic onto 0-1. At the 1% critical value the score is 0.5,
    so a dataset that just fails significance sits mid-scale rather than at an
    extreme — this is a grade, not a hypothesis test."""
    critical = {8: 20.090, 9: 21.666}.get(df, 20.090)
    return float(max(0.0, min(1.0, 1.0 / (1.0 + chi2 / critical))))


def _benford_first(amounts: pd.Series) -> Check:
    vals = amounts[amounts > 0]
    n = len(vals)
    if n < 200:
        return Check("Benford, first digit", 1.0, 0.0, f"{n} amounts",
                     "at least 200", "Too few amounts to test.", applicable=False)
    lead = (vals.astype(str).str.replace(r"[^1-9]", "", regex=True).str[:1])
    lead = pd.to_numeric(lead, errors="coerce").dropna().astype(int)
    counts = lead.value_counts().reindex(range(1, 10), fill_value=0)
    total = int(counts.sum())
    expected = pd.Series({d: BENFORD_1[d] * total for d in range(1, 10)})
    chi2 = float((((counts - expected) ** 2) / expected).sum())
    score = _conformity_from_chi2(chi2, 8)
    deviation = counts / total - pd.Series(BENFORD_1)
    worst = int(deviation.abs().idxmax())
    direction = "over" if deviation[worst] > 0 else "under"
    return Check(
        "Benford, first digit", score, 0.28,
        f"χ² {chi2:.1f} · digit {worst} at {counts[worst] / total * 100:.1f}%",
        f"χ² below 20.1 · digit {worst} near {BENFORD_1[worst] * 100:.1f}%",
        ("Leading digits follow the expected logarithmic curve."
         if score > 0.6 else
         f"Leading digits depart from the expected curve; digit {worst} is "
         f"{direction}-represented at {counts[worst] / total * 100:.1f}% against "
         f"{BENFORD_1[worst] * 100:.1f}% expected."),
    )


def _benford_second(amounts: pd.Series) -> Check:
    vals = amounts[amounts >= 10]
    n = len(vals)
    if n < 400:
        return Check("Benford, second digit", 1.0, 0.0, f"{n} amounts",
                     "at least 400", "Too few amounts to test.", applicable=False)
    digits = (vals.astype(str).str.replace(r"[^0-9]", "", regex=True)
                  .str.lstrip("0").str[1:2])
    digits = pd.to_numeric(digits, errors="coerce").dropna().astype(int)
    counts = digits.value_counts().reindex(range(0, 10), fill_value=0)
    total = int(counts.sum())
    if total < 400:
        return Check("Benford, second digit", 1.0, 0.0, f"{total} usable",
                     "at least 400", "Too few amounts to test.", applicable=False)
    expected = pd.Series({d: BENFORD_2[d] * total for d in range(0, 10)})
    chi2 = float((((counts - expected) ** 2) / expected).sum())
    score = _conformity_from_chi2(chi2, 9)
    return Check(
        "Benford, second digit", score, 0.16, f"χ² {chi2:.1f}", "χ² below 21.7",
        ("Second digits behave normally — a harder test to fake than the first."
         if score > 0.6 else
         "Second digits are irregular. Fabricated figures usually pass the "
         "first-digit test and fail this one."),
    )


def _round_numbers(amounts: pd.Series) -> Check:
    n = len(amounts)
    if n < 50:
        return Check("Round-number rate", 1.0, 0.0, f"{n} amounts", "at least 50",
                     "Too few amounts to test.", applicable=False)
    rate = float((amounts % 1000 == 0).mean())
    # invoice totals carry tax and quantities; they rarely land on round figures
    score = float(max(0.0, min(1.0, 1.0 - (rate - 0.02) / 0.30)))
    return Check(
        "Round-number rate", score, 0.20,
        f"{rate * 100:.1f}% are exact multiples of ₹1,000", "under ~5%",
        ("Amounts look computed rather than chosen."
         if rate < 0.08 else
         f"{rate * 100:.0f}% of amounts are round thousands. Figures derived "
         f"from quantities and tax rates almost never land there."),
    )


def _terminal_digits(amounts: pd.Series) -> Check:
    vals = amounts[amounts >= 100]
    n = len(vals)
    if n < 200:
        return Check("Terminal digit uniformity", 1.0, 0.0, f"{n} amounts",
                     "at least 200", "Too few amounts to test.", applicable=False)
    last2 = (vals.astype(float).round(0).astype("int64") % 100)
    counts = last2.value_counts().reindex(range(100), fill_value=0)
    expected = n / 100
    chi2 = float((((counts - expected) ** 2) / expected).sum())
    # 99 df; the 1% critical value is about 135
    score = float(max(0.0, min(1.0, 1.0 / (1.0 + chi2 / 135.0))))
    top = int(counts.idxmax())
    return Check(
        "Terminal digit uniformity", score, 0.16,
        f"χ² {chi2:.0f} · '{top:02d}' most common at {counts[top] / n * 100:.1f}%",
        "roughly 1% per ending",
        ("The last two digits are near-uniform, as computed totals should be."
         if score > 0.5 else
         f"Endings cluster on '{top:02d}'. Real totals spread evenly across all "
         f"hundred endings."),
    )


def _timestamp_entropy(submitted: pd.Series) -> Check:
    stamps = pd.to_datetime(submitted, errors="coerce").dropna()
    n = len(stamps)
    if n < 100:
        return Check("Filing-time entropy", 1.0, 0.0, f"{n} timestamps",
                     "at least 100", "Too few timestamps to test.", applicable=False)
    hours = stamps.dt.hour.value_counts(normalize=True).reindex(range(24), fill_value=0)
    nonzero = hours[hours > 0]
    entropy = float(-(nonzero * np.log2(nonzero)).sum())
    # real filing concentrates in office hours: roughly 3.0-3.9 bits of 4.58
    score = float(max(0.0, min(1.0, entropy / 3.2)))
    return Check(
        "Filing-time entropy", score, 0.10,
        f"{entropy:.2f} bits across {int((hours > 0).sum())} distinct hours",
        "about 3.0-3.9 bits over a working day",
        ("Filing times spread across a working day as human activity does."
         if score > 0.7 else
         "Filing times are concentrated in very few hours, which is what bulk "
         "entry or generated timestamps look like."),
    )


def _duplicate_keys(invoices: pd.DataFrame) -> Check:
    if "invoice_id" not in invoices.columns or len(invoices) < 50:
        return Check("Identifier integrity", 1.0, 0.0, "not testable",
                     "unique ids", "No identifier column.", applicable=False)
    n = len(invoices)
    dupes = int(invoices["invoice_id"].duplicated().sum())
    rate = dupes / n
    score = float(max(0.0, min(1.0, 1.0 - rate / 0.05)))
    return Check(
        "Identifier integrity", score, 0.10,
        f"{dupes} repeated invoice ids in {n} rows", "none",
        ("Identifiers are unique, as a ledger requires."
         if dupes == 0 else
         f"{dupes} identifiers repeat. A ledger cannot issue the same document "
         f"number twice, so at least one of each pair is not what it claims."),
    )


def assess(ctx) -> DataIntegrity:
    """Grade the corpus itself. Runs before any finding is interpreted."""
    inv = ctx.invoices
    if inv.empty or "amount" not in inv.columns:
        return DataIntegrity(
            score=0, band="not assessable",
            headline="No invoice amounts were loaded, so the ledger cannot be graded.",
            checks=[], sample_size=0,
        )

    amounts = pd.to_numeric(inv["amount"], errors="coerce").dropna()
    checks = [
        _benford_first(amounts),
        _benford_second(amounts),
        _round_numbers(amounts),
        _terminal_digits(amounts),
        _duplicate_keys(inv),
    ]
    if "submitted_at" in inv.columns:
        checks.append(_timestamp_entropy(inv["submitted_at"]))

    usable = [c for c in checks if c.applicable and c.weight > 0]
    total_weight = sum(c.weight for c in usable)
    if not usable or total_weight == 0:
        return DataIntegrity(
            score=0, band="not assessable",
            headline=(f"Only {len(amounts)} amounts were loaded — too few for these "
                      f"tests to say anything. The grade is withheld rather than guessed."),
            checks=checks, sample_size=len(amounts),
        )

    score = int(round(sum(c.score * c.weight for c in usable) / total_weight * 100))
    band = _band(score)
    weakest = min(usable, key=lambda c: c.score)
    headline = (
        f"The ledger scores {score}/100 and is {band}."
        + ("" if weakest.score > 0.6 else f" The weakest signal is {weakest.name.lower()}: {weakest.verdict}")
    )
    return DataIntegrity(score=score, band=band, headline=headline,
                         checks=checks, sample_size=len(amounts))
