"""
The two contracts every other module is written against.

Nothing crosses a module boundary as a bare dict. A detector that returns a
Finding without the fields it actually compared in `evidence` is a bug, not a
style problem — the evidence drawer renders those fields directly.
"""
from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Pillar(StrEnum):
    DUPLICATES = "Duplicates & Overpayment"
    PRICE = "Price & Vendor Intelligence"
    BEHAVIOURAL = "Behavioural Anomalies"
    INTEGRITY = "Vendor Integrity & Collusion"
    COMPLIANCE = "Compliance & Process"


PILLAR_PREFIX: dict[str, Pillar] = {
    "DUP": Pillar.DUPLICATES,
    "PRC": Pillar.PRICE,
    "BHV": Pillar.BEHAVIOURAL,
    "VND": Pillar.INTEGRITY,
    "CMP": Pillar.COMPLIANCE,
}

Severity = Literal["critical", "high", "medium", "low"]
ActionKind = Literal[
    "recover", "renegotiate", "block-payment", "investigate", "consolidate", "escalate"
]


class Entities(BaseModel):
    """What a finding is about. At least one of these must be populated."""

    model_config = ConfigDict(frozen=True)

    invoice_ids: list[str] = Field(default_factory=list)
    vendor_id: str | None = None
    po_ids: list[str] = Field(default_factory=list)
    employee_ids: list[str] = Field(default_factory=list)
    sku_ids: list[str] = Field(default_factory=list)


class Action(BaseModel):
    model_config = ConfigDict(frozen=True)

    kind: ActionKind
    label: str
    detail: str


class ScoreComponent(BaseModel):
    """One traceable contribution to a risk score. Points are integers so a
    decomposition always adds up exactly on screen."""

    model_config = ConfigDict(frozen=True)

    component: str
    points: int
    rule_id: str | None = None


# Language that would turn a statistical claim into an accusation.
# Findings are claims, not verdicts — see the hard rules.
_FORBIDDEN = ("is fraud", "committed fraud", "fraudulent", "is stealing", "guilty")


class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    rule_id: str
    pillar: Pillar
    severity: Severity
    entities: Entities
    evidence: dict[str, Any]
    money_at_risk: float
    confidence: float = Field(ge=0.0, le=1.0)
    explanation: str
    recommended_action: Action
    score_contribution: list[ScoreComponent] = Field(default_factory=list)
    detected_at: str | None = None

    @field_validator("evidence")
    @classmethod
    def _evidence_not_empty(cls, v: dict[str, Any]) -> dict[str, Any]:
        if not v:
            raise ValueError(
                "a Finding must carry the exact fields its rule compared; "
                "empty evidence is a bug"
            )
        return v

    @field_validator("money_at_risk")
    @classmethod
    def _money_sane(cls, v: float) -> float:
        if v < 0:
            raise ValueError("money_at_risk is an exposure, never negative")
        return v

    @field_validator("explanation")
    @classmethod
    def _no_accusation(cls, v: str) -> str:
        low = v.lower()
        for phrase in _FORBIDDEN:
            if phrase in low:
                raise ValueError(
                    f"explanation reads as a verdict, not a claim: {phrase!r}. "
                    "Findings describe what the data is consistent with."
                )
        return v

    @field_validator("rule_id")
    @classmethod
    def _known_prefix(cls, v: str) -> str:
        prefix = v.split("-")[0]
        if prefix not in PILLAR_PREFIX:
            raise ValueError(f"unknown rule prefix {prefix!r} in rule_id {v!r}")
        return v


@runtime_checkable
class Detector(Protocol):
    """Pure: (ctx) -> list[Finding]. No I/O, no global state, no re-resolution.

    Detectors receive already-resolved frames. A detector that inspects a single
    row in isolation does not belong here — the whole point is the relationship
    between records.
    """

    rule_id: str
    pillar: Pillar
    name: str
    baseline_free: bool
    opportunity: bool

    def run(self, ctx: "AnalysisContext") -> list[Finding]: ...


# AnalysisContext lives in context.py; imported lazily to avoid a cycle.
from ledgerlens.context import AnalysisContext  # noqa: E402  (contract completion)

Finding.model_rebuild()
