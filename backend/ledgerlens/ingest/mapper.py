"""
Map a real file's columns onto the canonical schema.

Order matters and is not negotiable:
  1. exact canonical name
  2. known alias
  3. value shape (a GSTIN column is a GSTIN column whatever it is called)
  4. LLM — only for columns 1-3 could not place, and it returns a *mapping*

Every mapping records how it was decided, so a wrong column is diagnosable.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import pandas as pd

from ledgerlens import llm
from ledgerlens.ingest.profile import FileProfile, profile_frame
from ledgerlens.ingest.schema import (
    GRN_FIELDS, INVOICE_FIELDS, LINE_FIELDS, PO_FIELDS, VENDOR_FIELDS,
    deterministic_match,
)

log = logging.getLogger(__name__)

KIND_FIELDS = {
    "invoices": INVOICE_FIELDS + ["paid_at"],
    "pos": PO_FIELDS,
    "grns": GRN_FIELDS,
    "vendors": VENDOR_FIELDS,
    "lines": LINE_FIELDS,
}


@dataclass
class ColumnMapping:
    source: str
    target: str
    method: str            # exact | alias | value-shape | llm
    confidence: float


@dataclass
class MappingResult:
    kind: str
    mappings: list[ColumnMapping]
    unmapped: list[str]
    profile: FileProfile

    def as_dict(self) -> dict[str, str]:
        return {m.source: m.target for m in self.mappings}

    def report(self) -> dict:
        return {
            "kind": self.kind,
            "mapped": [
                {"source": m.source, "target": m.target,
                 "method": m.method, "confidence": m.confidence}
                for m in self.mappings
            ],
            "unmapped": self.unmapped,
            "llm_used": any(m.method == "llm" for m in self.mappings),
        }


_SYSTEM = (
    "You map spreadsheet column headers onto a fixed procurement schema. "
    "You return JSON only. You never invent, transform or return data values — "
    "only a mapping from source column name to canonical field name. "
    "If a column has no good match, map it to null. Never guess to fill a slot."
)


def map_columns(df: pd.DataFrame, kind: str, *, use_llm: bool = True) -> MappingResult:
    allowed = set(KIND_FIELDS.get(kind, []))
    prof = profile_frame(df)
    mappings: list[ColumnMapping] = []
    taken: set[str] = set()

    # 1 + 2 — exact and alias
    for col in prof.columns:
        target = deterministic_match(col.name)
        if target and target in allowed and target not in taken:
            method = "exact" if col.name.lower() == target else "alias"
            mappings.append(ColumnMapping(col.name, target, method, 1.0))
            taken.add(target)

    mapped_sources = {m.source for m in mappings}

    # 3 — value shape
    for col in prof.columns:
        if col.name in mapped_sources or not col.value_hint:
            continue
        if col.value_hint in allowed and col.value_hint not in taken:
            mappings.append(ColumnMapping(col.name, col.value_hint, "value-shape", 0.9))
            taken.add(col.value_hint)
            mapped_sources.add(col.name)

    leftover = [c for c in prof.columns if c.name not in mapped_sources]
    remaining = sorted(allowed - taken)

    # 4 — LLM, mapping only, and only for what is genuinely unplaced
    if leftover and remaining and use_llm and llm.available():
        payload = {
            "candidate_fields": remaining,
            "columns": [
                {"name": c.name, "dtype": c.dtype, "null_rate": c.null_rate,
                 "cardinality": c.cardinality, "samples": c.samples}
                for c in leftover
            ],
        }
        got = llm.complete_json(
            _SYSTEM,
            "Map each column to one candidate field or null.\n"
            'Respond as {"mapping": {"<column name>": "<field or null>"}}.\n\n'
            + json.dumps(payload, ensure_ascii=False),
        )
        if got:
            for source, target in (got.get("mapping") or {}).items():
                if (target in remaining and target not in taken
                        and any(c.name == source for c in leftover)):
                    mappings.append(ColumnMapping(source, target, "llm", 0.7))
                    taken.add(target)
                    mapped_sources.add(source)

    return MappingResult(
        kind=kind,
        mappings=mappings,
        unmapped=[c.name for c in prof.columns if c.name not in mapped_sources],
        profile=prof,
    )


def apply_mapping(df: pd.DataFrame, result: MappingResult) -> pd.DataFrame:
    """Rename to canonical names and drop what we could not place. Dropped
    columns are reported, never silently discarded."""
    out = df.rename(columns=result.as_dict())
    keep = [c for c in out.columns if c in set(KIND_FIELDS.get(result.kind, []))]
    return out[keep].copy()
