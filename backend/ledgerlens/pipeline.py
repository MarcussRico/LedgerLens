"""
The pipeline: bytes in, AnalysisContext out.

    read -> profile -> map -> validate -> normalise -> resolve -> context

Resolution is the last step before detectors run, and it runs exactly once.
Detectors receive resolved frames and never re-resolve anything.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

import pandas as pd

from ledgerlens.config import AnalysisConfig
from ledgerlens.context import AnalysisContext, RejectedRows, _empty_like
from ledgerlens.ingest.mapper import apply_mapping, map_columns
from ledgerlens.ingest.normalise import normalise_units, split_tax
from ledgerlens.ingest.readers import read_any
from ledgerlens.ingest.validate import validate
from ledgerlens.resolve.skus import resolve_skus
from ledgerlens.resolve.vendors import apply_resolution, resolve_vendors

log = logging.getLogger(__name__)

KINDS = ("invoices", "pos", "grns", "vendors", "lines", "employees")
#: derived frames the pipeline produces rather than reads from a file
DERIVED = ("skus",)


@dataclass
class SourceFile:
    kind: str
    filename: str
    data: bytes


@dataclass
class IngestReport:
    """Everything a user needs to trust — or distrust — the load."""

    mappings: dict[str, dict] = field(default_factory=dict)
    row_counts: dict[str, int] = field(default_factory=dict)
    rejected_counts: dict[str, int] = field(default_factory=dict)
    reject_reasons: dict[str, dict[str, int]] = field(default_factory=dict)
    vendor_merges: list[dict] = field(default_factory=list)
    entities_before: int = 0
    entities_after: int = 0
    skus_resolved: int = 0
    sku_variants: int = 0

    def as_dict(self) -> dict:
        return {
            "mappings": self.mappings,
            "row_counts": self.row_counts,
            "rejected_counts": self.rejected_counts,
            "reject_reasons": self.reject_reasons,
            "vendor_merges": self.vendor_merges[:50],
            "resolution": {
                "vendor_records": self.entities_before,
                "resolved_entities": self.entities_after,
                "skus_resolved": self.skus_resolved,
                "raw_sku_variants": self.sku_variants,
            },
        }


def build_context(
    sources: list[SourceFile],
    config: AnalysisConfig | None = None,
    *,
    use_llm: bool = True,
) -> tuple[AnalysisContext, IngestReport]:
    config = config or AnalysisConfig()
    report = IngestReport()
    frames: dict[str, pd.DataFrame] = {k: _empty_like(k) for k in (*KINDS, *DERIVED)}
    rejects: list[pd.DataFrame] = []

    for src in sources:
        if src.kind not in KINDS:
            log.warning("unknown source kind %r, skipped", src.kind)
            continue
        raw = read_any(src.data, src.filename)
        mapping = map_columns(raw, src.kind, use_llm=use_llm)
        report.mappings[src.kind] = mapping.report()

        mapped = apply_mapping(raw, mapping)
        clean, bad = validate(mapped, src.kind)

        if src.kind in ("invoices", "pos"):
            clean = split_tax(clean)

        existing = frames[src.kind]
        frames[src.kind] = (
            clean if existing.empty else pd.concat([existing, clean], ignore_index=True)
        )
        report.row_counts[src.kind] = len(frames[src.kind])
        report.rejected_counts[src.kind] = len(bad)
        if not bad.empty:
            bad = bad.assign(source_kind=src.kind)
            report.reject_reasons[src.kind] = bad["reject_reason"].value_counts().to_dict()
            rejects.append(bad)

    # ── vendor identity, once ─────────────────────────────────────────────
    alias_map: dict[str, str] = {}
    if not frames["vendors"].empty:
        report.entities_before = len(frames["vendors"])
        resolved, alias_map, merges = resolve_vendors(frames["vendors"])
        frames["vendors"] = resolved
        report.vendor_merges = merges
        apply_resolution(frames, alias_map)
        # Collapse alias rows into one row per resolved entity. The original
        # vendor_id must be dropped first: keeping it and renaming entity_id
        # onto the same name yields a frame with two vendor_id columns, and
        # every df["vendor_id"] lookup downstream then returns a DataFrame.
        collapsed = (
            resolved.sort_values("vendor_id")
                    .groupby("entity_id", as_index=False)
                    .first()
                    .drop(columns=["vendor_id"], errors="ignore")
                    .rename(columns={"entity_id": "vendor_id"})
        )
        if "entity_name" in collapsed.columns:
            collapsed["name"] = collapsed["entity_name"]
        frames["vendors"] = collapsed
        report.entities_after = len(frames["vendors"])

    # ── line items: attach vendor, normalise units, resolve SKUs ──────────
    lines = frames["lines"]
    if not lines.empty:
        if "vendor_id" not in lines.columns and not frames["invoices"].empty:
            lines = lines.merge(
                frames["invoices"][["invoice_id", "vendor_id", "invoice_date"]],
                on="invoice_id", how="left",
            )
        report.sku_variants = int(lines["raw_description"].nunique()) if "raw_description" in lines else 0
        lines = normalise_units(lines)
        lines, catalogue = resolve_skus(lines)
        frames["lines"] = lines
        frames["skus"] = catalogue
        report.skus_resolved = len(catalogue)

    ctx = AnalysisContext(
        invoices=frames["invoices"], pos=frames["pos"], grns=frames["grns"],
        vendors=frames["vendors"], skus=frames["skus"], lines=frames["lines"],
        employees=frames["employees"], config=config,
        rejected=RejectedRows(
            pd.concat(rejects, ignore_index=True) if rejects else pd.DataFrame()
        ),
        alias_map=alias_map,
    )
    return ctx, report
