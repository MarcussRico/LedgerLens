"""Minimal frame builders. Each detector test hands in the smallest frame that
triggers it and one that does not — per the conventions in CLAUDE.md."""
from __future__ import annotations

import pandas as pd
import pytest

from ledgerlens.config import AnalysisConfig
from ledgerlens.context import AnalysisContext, _empty_like


def invoices(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    for col in ("invoice_date", "submitted_at", "paid_at"):
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], dayfirst=True, format="mixed")
    return df


def ctx_with(**frames) -> AnalysisContext:
    base = {k: _empty_like(k) for k in
            ("invoices", "pos", "grns", "vendors", "skus", "lines", "employees")}
    base.update(frames)
    return AnalysisContext(config=AnalysisConfig(), **base)


@pytest.fixture(autouse=True, scope="session")
def _load_detectors():
    from ledgerlens import registry
    registry.load_all()
