"""
Write a realistic, messy sample dataset to CSV.

Deliberately not in our canonical schema: every header is what a real ERP export
would call it, so loading these files exercises the schema mapper rather than
skipping past it. The underlying corpus comes from the simulator, so the frauds
in it are known — the accompanying ground-truth file says exactly what was
planted and what should be found.

    python -m ledgerlens.eval.export_sample --out ../samples
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd

from ledgerlens.eval.generator import generate

#: canonical -> what a real export actually calls it
HEADERS: dict[str, dict[str, str]] = {
    "invoices": {
        "invoice_id": "Doc Ref", "vendor_id": "Party Code", "po_id": "PO Number",
        "invoice_date": "Txn Dt", "submitted_at": "Entry Timestamp",
        "amount": "Gross Val", "tax_amount": "Tax Amt", "currency": "Curr",
        "gst_invoice_no": "GST Invoice No", "status": "Status",
        "cost_centre": "Booked Under", "approver_id": "Sanctioned By",
        "paid_at": "Payment Dt",
    },
    "pos": {
        "po_id": "Order Ref", "vendor_id": "Party Code", "po_date": "Order Dt",
        "amount": "Order Val", "approver_id": "Sanctioned By",
        "requisition_by": "Indent Raised By", "ordered_qty": "Qty Ordered",
    },
    "grns": {
        "grn_id": "MRN No", "po_id": "Order Ref", "grn_date": "Receipt Dt",
        "received_qty": "Qty Received", "ordered_qty": "Qty Ordered",
    },
    "vendors": {
        "vendor_id": "Vendor Code", "name": "Supplier Name", "gstin": "GSTIN",
        "pan": "PAN", "bank_account": "Account Number",
        "address": "Registered Address", "phone": "Contact No",
        "email_domain": "Email Domain", "onboarded_at": "Vendor Since",
        "msme_registered": "MSME Regd", "category": "Spend Category",
    },
    "lines": {
        "invoice_id": "Doc Ref", "raw_description": "Particulars", "qty": "Qty",
        "unit": "UOM", "unit_price": "Rate", "hsn": "HSN/SAC", "tax_rate": "Tax %",
    },
    "employees": {
        "employee_id": "Emp Code", "name": "Employee Name",
        "address": "Residential Address", "phone": "Mobile",
        "bank_account": "Bank A/c", "department": "Dept",
    },
}


def _to_ddmmyyyy(series: pd.Series) -> pd.Series:
    """Indian exports are DD/MM/YYYY. Writing ISO would let a US-defaulted
    parser look correct by accident; this makes the pipeline prove it."""
    return pd.to_datetime(series, errors="coerce").dt.strftime("%d/%m/%Y")


def _to_ddmmyyyy_hhmm(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce").dt.strftime("%d/%m/%Y %H:%M")


def _grouped_inr(series: pd.Series) -> pd.Series:
    """Lakh-crore grouping with a currency symbol, as a real export emits it."""
    def fmt(v: object) -> str:
        try:
            n = float(v)
        except (TypeError, ValueError):
            return ""
        whole = f"{abs(n):.2f}"
        head, dec = whole.split(".")
        if len(head) > 3:
            last3, rest = head[-3:], head[:-3]
            parts = []
            while len(rest) > 2:
                parts.insert(0, rest[-2:])
                rest = rest[:-2]
            if rest:
                parts.insert(0, rest)
            head = ",".join(parts) + "," + last3
        return f"₹{head}.{dec}"
    return series.map(fmt)


def export(out_dir: Path, *, seed: int, invoices: int, frauds: int) -> dict[str, int]:
    corpus = generate(seed=seed, n_invoices=invoices, target_frauds=frauds)
    out_dir.mkdir(parents=True, exist_ok=True)
    written: dict[str, int] = {}

    frames = {
        "invoices": corpus.invoices, "pos": corpus.pos, "grns": corpus.grns,
        "vendors": corpus.vendors, "lines": corpus.lines,
        "employees": pd.DataFrame(corpus.employees),
    }

    for kind, df in frames.items():
        if df.empty:
            continue
        out = df.copy()

        for col in ("invoice_date", "po_date", "grn_date", "paid_at", "onboarded_at"):
            if col in out.columns:
                out[col] = _to_ddmmyyyy(out[col])
        if "submitted_at" in out.columns:
            out["submitted_at"] = _to_ddmmyyyy_hhmm(out["submitted_at"])
        for col in ("amount", "tax_amount"):
            if col in out.columns:
                out[col] = _grouped_inr(out[col])
        if "msme_registered" in out.columns:
            out["msme_registered"] = out["msme_registered"].map(
                lambda v: "Yes" if v in (True, "True", "true", 1) else "No")
        if "email_domain" in out.columns:
            out["email_domain"] = out["email_domain"].map(lambda d: f"accounts@{d}")

        mapping = HEADERS[kind]
        out = out[[c for c in mapping if c in out.columns]].rename(columns=mapping)
        path = out_dir / f"{kind}.csv"
        out.to_csv(path, index=False)
        written[kind] = len(out)

    # what was planted, so a reader can check the engine rather than trust it
    gt = corpus.ground_truth_frame()
    gt.to_csv(out_dir / "ground_truth.csv", index=False)
    written["ground_truth"] = len(gt)
    return written


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", default="../samples")
    ap.add_argument("--seed", type=int, default=424242)
    ap.add_argument("--invoices", type=int, default=380)
    ap.add_argument("--frauds", type=int, default=60)
    args = ap.parse_args()
    written = export(Path(args.out), seed=args.seed,
                     invoices=args.invoices, frauds=args.frauds)
    for k, n in written.items():
        print(f"  {k:14} {n:>6} rows")


if __name__ == "__main__":
    main()
