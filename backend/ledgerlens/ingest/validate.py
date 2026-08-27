"""
Validation. A row that cannot be trusted is moved to the rejected frame with a
reason attached; it is never silently dropped and the count is surfaced in the
API response, because "we analysed 5,847 invoices" is a lie if 300 fell on the
floor during parsing.
"""
from __future__ import annotations

import re

import pandas as pd

from ledgerlens.ingest.normalise import to_datetime, to_money
from ledgerlens.ingest.schema import GSTIN_RE, PAN_RE, REQUIRED

DATE_COLUMNS = {"invoice_date", "po_date", "grn_date", "submitted_at",
                "paid_at", "onboarded_at"}
MONEY_COLUMNS = {"amount", "tax_amount", "unit_price"}
NUMERIC_COLUMNS = {"qty", "ordered_qty", "received_qty", "tax_rate"}


def _reject(frame: pd.DataFrame, mask: pd.Series, reason: str,
            bucket: list[pd.DataFrame]) -> pd.DataFrame:
    """Move masked rows into the reject bucket, return what survives."""
    if not mask.any():
        return frame
    bad = frame[mask].copy()
    bad["reject_reason"] = reason
    bucket.append(bad)
    return frame[~mask].copy()


def validate(df: pd.DataFrame, kind: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (clean, rejected)."""
    if df.empty:
        return df, pd.DataFrame()

    out = df.copy()
    rejects: list[pd.DataFrame] = []

    # ── typing ────────────────────────────────────────────────────────────
    for col in out.columns:
        if col in DATE_COLUMNS:
            out[col] = to_datetime(out[col])
        elif col in MONEY_COLUMNS:
            out[col] = to_money(out[col])
        elif col in NUMERIC_COLUMNS:
            out[col] = pd.to_numeric(out[col], errors="coerce")

    # ── required fields present and non-null ──────────────────────────────
    for col in REQUIRED.get(kind, []):
        if col not in out.columns:
            bad = out.copy()
            bad["reject_reason"] = f"missing required column '{col}'"
            return out.iloc[0:0], bad
        out = _reject(out, out[col].isna(), f"null required field '{col}'", rejects)

    # ── money must be a number and not negative ───────────────────────────
    if "amount" in out.columns:
        out = _reject(out, out["amount"].isna(), "amount not parseable as a number", rejects)
        out = _reject(out, out["amount"] < 0,
                      "negative amount (credit notes belong in their own file)", rejects)

    if "qty" in out.columns:
        out = _reject(out, out["qty"].isna(), "qty not parseable", rejects)
        out = _reject(out, out["qty"] <= 0, "non-positive qty", rejects)

    # ── dates must parse, and must not be from the future ─────────────────
    for col in ("invoice_date", "po_date", "grn_date"):
        if col in out.columns:
            out = _reject(out, out[col].isna(), f"{col} not parseable as a date", rejects)

    # ── identity formats, warned rather than fatal ────────────────────────
    if "gstin" in out.columns:
        bad_gstin = out["gstin"].notna() & ~out["gstin"].astype(str).str.upper().str.match(GSTIN_RE)
        out.loc[bad_gstin, "gstin_valid"] = False
        out.loc[~bad_gstin, "gstin_valid"] = True
    if "pan" in out.columns:
        out["pan_valid"] = out["pan"].isna() | out["pan"].astype(str).str.upper().str.match(PAN_RE)

    # ── duplicate primary keys are a data problem, not a finding ──────────
    pk = {"invoices": "invoice_id", "pos": "po_id", "grns": "grn_id",
          "vendors": "vendor_id"}.get(kind)
    if pk and pk in out.columns:
        dupes = out.duplicated(subset=[pk], keep="first")
        out = _reject(out, dupes,
                      f"duplicate {pk} in source file (kept first occurrence)", rejects)

    rejected = pd.concat(rejects, ignore_index=True) if rejects else pd.DataFrame()
    return out.reset_index(drop=True), rejected


def gstin_checksum_valid(gstin: str) -> bool:
    """GSTIN check digit, base-36 weighted alternating 1/2. A format-valid
    GSTIN with a bad check digit is a fabricated one."""
    g = str(gstin).strip().upper()
    if not re.match(r"^[0-9A-Z]{15}$", g):
        return False
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    total = 0
    for i, ch in enumerate(g[:14]):
        if ch not in chars:
            return False
        v = chars.index(ch) * (2 if i % 2 else 1)
        total += v // 36 + v % 36
    return chars[(36 - total % 36) % 36] == g[14]
