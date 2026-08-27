"""
P2 — Price & Vendor Intelligence (PRC-*).

Every detector here runs on `ctx.lines`, which is already SKU-resolved. That is
not a convenience: comparing an unresolved description against another is a
string comparison, and the finding it produces is noise.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ledgerlens.context import AnalysisContext
from ledgerlens.contracts import Action, Entities, Finding
from ledgerlens.detect._helpers import inr, make
from ledgerlens.registry import detector

PRICE_COL = "unit_price_canonical"
QTY_COL = "qty_canonical"


def _priced(ctx: AnalysisContext) -> pd.DataFrame:
    lines = ctx.lines
    if lines.empty or "sku_id" not in lines.columns:
        return pd.DataFrame()
    df = lines.dropna(subset=["sku_id"]).copy()
    price = PRICE_COL if PRICE_COL in df.columns else "unit_price"
    qty = QTY_COL if QTY_COL in df.columns else "qty"
    df["_price"] = pd.to_numeric(df[price], errors="coerce")
    df["_qty"] = pd.to_numeric(df[qty], errors="coerce")
    return df.dropna(subset=["_price", "_qty"])


@detector("PRC-001", "Unit-price benchmarking against peer median")
class PriceBenchmark:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        df = _priced(ctx)
        if df.empty or "vendor_id" not in df.columns:
            return []
        cfg = ctx.config
        out: list[Finding] = []
        for sku, grp in df.groupby("sku_id"):
            by_vendor = grp.groupby("vendor_id").agg(
                price=("_price", "median"), qty=("_qty", "sum"), lines=("_price", "size"))
            if len(by_vendor) < cfg.price_min_peers:
                continue                       # a median across 2 vendors is not one
            median = float(by_vendor["price"].median())
            if median <= 0:
                continue
            for vendor, row in by_vendor.iterrows():
                dev = row["price"] / median - 1
                if dev <= cfg.price_deviation_min:
                    continue
                exposure = (row["price"] - median) * row["qty"]
                if exposure <= 0:
                    continue
                out.append(make(
                    "PRC-001", key=(str(sku), str(vendor)),
                    entities=Entities(vendor_id=str(vendor), sku_ids=[str(sku)]),
                    evidence={
                        "sku_id": str(sku), "vendor_unit_price": round(float(row["price"]), 2),
                        "peer_median": round(median, 2), "peers_compared": int(len(by_vendor)),
                        "above_median_pct": round(dev * 100, 2),
                        "volume": round(float(row["qty"]), 2),
                        "arithmetic": (f"({row['price']:.2f} − {median:.2f}) × "
                                       f"{row['qty']:.2f} = {exposure:.2f}"),
                    },
                    money=float(exposure), confidence=min(0.95, 0.7 + dev),
                    explanation=(
                        f"{ctx.vendor_name(str(vendor))} charges "
                        f"{inr(float(row['price']))} per unit against a peer median of "
                        f"{inr(median)} across {len(by_vendor)} vendors for the same "
                        f"resolved item. On {row['qty']:.0f} units that is "
                        f"{inr(float(exposure))} of avoidable cost."
                    ),
                    action=Action(kind="renegotiate", label="Reprice to the peer median",
                                  detail=f"Move volume to a compliant vendor or reset the rate; "
                                         f"the counterfactual saving is {inr(float(exposure))}."),
                    score=[("Unit price above peer median", 19),
                           ("SKU resolved before comparison", 10)],
                ))
        return out


@detector("PRC-003", "Price-creep regression against the peer trend")
class PriceCreep:
    """No single raise is arguable. Only the slope is."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        df = _priced(ctx)
        if df.empty or "invoice_date" not in df.columns:
            return []
        cfg = ctx.config
        df = df.dropna(subset=["invoice_date"]).copy()
        df["_q"] = pd.PeriodIndex(pd.to_datetime(df["invoice_date"]), freq="Q")
        out: list[Finding] = []
        for (sku, vendor), grp in df.groupby(["sku_id", "vendor_id"]):
            series = grp.groupby("_q")["_price"].median().sort_index()
            if len(series) < cfg.creep_min_quarters:
                continue
            x = np.arange(len(series), dtype=float)
            y = series.to_numpy(dtype=float)
            if y.std() == 0:
                continue
            slope, intercept = np.polyfit(x, y, 1)
            pred = slope * x + intercept
            ss_res = float(((y - pred) ** 2).sum())
            ss_tot = float(((y - y.mean()) ** 2).sum())
            r2 = 1 - ss_res / ss_tot if ss_tot else 0.0
            if slope <= 0 or r2 < cfg.creep_min_r2:
                continue
            drift = (y[-1] / y[0] - 1) if y[0] else 0.0
            if drift < 0.08:
                continue
            # peers over the same window, as the control
            peers = df[(df["sku_id"] == sku) & (df["vendor_id"] != vendor)]
            peer_drift = None
            if not peers.empty:
                ps = peers.groupby("_q")["_price"].median().sort_index()
                if len(ps) >= 2 and ps.iloc[0]:
                    peer_drift = float(ps.iloc[-1] / ps.iloc[0] - 1)
            if peer_drift is not None and drift - peer_drift < 0.05:
                continue                # the whole market moved; not this vendor
            volume = float(grp["_qty"].sum())
            exposure = (y[-1] - y[0]) * volume
            out.append(make(
                "PRC-003", key=(str(sku), str(vendor)),
                entities=Entities(vendor_id=str(vendor), sku_ids=[str(sku)]),
                evidence={
                    "sku_id": str(sku), "quarters": len(series),
                    "start_price": round(float(y[0]), 2), "end_price": round(float(y[-1]), 2),
                    "vendor_drift_pct": round(drift * 100, 2),
                    "peer_drift_pct": round(peer_drift * 100, 2) if peer_drift is not None else None,
                    "slope_per_quarter": round(float(slope), 4),
                    "r_squared": round(float(r2), 4),
                    "volume": round(volume, 2),
                },
                money=max(exposure, 0.0), confidence=min(0.92, 0.6 + r2 * 0.3),
                explanation=(
                    f"{ctx.vendor_name(str(vendor))} raised the unit price from "
                    f"{inr(float(y[0]))} to {inr(float(y[-1]))} over {len(series)} quarters "
                    f"({drift * 100:.1f}%), a monotonic trend with R² {r2:.2f}"
                    + (f" while peers moved {peer_drift * 100:+.1f}%." if peer_drift is not None
                       else ".")
                    + " No individual increase is large enough to trigger a review."
                ),
                action=Action(kind="renegotiate", label="Reset at renewal, citing the trend",
                              detail="Open renegotiation on the 18-month regression rather than "
                                     "on any single invoice."),
                score=[("Monotonic price increase across quarters", 21),
                       (f"Regression fit R² {r2:.2f}", 7)],
            ))
        return out


@detector("PRC-005", "Contract rate-card violation", baseline_free=True)
class RateCardViolation:
    """External reference: the signed rate card, not the client's own history."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        df = _priced(ctx)
        if df.empty or "contract_rate" not in df.columns:
            return []
        df = df.dropna(subset=["contract_rate"])
        out: list[Finding] = []
        for (sku, vendor), grp in df.groupby(["sku_id", "vendor_id"]):
            rate = float(pd.to_numeric(grp["contract_rate"], errors="coerce").median())
            invoiced = float(grp["_price"].median())
            if rate <= 0 or invoiced <= rate * 1.001:
                continue
            qty = float(grp["_qty"].sum())
            exposure = (invoiced - rate) * qty
            out.append(make(
                "PRC-005", key=(str(sku), str(vendor)),
                entities=Entities(vendor_id=str(vendor), sku_ids=[str(sku)]),
                evidence={"sku_id": str(sku), "contracted_rate": round(rate, 2),
                          "invoiced_rate": round(invoiced, 2), "units": round(qty, 2),
                          "over_contract_pct": round((invoiced / rate - 1) * 100, 2),
                          "arithmetic": f"({invoiced:.2f} − {rate:.2f}) × {qty:.2f} = {exposure:.2f}"},
                money=exposure, confidence=0.97,
                explanation=(
                    f"{ctx.vendor_name(str(vendor))} invoiced {inr(invoiced)} against a "
                    f"contracted rate of {inr(rate)} across {qty:.0f} units — "
                    f"{inr(exposure)} above the signed rate card."
                ),
                action=Action(kind="recover", label="Claim the contract differential",
                              detail=f"Raise a debit note for {inr(exposure)} citing the rate card."),
                score=[("Invoiced above signed rate card", 26)],
            ))
        return out


@detector("PRC-002", "Volume paradox — larger orders at a higher unit price")
class VolumeParadox:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        df = _priced(ctx)
        if df.empty:
            return []
        out: list[Finding] = []
        for (sku, vendor), grp in df.groupby(["sku_id", "vendor_id"]):
            if len(grp) < 4 or grp["_qty"].nunique() < 3:
                continue
            corr = float(np.corrcoef(grp["_qty"], grp["_price"])[0, 1])
            if np.isnan(corr) or corr < 0.5:
                continue
            small = grp.nsmallest(max(len(grp) // 3, 1), "_qty")["_price"].median()
            large = grp.nlargest(max(len(grp) // 3, 1), "_qty")["_price"].median()
            if large <= small:
                continue
            big_qty = float(grp.nlargest(max(len(grp) // 3, 1), "_qty")["_qty"].sum())
            exposure = (large - small) * big_qty
            out.append(make(
                "PRC-002", key=(str(sku), str(vendor)),
                entities=Entities(vendor_id=str(vendor), sku_ids=[str(sku)]),
                evidence={"sku_id": str(sku), "qty_price_correlation": round(corr, 3),
                          "small_order_price": round(float(small), 2),
                          "large_order_price": round(float(large), 2),
                          "large_order_volume": round(big_qty, 2)},
                money=exposure, confidence=0.7,
                explanation=(
                    f"Unit price rises with order size for this item from "
                    f"{ctx.vendor_name(str(vendor))} (correlation {corr:.2f}). Buying more "
                    f"costs more per unit, which inverts the normal volume relationship."
                ),
                action=Action(kind="renegotiate", label="Demand a volume break",
                              detail="Larger commitments should reduce unit price, not raise it."),
                score=[("Unit price rises with order quantity", 15)],
            ))
        return out


@detector("PRC-004", "Best-price counterfactual", opportunity=True)
class BestPriceCounterfactual:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        df = _priced(ctx)
        if df.empty:
            return []
        out: list[Finding] = []
        for sku, grp in df.groupby("sku_id"):
            by_vendor = grp.groupby("vendor_id")["_price"].median()
            if len(by_vendor) < ctx.config.price_min_peers:
                continue
            best = float(by_vendor.min())
            best_vendor = by_vendor.idxmin()
            total_qty = float(grp["_qty"].sum())
            actual = float((grp["_price"] * grp["_qty"]).sum())
            counterfactual = best * total_qty
            saving = actual - counterfactual
            if saving <= 0 or total_qty <= 0:
                continue
            out.append(make(
                "PRC-004", key=(str(sku),),
                entities=Entities(sku_ids=[str(sku)], vendor_id=str(best_vendor)),
                evidence={"sku_id": str(sku), "best_unit_price": round(best, 2),
                          "best_vendor": str(best_vendor), "total_volume": round(total_qty, 2),
                          "actual_spend": round(actual, 2),
                          "counterfactual_spend": round(counterfactual, 2),
                          "arithmetic": f"{actual:.2f} − ({best:.2f} × {total_qty:.2f}) = {saving:.2f}"},
                money=saving, confidence=0.6,
                explanation=(
                    f"The same resolved item was bought at several prices. Consolidating the "
                    f"whole {total_qty:.0f}-unit volume at the best observed rate of "
                    f"{inr(best)} would have cost {inr(saving)} less."
                ),
                action=Action(kind="consolidate", label="Consolidate onto the best rate",
                              detail=f"Modelled, not contracted: {inr(saving)} at current volumes."),
                score=[("Spread of prices for one resolved SKU", 12)],
            ))
        return out


@detector("PRC-006", "Vendor consolidation opportunity", opportunity=True)
class Consolidation:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        df = _priced(ctx)
        if df.empty:
            return []
        out: list[Finding] = []
        for sku, grp in df.groupby("sku_id"):
            vendors = grp["vendor_id"].nunique()
            if vendors < 3:
                continue
            spend = float((grp["_price"] * grp["_qty"]).sum())
            if spend <= 0:
                continue
            blended = spend / float(grp["_qty"].sum())
            target = float(grp.groupby("vendor_id")["_price"].median().quantile(0.25))
            saving = (blended - target) * float(grp["_qty"].sum())
            if saving <= 0:
                continue
            out.append(make(
                "PRC-006", key=(str(sku),),
                entities=Entities(sku_ids=[str(sku)]),
                evidence={"sku_id": str(sku), "vendors_supplying": int(vendors),
                          "blended_rate": round(blended, 2),
                          "lower_quartile_rate": round(target, 2),
                          "annual_spend": round(spend, 2)},
                money=saving, confidence=0.55,
                explanation=(
                    f"{vendors} vendors supply this one resolved item at a blended "
                    f"{inr(blended)} per unit. Consolidating to the lower-quartile rate of "
                    f"{inr(target)} models a saving of {inr(saving)}."
                ),
                action=Action(kind="consolidate", label="Run a single tender for this item",
                              detail="Modelled on current volumes; not a contracted price."),
                score=[("Fragmented supply for one SKU", 10)],
            ))
        return out


@detector("PRC-007", "Tail-spend concentration", opportunity=True)
class TailSpend:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or len(inv) < 20:
            return []
        by_vendor = inv.groupby("vendor_id")["amount"].agg(["sum", "size"])
        total = float(by_vendor["sum"].sum())
        if total <= 0:
            return []
        tail = by_vendor[by_vendor["sum"] < total * 0.01]
        if len(tail) < max(3, len(by_vendor) * 0.3):
            return []
        tail_spend = float(tail["sum"].sum())
        tail_invoices = int(tail["size"].sum())
        # a processed invoice costs money whatever its value
        admin_cost = tail_invoices * 450
        return [make(
            "PRC-007", key=("tail",),
            entities=Entities(),
            evidence={"tail_vendors": int(len(tail)), "total_vendors": int(len(by_vendor)),
                      "tail_spend": round(tail_spend, 2), "tail_invoices": tail_invoices,
                      "share_of_spend_pct": round(tail_spend / total * 100, 2),
                      "assumed_processing_cost_per_invoice": 450},
            money=float(admin_cost), confidence=0.5,
            explanation=(
                f"{len(tail)} of {len(by_vendor)} vendors account for only "
                f"{tail_spend / total * 100:.1f}% of spend but {tail_invoices} invoices. "
                f"The processing cost of that tail is the saving, not the spend itself."
            ),
            action=Action(kind="consolidate", label="Rationalise the vendor tail",
                          detail="Modelled at ₹450 processing cost per invoice."),
            score=[("Long vendor tail relative to spend", 8)],
        )]


@detector("PRC-008", "Missed early-payment discount")
class MissedDiscount:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        needed = {"paid_at", "invoice_date", "discount_rate", "discount_days"}
        if inv.empty or not needed <= set(inv.columns):
            return []
        work = inv.dropna(subset=list(needed)).copy()
        if work.empty:
            return []
        days = (pd.to_datetime(work["paid_at"]) - pd.to_datetime(work["invoice_date"])).dt.days
        rate = pd.to_numeric(work["discount_rate"], errors="coerce")
        rate = rate.where(rate <= 1, rate / 100)
        window = pd.to_numeric(work["discount_days"], errors="coerce")
        missed = work[(days > window) & rate.notna()]
        if missed.empty:
            return []
        forgone = float((missed["amount"] * rate.loc[missed.index]).sum())
        if forgone <= 0:
            return []
        return [make(
            "PRC-008", key=("discounts",),
            entities=Entities(invoice_ids=missed["invoice_id"].astype(str).tolist()[:50]),
            evidence={"invoices_paid_late": int(len(missed)),
                      "eligible_value": round(float(missed["amount"].sum()), 2),
                      "forgone_discount": round(forgone, 2)},
            money=forgone, confidence=0.9,
            explanation=(
                f"{len(missed)} invoices carried an early-payment discount that lapsed "
                f"because payment fell outside the discount window. "
                f"{inr(forgone)} was available and not taken."
            ),
            action=Action(kind="renegotiate", label="Re-sequence the payment run",
                          detail="Pay discount-bearing invoices inside their window."),
            score=[("Early-payment discount allowed to lapse", 12)],
        )]


@detector("PRC-009", "Lead-time-adjusted true cost", opportunity=True)
class LeadTimeCost:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        df = _priced(ctx)
        pos, grns = ctx.pos, ctx.grns
        if df.empty or pos.empty or grns.empty:
            return []
        if "po_date" not in pos.columns or "grn_date" not in grns.columns:
            return []
        lead = grns.merge(pos[["po_id", "vendor_id", "po_date"]], on="po_id", how="inner")
        lead = lead.dropna(subset=["po_date", "grn_date"])
        if lead.empty:
            return []
        lead["_days"] = (pd.to_datetime(lead["grn_date"]) - pd.to_datetime(lead["po_date"])).dt.days
        by_vendor = lead.groupby("vendor_id")["_days"].median()
        if len(by_vendor) < 3:
            return []
        benchmark = float(by_vendor.median())
        out: list[Finding] = []
        for vendor, med in by_vendor.items():
            excess = float(med) - benchmark
            if excess < 14:
                continue
            spend = float(df[df["vendor_id"] == vendor].eval("_price * _qty").sum())
            if spend <= 0:
                continue
            # working capital tied up for the extra wait, at 9% p.a.
            carry = spend * 0.09 * (excess / 365)
            out.append(make(
                "PRC-009", key=(str(vendor),),
                entities=Entities(vendor_id=str(vendor)),
                evidence={"median_lead_days": float(med), "peer_median_days": benchmark,
                          "excess_days": round(excess, 1), "vendor_spend": round(spend, 2),
                          "carry_rate_pa": 0.09,
                          "arithmetic": f"{spend:.2f} × 0.09 × {excess:.0f}/365 = {carry:.2f}"},
                money=carry, confidence=0.5,
                explanation=(
                    f"{ctx.vendor_name(str(vendor))} delivers in {med:.0f} days against a peer "
                    f"median of {benchmark:.0f}. The extra {excess:.0f} days of working capital "
                    f"carry is {inr(carry)} — a real cost the unit price does not show."
                ),
                action=Action(kind="renegotiate", label="Price the lead time in",
                              detail="Modelled at a 9% annual carry rate."),
                score=[("Lead time materially above peers", 9)],
            ))
        return out
