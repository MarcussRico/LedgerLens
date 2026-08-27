"""
Analysis configuration. Everything a detector might otherwise hardcode lives
here, so a client with a ₹1,00,000 approval limit is a config change and not a
code change.
"""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class AnalysisConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    # ── organisation facts ────────────────────────────────────────────────
    client_name: str = "Client"
    currency: str = "INR"
    fiscal_year_start_month: int = Field(default=4, ge=1, le=12)  # India: April
    headcount: int | None = None

    # ── approval controls ─────────────────────────────────────────────────
    approval_thresholds: list[float] = Field(default_factory=lambda: [50_000.0])
    split_window_days: int = 7
    split_min_orders: int = 3
    #: an order this close to a threshold is "hugging" it
    threshold_hug_band: float = 0.12

    # ── duplicate tolerances ──────────────────────────────────────────────
    dup_amount_tolerance: float = 0.01     # ±1%
    dup_date_window_days: int = 7
    dup_levenshtein_max: int = 2

    # ── price ─────────────────────────────────────────────────────────────
    price_deviation_min: float = 0.10      # flag above +10% of peer median
    price_min_peers: int = 3               # a median needs a peer set
    creep_min_quarters: int = 4
    creep_min_r2: float = 0.75

    # ── compliance (India) ────────────────────────────────────────────────
    msme_payment_limit_days: int = 45      # s.43B(h)
    po_tolerance: float = 0.05             # invoice may exceed PO by 5%
    grn_tolerance: float = 0.02

    # ── behavioural ───────────────────────────────────────────────────────
    off_hours_start: int = 22
    off_hours_end: int = 6
    benford_min_sample: int = 300
    benford_alpha: float = 0.01
    year_end_multiple: float = 2.0

    # ── how much of a modelled opportunity is actually realisable ─────────
    #: Not all volume can move. Contracts run, lead times bind, specs are
    #: qualified to a supplier. Claiming the whole book could shift to the
    #: cheapest price ever seen is a ceiling, not a saving.
    switchable_volume_share: float = 0.35
    #: Benchmark against the lower quartile of peer prices rather than the
    #: single minimum. One cheap invoice is not a price you can buy at.
    counterfactual_percentile: float = 0.25
    #: An opportunity below this is not worth a procurement manager's morning.
    #: Without a floor, the counterfactual and consolidation detectors fire on
    #: every SKU with three suppliers and bury the findings that matter.
    opportunity_min_value: float = 25_000.0
    #: …and it must also be a meaningful share of that item's own spend.
    opportunity_min_share: float = 0.03

    #: Total savings above this share of spend are implausible on their face and
    #: are surfaced as a warning rather than presented as a clean claim.
    savings_plausibility_ceiling: float = 0.05

    # ── vendor-ring link evidence ─────────────────────────────────────────
    #: How discriminating each shared attribute is. Two vendors paid into one
    #: bank account are, for payment purposes, one payee — that is close to
    #: conclusive. Two vendors on gmail.com are two small businesses.
    ring_attribute_weight: dict[str, float] = Field(
        default_factory=lambda: {
            "bank account": 1.00,
            "PAN": 0.95,
            "registered address": 0.55,
            "phone number": 0.45,
            "email domain": 0.20,
        }
    )
    #: Combined evidence a link must carry before it forms a ring. At 1.0 a
    #: shared bank account qualifies alone; an address plus a phone qualifies;
    #: a shared email domain alone never does.
    ring_link_threshold: float = 1.0
    #: Attributes whose weight is discounted when many vendors share the value.
    #: A bank account is not less suspicious for being shared by three vendors —
    #: it is more so — hence it is absent here.
    ring_prevalence_discounted: list[str] = Field(
        default_factory=lambda: ["registered address", "phone number", "email domain"]
    )
    #: Domains that carry no identity signal at all.
    ring_ignored_domains: list[str] = Field(
        default_factory=lambda: [
            "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "hotmail.com",
            "outlook.com", "live.com", "rediffmail.com", "aol.com", "protonmail.com",
            "icloud.com", "zoho.com", "mail.com", "yandex.com", "gmx.com",
        ]
    )

    # ── scoring ───────────────────────────────────────────────────────────
    pillar_weights: dict[str, float] = Field(
        default_factory=lambda: {
            "DUP": 25.0, "PRC": 20.0, "BHV": 25.0, "VND": 20.0, "CMP": 10.0,
        }
    )

    # ── baseline-poisoning defence ────────────────────────────────────────
    #: When the client's own history may itself be forged, every
    #: self-referential detector is blind. This disables them and runs only
    #: baseline-free tests: mathematical invariants, external reference,
    #: internal cross-consistency, and structural (shared-attribute) facts.
    zero_trust: bool = False

    # ── determinism ───────────────────────────────────────────────────────
    seed: int = 20260827

    def thresholds_sorted(self) -> list[float]:
        return sorted(self.approval_thresholds)
