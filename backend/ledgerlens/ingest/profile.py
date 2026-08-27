"""
Profile a file before trying to map it. The profile is what the deterministic
matcher and (only if needed) the LLM both reason over — never the raw data.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

import pandas as pd

from ledgerlens.ingest.schema import VALUE_PROBES


@dataclass
class ColumnProfile:
    name: str
    dtype: str
    null_rate: float
    cardinality: int
    samples: list[str] = field(default_factory=list)
    #: canonical field suggested purely by the shape of the values
    value_hint: str | None = None
    numeric_share: float = 0.0
    date_share: float = 0.0


@dataclass
class FileProfile:
    rows: int
    columns: list[ColumnProfile]

    def to_dict(self) -> dict:
        return {"rows": self.rows, "columns": [asdict(c) for c in self.columns]}

    def unmapped(self, mapping: dict[str, str]) -> list[ColumnProfile]:
        return [c for c in self.columns if c.name not in mapping]


def _numeric_share(s: pd.Series) -> float:
    if s.empty:
        return 0.0
    coerced = pd.to_numeric(
        s.astype(str).str.replace(r"[,\s₹]", "", regex=True), errors="coerce"
    )
    return float(coerced.notna().mean())


def _date_share(s: pd.Series) -> float:
    if s.empty:
        return 0.0
    # dayfirst: Indian data is overwhelmingly DD/MM. Getting this backwards
    # silently shifts a third of the corpus, so it is an explicit choice.
    parsed = pd.to_datetime(s, errors="coerce", dayfirst=True, format="mixed")
    return float(parsed.notna().mean())


def _value_hint(s: pd.Series) -> str | None:
    vals = s.dropna().astype(str).str.strip().str.upper()
    if vals.empty:
        return None
    sample = vals.head(400)
    for probe in VALUE_PROBES:
        hit = sample.str.match(probe.pattern).mean()
        if hit >= probe.min_hit_rate:
            return probe.field
    return None


def profile_frame(df: pd.DataFrame, max_samples: int = 5) -> FileProfile:
    cols: list[ColumnProfile] = []
    for name in df.columns:
        s = df[name]
        non_null = s.dropna()
        samples = [str(v)[:60] for v in non_null.head(max_samples).tolist()]
        cols.append(
            ColumnProfile(
                name=str(name),
                dtype=str(s.dtype),
                null_rate=round(float(s.isna().mean()), 4),
                cardinality=int(non_null.nunique()),
                samples=samples,
                value_hint=_value_hint(s),
                numeric_share=round(_numeric_share(non_null), 3),
                date_share=round(_date_share(non_null), 3),
            )
        )
    return FileProfile(rows=len(df), columns=cols)
