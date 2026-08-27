"""
P1 — Duplicates & Overpayment (DUP-*).

The largest category of leakage and almost never fraud: somebody re-sent an
invoice and both copies got paid. Every detector here is inherently relational —
a single invoice can never be a duplicate on its own.
"""
from __future__ import annotations

import itertools
import re

import pandas as pd
from rapidfuzz.distance import Levenshtein

from ledgerlens.context import AnalysisContext
from ledgerlens.contracts import Action, Entities, Finding
from ledgerlens.detect._helpers import inr, make
from ledgerlens.registry import detector

_ALNUM = re.compile(r"[^A-Za-z0-9]")


def _norm_no(v: object) -> str:
    return _ALNUM.sub("", str(v)).upper()


def _pairs_within(df: pd.DataFrame, days: int):
    """Yield index pairs of invoices for one vendor inside a date window."""
    df = df.sort_values("invoice_date")
    rows = df.to_dict("records")
    for i, a in enumerate(rows):
        for b in rows[i + 1:]:
            gap = (b["invoice_date"] - a["invoice_date"]).days
            if gap > days:
                break
            yield a, b, gap


@detector("DUP-001", "Exact duplicate")
class ExactDuplicate:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "gst_invoice_no" not in inv.columns:
            return []
        out: list[Finding] = []
        work = inv.dropna(subset=["gst_invoice_no"]).copy()
        work["_no"] = work["gst_invoice_no"].map(_norm_no)
        for (vendor, no, amount), grp in work.groupby(["vendor_id", "_no", "amount"]):
            if len(grp) < 2 or not no:
                continue
            ids = grp["invoice_id"].astype(str).tolist()
            out.append(make(
                "DUP-001", key=tuple(ids),
                entities=Entities(invoice_ids=ids, vendor_id=str(vendor)),
                evidence={"invoice_no": no, "amount": float(amount),
                          "occurrences": len(grp), "invoice_ids": ids,
                          "dates": [str(d)[:10] for d in grp["invoice_date"]]},
                money=float(amount) * (len(grp) - 1), confidence=0.99,
                explanation=(
                    f"{ctx.vendor_name(str(vendor))} has {len(grp)} invoices carrying the "
                    f"same number and the same value of {inr(float(amount))}. "
                    f"Only one supply is evidenced."
                ),
                action=Action(kind="recover", label="Recover the repeated payment",
                              detail=f"Raise a debit note for {inr(float(amount) * (len(grp) - 1))} "
                                     f"against the repeated document(s)."),
                score=[("Identical invoice number and amount", 30),
                       ("Same vendor after entity resolution", 12)],
                detected_at=str(grp["invoice_date"].max())[:10],
            ))
        return out


@detector("DUP-002", "Near-duplicate matching")
class NearDuplicate:
    """Flagship. Same vendor, amount within tolerance, date within the window,
    different invoice number. This is the one that catches a politely re-sent
    invoice, which no invoice-number check can ever see."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty:
            return []
        cfg = ctx.config
        out: list[Finding] = []
        seen: set[tuple[str, str]] = set()

        for vendor, grp in inv.dropna(subset=["invoice_date", "amount"]).groupby("vendor_id"):
            if len(grp) < 2:
                continue
            for a, b, gap in _pairs_within(grp, cfg.dup_date_window_days):
                amt_a, amt_b = float(a["amount"]), float(b["amount"])
                if max(amt_a, amt_b) <= 0:
                    continue
                delta = abs(amt_a - amt_b) / max(amt_a, amt_b)
                if delta > cfg.dup_amount_tolerance:
                    continue
                no_a, no_b = _norm_no(a.get("gst_invoice_no") or a["invoice_id"]), \
                             _norm_no(b.get("gst_invoice_no") or b["invoice_id"])
                if no_a == no_b:
                    continue                      # that is DUP-001, not this
                key = tuple(sorted([str(a["invoice_id"]), str(b["invoice_id"])]))
                if key in seen:
                    continue
                seen.add(key)

                confidence = 0.80 + 0.15 * (1 - delta / max(cfg.dup_amount_tolerance, 1e-9)) \
                                  + 0.05 * (1 - gap / max(cfg.dup_date_window_days, 1))
                out.append(make(
                    "DUP-002", key=key,
                    entities=Entities(invoice_ids=list(key), vendor_id=str(vendor)),
                    evidence={
                        "invoice_no_a": no_a, "invoice_no_b": no_b,
                        "date_a": str(a["invoice_date"])[:10],
                        "date_b": str(b["invoice_date"])[:10],
                        "days_apart": int(gap),
                        "amount_a": amt_a, "amount_b": amt_b,
                        "amount_delta_pct": round(delta * 100, 3),
                        "tolerance_pct": cfg.dup_amount_tolerance * 100,
                        "window_days": cfg.dup_date_window_days,
                    },
                    money=min(amt_a, amt_b), confidence=min(confidence, 0.98),
                    explanation=(
                        f"{ctx.vendor_name(str(vendor))} billed {inr(amt_a)} and {inr(amt_b)} "
                        f"{gap} day(s) apart under different invoice numbers "
                        f"({no_a} and {no_b}). The pattern is consistent with one supply "
                        f"invoiced twice and requires review before the second is paid."
                    ),
                    action=Action(
                        kind="block-payment", label="Hold the later payment pending reconciliation",
                        detail=f"Confirm whether {no_a} and {no_b} cover the same supply. "
                               f"If so, recover {inr(min(amt_a, amt_b))}.",
                    ),
                    score=[("Amount match within tolerance", 22),
                           ("Same vendor after entity resolution", 14),
                           (f"Filed {gap} day(s) apart", 8)],
                    detected_at=str(max(a["invoice_date"], b["invoice_date"]))[:10],
                ))
        return out


@detector("DUP-004", "Transposition-tolerant invoice numbers")
class TranspositionDuplicate:
    """INV-1042 against INV-I042: a keying slip, not a different document."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty:
            return []
        cfg = ctx.config
        out: list[Finding] = []
        work = inv.dropna(subset=["amount"]).copy()
        work["_no"] = work.apply(
            lambda r: _norm_no(r.get("gst_invoice_no") or r["invoice_id"]), axis=1
        )
        for vendor, grp in work.groupby("vendor_id"):
            rows = grp.to_dict("records")
            for a, b in itertools.combinations(rows, 2):
                na, nb = a["_no"], b["_no"]
                if na == nb or abs(len(na) - len(nb)) > cfg.dup_levenshtein_max:
                    continue
                dist = Levenshtein.distance(na, nb)
                if not 0 < dist <= cfg.dup_levenshtein_max:
                    continue
                amt_a, amt_b = float(a["amount"]), float(b["amount"])
                if max(amt_a, amt_b) <= 0:
                    continue
                if abs(amt_a - amt_b) / max(amt_a, amt_b) > cfg.dup_amount_tolerance:
                    continue
                ids = sorted([str(a["invoice_id"]), str(b["invoice_id"])])
                out.append(make(
                    "DUP-004", key=tuple(ids),
                    entities=Entities(invoice_ids=ids, vendor_id=str(vendor)),
                    evidence={"invoice_no_a": na, "invoice_no_b": nb,
                              "levenshtein_distance": dist,
                              "max_distance": cfg.dup_levenshtein_max,
                              "amount_a": amt_a, "amount_b": amt_b},
                    money=min(amt_a, amt_b), confidence=0.88,
                    explanation=(
                        f"Invoice numbers {na} and {nb} differ by {dist} character(s) and "
                        f"carry the same value. Consistent with one document keyed twice."
                    ),
                    action=Action(kind="investigate", label="Confirm whether these are one document",
                                  detail="Compare the two scans; if identical, recover the second payment."),
                    score=[(f"Invoice numbers within Levenshtein {dist}", 20),
                           ("Amounts match within tolerance", 15)],
                ))
        return out


@detector("DUP-007", "Cross-alias duplicates")
class CrossAliasDuplicate:
    """Only visible after entity resolution: the same bill arriving under two
    trading names. Before resolution these are two different vendors and no
    duplicate check can see across them."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "vendor_id_raw" not in inv.columns:
            return []
        cfg = ctx.config
        out: list[Finding] = []
        work = inv.dropna(subset=["invoice_date", "amount"])
        for vendor, grp in work.groupby("vendor_id"):
            if grp["vendor_id_raw"].nunique() < 2:
                continue           # no aliases involved; DUP-002 covers it
            for a, b, gap in _pairs_within(grp, cfg.dup_date_window_days * 3):
                if a["vendor_id_raw"] == b["vendor_id_raw"]:
                    continue
                amt_a, amt_b = float(a["amount"]), float(b["amount"])
                if max(amt_a, amt_b) <= 0:
                    continue
                if abs(amt_a - amt_b) / max(amt_a, amt_b) > cfg.dup_amount_tolerance:
                    continue
                ids = sorted([str(a["invoice_id"]), str(b["invoice_id"])])
                out.append(make(
                    "DUP-007", key=tuple(ids),
                    entities=Entities(invoice_ids=ids, vendor_id=str(vendor)),
                    evidence={"resolved_entity": str(vendor),
                              "alias_a": str(a["vendor_id_raw"]),
                              "alias_b": str(b["vendor_id_raw"]),
                              "amount_a": amt_a, "amount_b": amt_b,
                              "days_apart": int(gap)},
                    money=min(amt_a, amt_b), confidence=0.90,
                    explanation=(
                        f"Two invoices of {inr(amt_a)} and {inr(amt_b)} arrived {gap} day(s) apart "
                        f"under different trading names ({a['vendor_id_raw']} and "
                        f"{b['vendor_id_raw']}) that resolve to one counterparty."
                    ),
                    action=Action(kind="block-payment", label="Hold and reconcile across aliases",
                                  detail="These trade under different names but are one payee."),
                    score=[("Duplicate visible only after alias resolution", 24),
                           ("Amounts match within tolerance", 15)],
                ))
        return out


@detector("DUP-006", "Paid before goods received", baseline_free=True)
class PaidBeforeGoods:
    """Cross-consistency between two systems: a payment that precedes the
    goods-receipt note. Needs no history to be true or false."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv, grns = ctx.invoices, ctx.grns
        if inv.empty or grns.empty or "paid_at" not in inv.columns:
            return []
        if "po_id" not in inv.columns or "po_id" not in grns.columns:
            return []
        first_grn = grns.dropna(subset=["grn_date"]).groupby("po_id")["grn_date"].min()
        out: list[Finding] = []
        for row in inv.dropna(subset=["paid_at", "po_id"]).to_dict("records"):
            grn_date = first_grn.get(row["po_id"])
            if grn_date is None or pd.isna(grn_date):
                continue
            paid = row["paid_at"]
            if pd.isna(paid) or paid >= grn_date:
                continue
            days = (grn_date - paid).days
            amount = float(row["amount"])
            out.append(make(
                "DUP-006", key=(str(row["invoice_id"]),),
                entities=Entities(invoice_ids=[str(row["invoice_id"])],
                                  vendor_id=str(row.get("vendor_id")),
                                  po_ids=[str(row["po_id"])]),
                evidence={"paid_at": str(paid)[:10], "first_grn_date": str(grn_date)[:10],
                          "days_early": int(days), "po_id": str(row["po_id"]),
                          "amount": amount},
                money=amount, confidence=0.95,
                explanation=(
                    f"{inr(amount)} was paid {days} day(s) before any goods-receipt note "
                    f"exists for {row['po_id']}. The control that confirms delivery was "
                    f"bypassed, whatever the outcome."
                ),
                action=Action(kind="investigate", label="Confirm the goods actually arrived",
                              detail="Match to a signed GRN; if none exists, recover."),
                score=[("Payment precedes goods receipt", 22),
                       (f"{days} days early", 8)],
                detected_at=str(paid)[:10],
            ))
        return out


@detector("DUP-005", "Credit note raised but never applied")
class UnappliedCreditNote:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "status" not in inv.columns:
            return []
        status = inv["status"].astype(str).str.lower()
        credits = inv[status.str.contains("credit|cn|return", na=False, regex=True)]
        out: list[Finding] = []
        for vendor, grp in credits.groupby("vendor_id"):
            unapplied = grp[~grp["status"].astype(str).str.lower().str.contains("applied|adjusted", na=False)]
            if unapplied.empty:
                continue
            total = float(unapplied["amount"].sum())
            if total <= 0:
                continue
            ids = unapplied["invoice_id"].astype(str).tolist()
            out.append(make(
                "DUP-005", key=(str(vendor), len(ids)),
                entities=Entities(invoice_ids=ids, vendor_id=str(vendor)),
                evidence={"credit_notes": len(ids), "total_value": total,
                          "invoice_ids": ids[:20]},
                money=total, confidence=0.85,
                explanation=(
                    f"{len(ids)} credit note(s) worth {inr(total)} from "
                    f"{ctx.vendor_name(str(vendor))} carry no evidence of having been "
                    f"applied against a payment."
                ),
                action=Action(kind="recover", label="Apply the outstanding credit",
                              detail=f"Offset {inr(total)} against the next payment run."),
                score=[("Credit note never offset", 20)],
            ))
        return out


@detector("DUP-003", "Same goods billed on two POs")
class SameGoodsTwoPOs:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        lines = ctx.lines
        if lines.empty or "sku_id" not in lines.columns or "po_id" not in ctx.invoices.columns:
            return []
        joined = lines.merge(
            ctx.invoices[["invoice_id", "po_id", "invoice_date"]].rename(
                columns={"invoice_date": "_inv_date"}),
            on="invoice_id", how="left", suffixes=("", "_inv"),
        )
        joined = joined.dropna(subset=["sku_id", "po_id"])
        out: list[Finding] = []
        qty_col = "qty_canonical" if "qty_canonical" in joined.columns else "qty"
        for (vendor, sku), grp in joined.groupby(["vendor_id", "sku_id"]):
            if grp["po_id"].nunique() < 2:
                continue
            dates = pd.to_datetime(grp["_inv_date"], errors="coerce").dropna()
            if dates.empty or (dates.max() - dates.min()).days > 14:
                continue
            qty = pd.to_numeric(grp[qty_col], errors="coerce").sum()
            price = pd.to_numeric(grp.get("unit_price"), errors="coerce").median()
            if pd.isna(price):
                continue
            money = float(qty) * float(price) / 2      # the overlapping half
            ids = grp["invoice_id"].astype(str).unique().tolist()
            out.append(make(
                "DUP-003", key=(str(vendor), str(sku)),
                entities=Entities(invoice_ids=ids, vendor_id=str(vendor),
                                  po_ids=grp["po_id"].astype(str).unique().tolist(),
                                  sku_ids=[str(sku)]),
                evidence={"sku_id": str(sku), "po_ids": grp["po_id"].astype(str).unique().tolist(),
                          "total_qty": float(qty), "median_unit_price": float(price),
                          "window_days": int((dates.max() - dates.min()).days)},
                money=money, confidence=0.72,
                explanation=(
                    f"The same resolved item was billed against "
                    f"{grp['po_id'].nunique()} separate purchase orders within "
                    f"{(dates.max() - dates.min()).days} days. Consistent with one "
                    f"delivery charged twice."
                ),
                action=Action(kind="investigate", label="Reconcile the two purchase orders",
                              detail="Confirm two distinct deliveries were received."),
                score=[("Same resolved SKU across two POs in a short window", 18)],
            ))
        return out


@detector("DUP-008", "Reimbursement double-dip")
class ReimbursementDoubleDip:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "cost_centre" not in inv.columns:
            return []
        work = inv.dropna(subset=["amount", "invoice_date"]).copy()
        out: list[Finding] = []
        for (cc, amount), grp in work.groupby(["cost_centre", "amount"]):
            if len(grp) < 2 or grp["vendor_id"].nunique() < 2:
                continue
            dates = pd.to_datetime(grp["invoice_date"], errors="coerce").dropna()
            if dates.empty or (dates.max() - dates.min()).days > 31:
                continue
            ids = grp["invoice_id"].astype(str).tolist()
            out.append(make(
                "DUP-008", key=tuple(ids),
                entities=Entities(invoice_ids=ids),
                evidence={"cost_centre": str(cc), "amount": float(amount),
                          "claims": len(grp),
                          "vendors": grp["vendor_id"].astype(str).unique().tolist(),
                          "window_days": int((dates.max() - dates.min()).days)},
                money=float(amount) * (len(grp) - 1), confidence=0.65,
                explanation=(
                    f"{len(grp)} claims of exactly {inr(float(amount))} were booked to "
                    f"{cc} within a month through different payees. Consistent with one "
                    f"expense claimed more than once."
                ),
                action=Action(kind="investigate", label="Review the supporting receipts",
                              detail="Confirm each claim has a distinct underlying receipt."),
                score=[("Identical amounts, one cost centre, short window", 16)],
            ))
        return out
