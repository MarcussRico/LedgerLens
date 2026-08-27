"""
Normalisation: currency, tax, dates, units.

Date parsing is the quiet hazard on Indian data. 03/04/2026 is 3 April here and
4 March in a US-defaulted parser; getting it wrong silently shifts a third of
the corpus and every date-window detector reports nonsense. We infer the
convention from the column itself rather than trusting a default.
"""
from __future__ import annotations

import re

import pandas as pd

_MONEY_RE = re.compile(r"[^\d.\-]")

# Loose unit families -> canonical unit and a multiplier into it.
_UNIT_CANON: dict[str, tuple[str, float]] = {
    "nos": ("nos", 1), "no": ("nos", 1), "pcs": ("nos", 1), "pc": ("nos", 1),
    "piece": ("nos", 1), "pieces": ("nos", 1), "unit": ("nos", 1), "units": ("nos", 1),
    "each": ("nos", 1), "ea": ("nos", 1),
    "box": ("box", 1), "boxes": ("box", 1), "carton": ("box", 1),
    "kg": ("kg", 1), "kgs": ("kg", 1), "kilogram": ("kg", 1),
    "g": ("kg", 0.001), "gram": ("kg", 0.001), "grams": ("kg", 0.001),
    "mt": ("kg", 1000), "ton": ("kg", 1000), "tonne": ("kg", 1000), "tonnes": ("kg", 1000),
    "quintal": ("kg", 100),
    "l": ("l", 1), "ltr": ("l", 1), "litre": ("l", 1), "liter": ("l", 1), "litres": ("l", 1),
    "ml": ("l", 0.001),
    "m": ("m", 1), "mtr": ("m", 1), "metre": ("m", 1), "meter": ("m", 1),
    "cm": ("m", 0.01), "mm": ("m", 0.001), "ft": ("m", 0.3048),
    "ream": ("ream", 1), "reams": ("ream", 1),
    "roll": ("roll", 1), "rolls": ("roll", 1),
    "set": ("set", 1), "sets": ("set", 1),
    "month": ("month", 1), "months": ("month", 1), "mth": ("month", 1),
    "visit": ("visit", 1), "trip": ("trip", 1), "hour": ("hour", 1), "hr": ("hour", 1),
}


def to_money(s: pd.Series) -> pd.Series:
    """'₹1,24,500.00' / '(1,234)' / '1 234' -> float. Lakh-crore grouping is
    just commas, so stripping non-numerics is safe and locale-proof."""
    if s.empty:
        return pd.Series(dtype="float64")
    txt = s.astype(str).str.strip()
    negative = txt.str.match(r"^\(.*\)$")           # accounting parentheses
    cleaned = txt.str.replace(_MONEY_RE, "", regex=True)
    out = pd.to_numeric(cleaned, errors="coerce")
    return out.where(~negative, -out)


def infer_dayfirst(s: pd.Series) -> bool:
    """True when the column can only be day-first.

    If any first component exceeds 12 it must be a day. If any second component
    exceeds 12 it must be month-first. Ambiguous columns default to day-first,
    because this is Indian procurement data.
    """
    sample = s.dropna().astype(str).str.strip().head(500)
    first_gt12 = second_gt12 = 0
    for v in sample:
        m = re.match(r"^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})", v)
        if not m:
            continue
        a, b = int(m.group(1)), int(m.group(2))
        if a > 12:
            first_gt12 += 1
        if b > 12:
            second_gt12 += 1
    if second_gt12 > first_gt12:
        return False
    return True


def to_datetime(s: pd.Series, *, dayfirst: bool | None = None) -> pd.Series:
    if s.empty:
        return pd.Series(dtype="datetime64[ns]")
    if dayfirst is None:
        dayfirst = infer_dayfirst(s)
    return pd.to_datetime(s, errors="coerce", dayfirst=dayfirst, format="mixed")


def canon_unit(raw: str | float | None) -> tuple[str, float]:
    """'MT' -> ('kg', 1000). Returns the canonical unit and the multiplier that
    converts a quantity in the raw unit into it."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ("nos", 1.0)
    key = re.sub(r"[^a-z]", "", str(raw).lower())
    return _UNIT_CANON.get(key, (key or "nos", 1.0))


def normalise_units(lines: pd.DataFrame) -> pd.DataFrame:
    """Convert qty and unit_price into a canonical unit so two vendors quoting
    the same item in MT and kg become comparable. Unit prices are divided by the
    same factor quantities are multiplied by, so line value is preserved."""
    if lines.empty:
        return lines
    out = lines.copy()
    canon = out["unit"].map(canon_unit) if "unit" in out.columns else None
    if canon is None:
        out["unit_canonical"] = "nos"
        out["qty_canonical"] = out.get("qty", 0)
        out["unit_price_canonical"] = out.get("unit_price", 0)
        return out
    out["unit_canonical"] = [c[0] for c in canon]
    factor = pd.Series([c[1] for c in canon], index=out.index)
    out["qty_canonical"] = pd.to_numeric(out["qty"], errors="coerce") * factor
    out["unit_price_canonical"] = (
        pd.to_numeric(out["unit_price"], errors="coerce") / factor
    )
    return out


def split_tax(df: pd.DataFrame) -> pd.DataFrame:
    """Make `amount` mean the same thing on every row.

    Files vary on whether `amount` includes tax. Where both a total and a tax
    figure exist we derive net; where a tax rate exists we derive tax. We never
    invent a tax figure that cannot be derived — the column stays null.
    """
    if df.empty:
        return df
    out = df.copy()
    amount = to_money(out["amount"]) if "amount" in out.columns else pd.Series(dtype=float)
    tax = to_money(out["tax_amount"]) if "tax_amount" in out.columns else pd.Series(
        [pd.NA] * len(out), index=out.index, dtype="object"
    )
    tax = pd.to_numeric(tax, errors="coerce")

    if "tax_rate" in out.columns:
        rate = pd.to_numeric(out["tax_rate"], errors="coerce")
        rate = rate.where(rate <= 1, rate / 100.0)          # 18 and 0.18 both mean 18%
        derived = amount - (amount / (1 + rate))
        tax = tax.fillna(derived)

    out["amount_gross"] = amount
    out["tax_amount"] = tax
    out["amount_net"] = (amount - tax.fillna(0)).round(2)
    out["amount"] = amount
    return out
