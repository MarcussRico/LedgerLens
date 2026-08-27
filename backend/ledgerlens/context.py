"""
AnalysisContext — what every detector receives, and the only thing it may read.

The frames here are already resolved: vendor aliases collapsed, SKUs normalised,
tax and dates canonicalised. A detector never touches a raw file and never
re-resolves anything, so two detectors can never disagree about who a vendor is.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from functools import cached_property
from typing import TYPE_CHECKING

import duckdb
import pandas as pd

from ledgerlens.config import AnalysisConfig

if TYPE_CHECKING:
    pass


@dataclass(slots=True)
class RejectedRows:
    """Malformed rows are never silently dropped. The count is surfaced in the
    UI and the reasons are inspectable."""

    frame: pd.DataFrame = field(default_factory=pd.DataFrame)

    @property
    def count(self) -> int:
        return len(self.frame)

    def reasons(self) -> dict[str, int]:
        if self.frame.empty or "reject_reason" not in self.frame.columns:
            return {}
        return self.frame["reject_reason"].value_counts().to_dict()


@dataclass
class AnalysisContext:
    invoices: pd.DataFrame
    pos: pd.DataFrame
    grns: pd.DataFrame
    vendors: pd.DataFrame
    skus: pd.DataFrame
    lines: pd.DataFrame              # exploded invoice line items, SKU-resolved
    employees: pd.DataFrame
    config: AnalysisConfig
    rejected: RejectedRows = field(default_factory=RejectedRows)
    #: alias vendor_id -> canonical entity_id, kept for evidence strings
    alias_map: dict[str, str] = field(default_factory=dict)

    # ── analytics ─────────────────────────────────────────────────────────
    @cached_property
    def db(self) -> duckdb.DuckDBPyConnection:
        """DuckDB over the resolved frames. Registered by name so detectors can
        express set-level questions in SQL instead of hand-rolled loops."""
        con = duckdb.connect(":memory:")
        for name in ("invoices", "pos", "grns", "vendors", "skus", "lines", "employees"):
            frame = getattr(self, name)
            con.register(name, frame if not frame.empty else _empty_like(name))
        return con

    def sql(self, query: str) -> pd.DataFrame:
        return self.db.execute(query).df()

    # ── convenience ───────────────────────────────────────────────────────
    def vendor_name(self, vendor_id: str) -> str:
        """Falls back to the id rather than raising. A missing optional column
        should degrade a finding's wording, never take the detector down."""
        if self.vendors.empty or "name" not in self.vendors.columns:
            return vendor_id
        if "vendor_id" not in self.vendors.columns:
            return vendor_id
        hit = self.vendors.loc[self.vendors["vendor_id"] == vendor_id, "name"]
        if not len(hit):
            return vendor_id
        value = hit.iloc[0]
        return vendor_id if pd.isna(value) else str(value)

    def is_msme(self, vendor_id: str) -> bool:
        if self.vendors.empty or "msme_registered" not in self.vendors.columns:
            return False
        hit = self.vendors.loc[self.vendors["vendor_id"] == vendor_id, "msme_registered"]
        return bool(hit.iloc[0]) if len(hit) else False

    @property
    def total_spend(self) -> float:
        return float(self.invoices["amount"].sum()) if not self.invoices.empty else 0.0

    def peer_median(self, sku_id: str) -> float | None:
        """Median unit price across vendors for a resolved SKU. Returns None
        when there are too few peers for a median to mean anything."""
        if self.lines.empty:
            return None
        rows = self.lines[self.lines["sku_id"] == sku_id]
        by_vendor = rows.groupby("vendor_id")["unit_price"].median()
        if len(by_vendor) < self.config.price_min_peers:
            return None
        return float(by_vendor.median())


_EMPTY_COLUMNS: dict[str, list[str]] = {
    "invoices": ["invoice_id", "vendor_id", "po_id", "invoice_date", "submitted_at",
                 "amount", "tax_amount", "currency", "gst_invoice_no", "status",
                 "cost_centre", "approver_id", "paid_at"],
    "pos": ["po_id", "vendor_id", "po_date", "amount", "approver_id", "requisition_by"],
    "grns": ["grn_id", "po_id", "grn_date", "received_qty", "ordered_qty"],
    "vendors": ["vendor_id", "name", "gstin", "pan", "bank_account", "address",
                "phone", "email_domain", "onboarded_at", "msme_registered"],
    "skus": ["sku_id", "canonical", "unit", "hsn", "category"],
    "lines": ["invoice_id", "vendor_id", "sku_id", "raw_description", "qty",
              "unit", "unit_price", "hsn", "tax_rate", "invoice_date"],
    "employees": ["employee_id", "name", "address", "phone", "bank_account", "department"],
}


def _empty_like(name: str) -> pd.DataFrame:
    return pd.DataFrame(columns=_EMPTY_COLUMNS.get(name, []))


def empty_context(config: AnalysisConfig | None = None) -> AnalysisContext:
    return AnalysisContext(
        invoices=_empty_like("invoices"), pos=_empty_like("pos"),
        grns=_empty_like("grns"), vendors=_empty_like("vendors"),
        skus=_empty_like("skus"), lines=_empty_like("lines"),
        employees=_empty_like("employees"),
        config=config or AnalysisConfig(),
    )
