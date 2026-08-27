"""File readers. Everything lands as a DataFrame of strings; typing happens in
validation, where a failure can be attributed to a row and a reason."""
from __future__ import annotations

import io
from pathlib import Path

import pandas as pd


def read_any(data: bytes, filename: str) -> pd.DataFrame:
    suffix = Path(filename).suffix.lower()
    if suffix in {".xlsx", ".xls", ".xlsm"}:
        return pd.read_excel(io.BytesIO(data), dtype=str)
    if suffix in {".json",}:
        return pd.read_json(io.BytesIO(data), dtype=str)
    return _read_csv(data)


def _read_csv(data: bytes) -> pd.DataFrame:
    """Real exports arrive in whatever encoding and delimiter the ERP felt like."""
    last: Exception | None = None
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return pd.read_csv(
                io.BytesIO(data), dtype=str, sep=None, engine="python",
                encoding=encoding, on_bad_lines="warn", skipinitialspace=True,
            )
        except Exception as exc:      # noqa: BLE001 - try the next encoding
            last = exc
    raise ValueError(f"could not parse file as CSV: {last}")
