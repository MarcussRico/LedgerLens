"""
P5 — Compliance & Process (CMP-*).

India-specific, statutory and unarguable. These findings do not require anyone
to agree with a model: a duplicate GST invoice number within one financial year
for one GSTIN is not unlikely, it is impossible under Rule 46(b).

All baseline-free — they test against statute and internal cross-consistency,
never against the client's own history.
"""
from __future__ import annotations

import pandas as pd

from ledgerlens.context import AnalysisContext
from ledgerlens.contracts import Action, Entities, Finding
from ledgerlens.detect._helpers import inr, make
from ledgerlens.ingest.validate import gstin_checksum_valid
from ledgerlens.registry import detector

# Indicative GST rate by HSN chapter. A mismatch is a flag for review, not a
# determination — rates vary by sub-heading and notification.
HSN_EXPECTED_RATE: dict[str, float] = {
    "48": 0.12, "84": 0.18, "85": 0.18, "72": 0.18, "39": 0.18,
    "94": 0.18, "96": 0.18, "99": 0.18, "73": 0.18, "40": 0.18,
}


def _fy(date: pd.Timestamp, start_month: int) -> str:
    y = date.year if date.month >= start_month else date.year - 1
    return f"{y}-{str(y + 1)[-2:]}"


@detector("CMP-001", "Three-way match (PO ↔ GRN ↔ Invoice)", baseline_free=True)
class ThreeWayMatch:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv, pos, grns = ctx.invoices, ctx.pos, ctx.grns
        if inv.empty or pos.empty or grns.empty:
            return []
        if "po_id" not in inv.columns or "po_id" not in grns.columns:
            return []
        cfg = ctx.config
        received = grns.groupby("po_id").agg(
            received_qty=("received_qty", "sum"),
            ordered_qty=("ordered_qty", "max")).reset_index()
        merged = (inv.dropna(subset=["po_id"])
                     .merge(pos[["po_id", "amount"]].rename(columns={"amount": "po_amount"}),
                            on="po_id", how="left")
                     .merge(received, on="po_id", how="left"))
        out: list[Finding] = []
        for row in merged.to_dict("records"):
            issues, exposure = [], 0.0
            inv_amt = float(pd.to_numeric(row.get("amount"), errors="coerce") or 0)
            po_amt = pd.to_numeric(row.get("po_amount"), errors="coerce")
            if pd.notna(po_amt) and po_amt > 0 and inv_amt > po_amt * (1 + cfg.po_tolerance):
                over = inv_amt - float(po_amt)
                issues.append(f"invoice exceeds PO by {inr(over)} "
                              f"({(inv_amt / float(po_amt) - 1) * 100:.1f}%)")
                exposure += over
            rq = pd.to_numeric(row.get("received_qty"), errors="coerce")
            oq = pd.to_numeric(row.get("ordered_qty"), errors="coerce")
            if pd.notna(rq) and pd.notna(oq) and oq > 0 and rq < oq * (1 - cfg.grn_tolerance):
                short = float(oq - rq)
                unit = inv_amt / float(oq) if oq else 0.0
                issues.append(f"{short:.0f} of {oq:.0f} units never received")
                exposure += short * unit
            if not issues:
                continue
            out.append(make(
                "CMP-001", key=(str(row["invoice_id"]),),
                entities=Entities(invoice_ids=[str(row["invoice_id"])],
                                  vendor_id=str(row.get("vendor_id")),
                                  po_ids=[str(row["po_id"])]),
                evidence={"po_id": str(row["po_id"]), "invoice_amount": inv_amt,
                          "po_amount": float(po_amt) if pd.notna(po_amt) else None,
                          "ordered_qty": float(oq) if pd.notna(oq) else None,
                          "received_qty": float(rq) if pd.notna(rq) else None,
                          "po_tolerance_pct": cfg.po_tolerance * 100,
                          "failures": issues},
                money=exposure, confidence=0.96,
                explanation=(
                    f"Three-way match failed on {row['invoice_id']}: {'; '.join(issues)}. "
                    f"The invoice was processed without full reconciliation to the order and "
                    f"the goods-receipt note."
                ),
                action=Action(kind="recover", label="Recover the unmatched value",
                              detail=f"Raise a debit note for {inr(exposure)} and hold further "
                                     f"payment pending physical verification."),
                score=[("Three-way match failure", 25)],
            ))
        return out


@detector("CMP-002", "Duplicate GST invoice number within one financial year",
          baseline_free=True)
class DuplicateGSTNumber:
    """Statutorily impossible under Rule 46(b), CGST Rules 2017."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv, vendors = ctx.invoices, ctx.vendors
        if inv.empty or "gst_invoice_no" not in inv.columns:
            return []
        if vendors.empty or "gstin" not in vendors.columns:
            return []
        gstin_of = dict(zip(vendors["vendor_id"].astype(str),
                            vendors["gstin"].astype(str), strict=False))
        work = inv.dropna(subset=["gst_invoice_no", "invoice_date"]).copy()
        work["_gstin"] = work["vendor_id"].astype(str).map(gstin_of)
        work = work.dropna(subset=["_gstin"])
        if work.empty:
            return []
        work["_fy"] = pd.to_datetime(work["invoice_date"]).map(
            lambda d: _fy(d, ctx.config.fiscal_year_start_month))
        work["_no"] = work["gst_invoice_no"].astype(str).str.strip().str.upper()

        out: list[Finding] = []
        for (gstin, fy, no), grp in work.groupby(["_gstin", "_fy", "_no"]):
            if len(grp) < 2:
                continue
            exposure = float(pd.to_numeric(grp["amount"], errors="coerce").sum())
            out.append(make(
                "CMP-002", key=(str(gstin), str(fy), str(no)),
                entities=Entities(invoice_ids=grp["invoice_id"].astype(str).tolist(),
                                  vendor_id=str(grp["vendor_id"].iloc[0])),
                evidence={"gstin": str(gstin), "financial_year": str(fy),
                          "invoice_number": str(no), "occurrences": int(len(grp)),
                          "statute": "Rule 46(b), CGST Rules 2017 — an invoice number must be "
                                     "unique per GSTIN per financial year",
                          "amounts": [float(x) for x in
                                      pd.to_numeric(grp["amount"], errors="coerce").fillna(0)]},
                money=exposure, confidence=0.99,
                explanation=(
                    f"Invoice number {no} appears {len(grp)} times against GSTIN {gstin} within "
                    f"financial year {fy}. Rule 46(b) requires invoice numbers to be unique per "
                    f"GSTIN per year, so at least one of these documents cannot be genuine as issued."
                ),
                action=Action(kind="block-payment", label="Reject and demand reissue",
                              detail="Withhold input-tax credit until compliant documents are received."),
                score=[("Duplicate GST invoice number in one FY", 30)],
            ))
        return out


@detector("CMP-004", "MSME 45-day payment breach (s.43B(h))", baseline_free=True)
class MSMEPaymentBreach:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv, vendors = ctx.invoices, ctx.vendors
        if inv.empty or vendors.empty or "msme_registered" not in vendors.columns:
            return []
        if "paid_at" not in inv.columns or "invoice_date" not in inv.columns:
            return []
        cfg = ctx.config
        msme = vendors[vendors["msme_registered"].astype(str).str.lower()
                       .isin(["true", "yes", "y", "1"])]["vendor_id"].astype(str)
        if msme.empty:
            return []
        work = inv[inv["vendor_id"].astype(str).isin(set(msme))].dropna(
            subset=["paid_at", "invoice_date"]).copy()
        if work.empty:
            return []
        work["_days"] = (pd.to_datetime(work["paid_at"])
                         - pd.to_datetime(work["invoice_date"])).dt.days
        late = work[work["_days"] > cfg.msme_payment_limit_days]
        if late.empty:
            return []
        out: list[Finding] = []
        for vendor, grp in late.groupby("vendor_id"):
            exposed = float(pd.to_numeric(grp["amount"], errors="coerce").sum())
            # the cost is the tax on disallowed expenditure, not the invoice value
            tax_cost = exposed * 0.25
            out.append(make(
                "CMP-004", key=(str(vendor),),
                entities=Entities(vendor_id=str(vendor),
                                  invoice_ids=grp["invoice_id"].astype(str).tolist()[:40]),
                evidence={"statute": "Income Tax Act s.43B(h)",
                          "limit_days": cfg.msme_payment_limit_days,
                          "breaches": int(len(grp)),
                          "worst_delay_days": int(grp["_days"].max()),
                          "exposed_amount": round(exposed, 2),
                          "assumed_tax_rate": 0.25,
                          "arithmetic": f"{exposed:.2f} × 0.25 = {tax_cost:.2f}"},
                money=tax_cost, confidence=0.95,
                explanation=(
                    f"{len(grp)} payment(s) to MSME-registered "
                    f"{ctx.vendor_name(str(vendor))} cleared beyond the "
                    f"{cfg.msme_payment_limit_days}-day statutory limit, the worst at "
                    f"{grp['_days'].max():.0f} days. Under s.43B(h) that expenditure is "
                    f"disallowed unless settled before filing — a tax cost of about "
                    f"{inr(tax_cost)} on {inr(exposed)} of payables."
                ),
                action=Action(kind="escalate", label="Settle before the filing date",
                              detail="Clear the overdue MSME payables before the return is filed "
                                     "to avoid disallowance."),
                score=[("MSME payment beyond 45 days", 24),
                       (f"{len(grp)} separate breaches", 11)],
            ))
        return out


@detector("CMP-003", "Invoice without a PO, or exceeding PO tolerance", baseline_free=True)
class InvoiceWithoutPO:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv, pos = ctx.invoices, ctx.pos
        if inv.empty or "po_id" not in inv.columns:
            return []
        known = set(pos["po_id"].astype(str)) if not pos.empty else set()
        orphan = inv[inv["po_id"].notna()
                     & ~inv["po_id"].astype(str).isin(known)] if known else inv.iloc[0:0]
        if orphan.empty:
            return []
        exposure = float(pd.to_numeric(orphan["amount"], errors="coerce").sum())
        return [make(
            "CMP-003", key=("orphan-po",),
            entities=Entities(invoice_ids=orphan["invoice_id"].astype(str).tolist()[:50]),
            evidence={"invoices_referencing_unknown_po": int(len(orphan)),
                      "sample_po_ids": orphan["po_id"].astype(str).unique().tolist()[:10],
                      "value": round(exposure, 2)},
            money=exposure, confidence=0.9,
            explanation=(
                f"{len(orphan)} invoices worth {inr(exposure)} reference a purchase order that "
                f"does not exist in the PO master. The control that authorises the commitment "
                f"cannot be evidenced."
            ),
            action=Action(kind="block-payment", label="Hold pending a valid PO reference",
                          detail="Obtain the authorising PO or reject the invoice."),
            score=[("Invoice references a non-existent PO", 20)],
        )]


@detector("CMP-005", "Tax rate inconsistent with the HSN code", baseline_free=True)
class HSNTaxMismatch:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        lines = ctx.lines
        if lines.empty or "hsn" not in lines.columns or "tax_rate" not in lines.columns:
            return []
        work = lines.dropna(subset=["hsn", "tax_rate"]).copy()
        if work.empty:
            return []
        work["_chapter"] = work["hsn"].astype(str).str.replace(r"\D", "", regex=True).str[:2]
        rate = pd.to_numeric(work["tax_rate"], errors="coerce")
        work["_rate"] = rate.where(rate <= 1, rate / 100)
        out: list[Finding] = []
        for (chapter, applied), grp in work.groupby(["_chapter", "_rate"]):
            expected = HSN_EXPECTED_RATE.get(str(chapter))
            if expected is None or abs(float(applied) - expected) < 0.005:
                continue
            qty = pd.to_numeric(grp.get("qty"), errors="coerce").fillna(0)
            price = pd.to_numeric(grp.get("unit_price"), errors="coerce").fillna(0)
            base = float((qty * price).sum())
            delta = abs(expected - float(applied)) * base
            if delta < 1000:
                continue
            out.append(make(
                "CMP-005", key=(str(chapter), float(applied)),
                entities=Entities(invoice_ids=grp["invoice_id"].astype(str).unique().tolist()[:40]),
                evidence={"hsn_chapter": str(chapter), "applied_rate_pct": round(float(applied) * 100, 2),
                          "indicative_rate_pct": round(expected * 100, 2),
                          "lines_affected": int(len(grp)), "taxable_base": round(base, 2),
                          "note": "Indicative chapter rate; sub-headings and notifications vary. "
                                  "Flag for review, not a determination."},
                money=delta, confidence=0.6,
                explanation=(
                    f"{len(grp)} line(s) under HSN chapter {chapter} carry GST at "
                    f"{float(applied) * 100:.0f}% against an indicative {expected * 100:.0f}% "
                    f"for that chapter. The difference on a base of {inr(base)} is {inr(delta)}, "
                    f"which affects input-tax credit either way."
                ),
                action=Action(kind="investigate", label="Confirm the correct rate for this HSN",
                              detail="Verify the sub-heading and any applicable notification."),
                score=[("Tax rate inconsistent with HSN chapter", 12)],
            ))
        return out


@detector("CMP-006", "Segregation-of-duties breach", baseline_free=True)
class SegregationOfDuties:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        pos = ctx.pos
        if pos.empty or not {"approver_id", "requisition_by"} <= set(pos.columns):
            return []
        work = pos.dropna(subset=["approver_id", "requisition_by"])
        same = work[work["approver_id"].astype(str).str.strip().str.lower()
                    == work["requisition_by"].astype(str).str.strip().str.lower()]
        if same.empty:
            return []
        out: list[Finding] = []
        for person, grp in same.groupby("approver_id"):
            exposure = float(pd.to_numeric(grp["amount"], errors="coerce").sum())
            out.append(make(
                "CMP-006", key=(str(person),),
                entities=Entities(po_ids=grp["po_id"].astype(str).tolist()[:40]),
                evidence={"person": str(person), "orders": int(len(grp)),
                          "value": round(exposure, 2),
                          "control": "the person who raises a requisition must not approve it"},
                money=exposure, confidence=0.93,
                explanation=(
                    f"{len(grp)} purchase order(s) worth {inr(exposure)} were both raised and "
                    f"approved by {person}. Segregation of duties is not satisfied on these "
                    f"commitments, independent of whether anything was wrong with them."
                ),
                action=Action(kind="escalate", label="Enforce a second approver",
                              detail="Block self-approval in the workflow and review these orders."),
                score=[("Same person raised and approved", 22)],
            ))
        return out
