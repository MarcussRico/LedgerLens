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
