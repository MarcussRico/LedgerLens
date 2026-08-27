"""
P3 — Behavioural Anomalies (BHV-*).

No single transaction here is wrong. The shape of the distribution is wrong.
The mathematical-invariant detectors (Benford, round-number, terminal digit)
are baseline-free: they hold whatever the client's own history says, which is
why they survive zero_trust mode.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from ledgerlens.context import AnalysisContext
from ledgerlens.contracts import Action, Entities, Finding
from ledgerlens.detect._helpers import inr, make
from ledgerlens.registry import detector

# Expected first-digit frequencies under Benford's Law.
BENFORD = {d: np.log10(1 + 1 / d) for d in range(1, 10)}
# χ² critical values at 8 degrees of freedom.
CHI2_CRIT = {0.05: 15.507, 0.01: 20.090, 0.001: 26.125}


@detector("BHV-001", "PO splitting below an approval threshold")
class POSplitting:
    """n orders, one vendor, one window, each below the threshold. Each order
    passes inspection; the bypass exists only across all of them."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        pos = ctx.pos
        if pos.empty or "po_date" not in pos.columns:
            return []
        cfg = ctx.config
        out: list[Finding] = []
        work = pos.dropna(subset=["po_date", "amount"]).sort_values("po_date")
        for threshold in cfg.thresholds_sorted():
            below = work[work["amount"] < threshold]
            for vendor, grp in below.groupby("vendor_id"):
                if len(grp) < cfg.split_min_orders:
                    continue
                rows = grp.to_dict("records")
                for i in range(len(rows)):
                    window = [rows[i]]
                    for j in range(i + 1, len(rows)):
                        gap = (rows[j]["po_date"] - rows[i]["po_date"]).days
                        if gap > cfg.split_window_days:
                            break
                        window.append(rows[j])
                    if len(window) < cfg.split_min_orders:
                        continue
                    combined = sum(float(r["amount"]) for r in window)
                    if combined <= threshold:
                        continue
                    # each order must be meaningfully close to the limit,
                    # or this is just a busy week
                    near = [r for r in window
                            if float(r["amount"]) >= threshold * (1 - cfg.threshold_hug_band)]
                    if len(near) < cfg.split_min_orders:
                        continue
                    po_ids = [str(r["po_id"]) for r in window]
                    approvers = {str(r.get("approver_id")) for r in window if r.get("approver_id")}
                    span = (window[-1]["po_date"] - window[0]["po_date"]).days
                    out.append(make(
                        "BHV-001", key=tuple(sorted(po_ids)),
                        entities=Entities(vendor_id=str(vendor), po_ids=po_ids),
                        evidence={
                            "order_count": len(window), "threshold": threshold,
                            "each_amount": [round(float(r["amount"]), 2) for r in window],
                            "combined": round(combined, 2), "window_days": int(span),
                            "approvers": sorted(approvers),
                            "closest_to_threshold_pct": round(
                                max(float(r["amount"]) for r in window) / threshold * 100, 1),
                        },
                        money=combined, confidence=min(0.95, 0.6 + 0.08 * len(window)),
                        explanation=(
                            f"{len(window)} purchase orders to "
                            f"{ctx.vendor_name(str(vendor))} totalling {inr(combined)} were "
                            f"raised within {span} day(s), each one below the "
                            f"{inr(threshold)} approval threshold. Individually every order "
                            f"is correctly authorised; together they exceed the limit that "
                            f"would have required a higher approval."
                        ),
                        action=Action(
                            kind="escalate", label="Review the aggregate against the threshold",
                            detail=f"Retrospective review of {', '.join(po_ids[:6])}, and a control "
                                   f"change to aggregate a vendor's orders over a rolling "
                                   f"{cfg.split_window_days}-day window.",
                        ),
                        score=[(f"{len(window)} orders inside one approval window", 24),
                               ("Each order sits just below the threshold", 20),
                               ("Single approver across the set", 11)
                               if len(approvers) == 1 else ("Multiple approvers", 4)],
                        detected_at=str(window[-1]["po_date"])[:10],
                    ))
                    break          # one finding per vendor-threshold is enough
        return out


@detector("BHV-002", "Threshold-hugging distribution", baseline_free=True)
class ThresholdHugging:
    """Mass just under a limit against the density either side of it. A
    structural property of the distribution, not of the client's history."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        pos = ctx.pos
        if pos.empty or len(pos) < 40:
            return []
        cfg = ctx.config
        amounts = pd.to_numeric(pos["amount"], errors="coerce").dropna()
        out: list[Finding] = []
        for threshold in cfg.thresholds_sorted():
            band = threshold * cfg.threshold_hug_band
            just_below = amounts[(amounts >= threshold - band) & (amounts < threshold)]
            just_above = amounts[(amounts >= threshold) & (amounts < threshold + band)]
            if len(just_below) < 5:
                continue
            ratio = len(just_below) / max(len(just_above), 1)
            if ratio < 3:
                continue
            excess = len(just_below) - len(just_above)
            exposure = float(just_below.sum())
            out.append(make(
                "BHV-002", key=(threshold,),
                entities=Entities(),
                evidence={"threshold": threshold, "band_pct": cfg.threshold_hug_band * 100,
                          "orders_just_below": int(len(just_below)),
                          "orders_just_above": int(len(just_above)),
                          "ratio": round(ratio, 2), "excess_orders": int(excess),
                          "value_just_below": round(exposure, 2)},
                money=exposure, confidence=min(0.9, 0.55 + 0.05 * ratio),
                explanation=(
                    f"{len(just_below)} purchase orders sit in the {cfg.threshold_hug_band * 100:.0f}% "
                    f"band immediately below the {inr(threshold)} approval threshold, against "
                    f"{len(just_above)} immediately above it — a ratio of {ratio:.1f} to 1. "
                    f"Ordinary purchasing does not produce that cliff."
                ),
                action=Action(kind="investigate", label="Sample the orders under the limit",
                              detail="Pull a sample from the band and verify each against a "
                                     "requisition and a receipt."),
                score=[("Distribution mass parks below a control limit", 22)],
            ))
        return out


@detector("BHV-003", "Benford's Law on leading digits", baseline_free=True)
class BenfordLaw:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        cfg = ctx.config
        if inv.empty or len(inv) < cfg.benford_min_sample:
            return []
        out: list[Finding] = []
        groups: list[tuple[str | None, pd.Series]] = [(None, inv["amount"])]
        for vendor, grp in inv.groupby("vendor_id"):
            if len(grp) >= cfg.benford_min_sample:
                groups.append((str(vendor), grp["amount"]))

        for vendor, amounts in groups:
            vals = pd.to_numeric(amounts, errors="coerce").dropna()
            vals = vals[vals > 0]
            if len(vals) < cfg.benford_min_sample:
                continue
            lead = vals.astype(str).str.replace(r"[^1-9]", "", regex=True).str[:1]
            lead = pd.to_numeric(lead, errors="coerce").dropna().astype(int)
            counts = lead.value_counts().reindex(range(1, 10), fill_value=0)
            n = int(counts.sum())
            if n < cfg.benford_min_sample:
                continue
            expected = pd.Series({d: BENFORD[d] * n for d in range(1, 10)})
            chi2 = float((((counts - expected) ** 2) / expected).sum())
            crit = CHI2_CRIT[cfg.benford_alpha] if cfg.benford_alpha in CHI2_CRIT else 20.090
            if chi2 <= crit:
                continue
            dev = (counts / n - pd.Series(BENFORD)).abs()
            worst = int(dev.idxmax())
            out.append(make(
                "BHV-003", key=(vendor or "corpus",),
                entities=Entities(vendor_id=vendor),
                evidence={"scope": vendor or "whole corpus", "sample_size": n,
                          "chi_square": round(chi2, 2), "degrees_of_freedom": 8,
                          "critical_value": crit, "alpha": cfg.benford_alpha,
                          "worst_digit": worst,
                          "observed_pct": round(float(counts[worst]) / n * 100, 2),
                          "expected_pct": round(BENFORD[worst] * 100, 2),
                          "observed_distribution": {int(d): int(counts[d]) for d in range(1, 10)}},
                money=0.0, confidence=0.8,
                explanation=(
                    f"Leading digits across {n} amounts deviate from Benford's Law with "
                    f"χ² {chi2:.1f} against a critical value of {crit} at 8 degrees of freedom. "
                    f"Digit {worst} appears in {counts[worst] / n * 100:.1f}% of amounts against "
                    f"an expected {BENFORD[worst] * 100:.1f}%, which is consistent with amounts "
                    f"being chosen rather than incurred."
                ),
                action=Action(kind="investigate", label="Sample-test the over-represented digit",
                              detail=f"Pull 20 documents whose amount begins with {worst} and "
                                     f"verify each against a receipt."),
                score=[("Benford deviation beyond the critical value", 18)],
            ))
        return out


@detector("BHV-004", "Round-number bias", baseline_free=True)
class RoundNumberBias:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or len(inv) < 100:
            return []
        out: list[Finding] = []
        for vendor, grp in inv.groupby("vendor_id"):
            vals = pd.to_numeric(grp["amount"], errors="coerce").dropna()
            if len(vals) < 30:
                continue
            round_share = float((vals % 1000 == 0).mean())
            # genuine invoice totals carry tax and land on odd figures
            if round_share < 0.35:
                continue
            exposure = float(vals[vals % 1000 == 0].sum())
            out.append(make(
                "BHV-004", key=(str(vendor),),
                entities=Entities(vendor_id=str(vendor)),
                evidence={"invoices": int(len(vals)),
                          "round_thousand_share_pct": round(round_share * 100, 1),
                          "round_value": round(exposure, 2)},
                money=exposure, confidence=0.65,
                explanation=(
                    f"{round_share * 100:.0f}% of invoices from "
                    f"{ctx.vendor_name(str(vendor))} are exact multiples of ₹1,000. "
                    f"Invoices computed from quantities and tax rates rarely land on round "
                    f"figures at that rate."
                ),
                action=Action(kind="investigate", label="Verify the underlying calculations",
                              detail="Check line-item arithmetic and tax on a sample."),
                score=[("Round-number rate far above chance", 14)],
            ))
        return out


@detector("BHV-005", "Off-hours submission")
class OffHours:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "submitted_at" not in inv.columns:
            return []
        cfg = ctx.config
        work = inv.dropna(subset=["submitted_at"]).copy()
        if work.empty:
            return []
        hours = pd.to_datetime(work["submitted_at"]).dt.hour
        off = (hours >= cfg.off_hours_start) | (hours < cfg.off_hours_end)
        corpus_rate = float(off.mean())
        out: list[Finding] = []
        for vendor, grp in work.groupby("vendor_id"):
            if len(grp) < 10:
                continue
            h = pd.to_datetime(grp["submitted_at"]).dt.hour
            o = (h >= cfg.off_hours_start) | (h < cfg.off_hours_end)
            rate = float(o.mean())
            if rate < 0.2 or rate < corpus_rate * 3:
                continue
            exposure = float(pd.to_numeric(grp.loc[o.values, "amount"], errors="coerce").sum())
            out.append(make(
                "BHV-005", key=(str(vendor),),
                entities=Entities(vendor_id=str(vendor),
                                  invoice_ids=grp.loc[o.values, "invoice_id"].astype(str).tolist()[:40]),
                evidence={"off_hours_invoices": int(o.sum()), "vendor_invoices": int(len(grp)),
                          "vendor_rate_pct": round(rate * 100, 1),
                          "corpus_rate_pct": round(corpus_rate * 100, 2),
                          "window": f"{cfg.off_hours_start:02d}:00–{cfg.off_hours_end:02d}:00"},
                money=exposure, confidence=0.7,
                explanation=(
                    f"{rate * 100:.0f}% of invoices from {ctx.vendor_name(str(vendor))} are "
                    f"filed between {cfg.off_hours_start:02d}:00 and {cfg.off_hours_end:02d}:00, "
                    f"against a corpus rate of {corpus_rate * 100:.1f}%."
                ),
                action=Action(kind="investigate", label="Check who is filing, and when",
                              detail="Reconcile submission user and IP against the roster."),
                score=[("Off-hours submission far above the corpus rate", 14)],
            ))
        return out


@detector("BHV-006", "Weekend and holiday filing")
class WeekendFiling:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        col = "submitted_at" if "submitted_at" in inv.columns else "invoice_date"
        if inv.empty or col not in inv.columns:
            return []
        work = inv.dropna(subset=[col])
        if len(work) < 30:
            return []
        dow = pd.to_datetime(work[col]).dt.dayofweek
        weekend = dow >= 5
        rate = float(weekend.mean())
        if rate < 0.15:
            return []
        exposure = float(pd.to_numeric(work.loc[weekend.values, "amount"], errors="coerce").sum())
        return [make(
            "BHV-006", key=("weekend",),
            entities=Entities(invoice_ids=work.loc[weekend.values, "invoice_id"].astype(str).tolist()[:40]),
            evidence={"weekend_documents": int(weekend.sum()), "total": int(len(work)),
                      "rate_pct": round(rate * 100, 1)},
            money=exposure, confidence=0.6,
            explanation=(
                f"{weekend.sum()} of {len(work)} documents ({rate * 100:.0f}%) are dated on a "
                f"Saturday or Sunday, when the approval chain is not staffed."
            ),
            action=Action(kind="investigate", label="Confirm weekend authorisation",
                          detail="Verify who approved these outside working days."),
            score=[("Weekend filing rate elevated", 10)],
        )]


@detector("BHV-007", "Fiscal year-end spend dumping")
class YearEndDumping:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "invoice_date" not in inv.columns or len(inv) < 50:
            return []
        cfg = ctx.config
        work = inv.dropna(subset=["invoice_date"]).copy()
        work["_m"] = pd.to_datetime(work["invoice_date"]).dt.month
        monthly = work.groupby("_m")["amount"].sum()
        if len(monthly) < 6:
            return []
        year_end_month = 12 if cfg.fiscal_year_start_month == 1 else cfg.fiscal_year_start_month - 1
        if year_end_month not in monthly.index:
            return []
        others = monthly.drop(index=year_end_month)
        mean_other = float(others.mean())
        ye = float(monthly[year_end_month])
        if mean_other <= 0 or ye / mean_other < cfg.year_end_multiple:
            return []
        excess = ye - mean_other
        return [make(
            "BHV-007", key=(year_end_month,),
            entities=Entities(),
            evidence={"fiscal_year_end_month": year_end_month,
                      "year_end_spend": round(ye, 2),
                      "mean_other_months": round(mean_other, 2),
                      "multiple": round(ye / mean_other, 2),
                      "excess_over_mean": round(excess, 2)},
            money=excess, confidence=0.72,
            explanation=(
                f"Month {year_end_month} carries {ye / mean_other:.1f}× the mean spend of every "
                f"other month. Budget that would otherwise lapse is being converted into "
                f"inventory at the year end."
            ),
            action=Action(kind="investigate", label="Match year-end orders to demand",
                          detail="Compare year-end requisitions to the following quarter's "
                                 "consumption; carry budget forward instead."),
            score=[("Year-end spend multiple above threshold", 16)],
        )]


@detector("BHV-008", "Maverick (off-contract) spend")
class MaverickSpend:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "po_id" not in inv.columns:
            return []
        no_po = inv[inv["po_id"].isna() | (inv["po_id"].astype(str).str.strip() == "")]
        if no_po.empty or len(no_po) / len(inv) < 0.05:
            return []
        exposure = float(pd.to_numeric(no_po["amount"], errors="coerce").sum())
        return [make(
            "BHV-008", key=("maverick",),
            entities=Entities(invoice_ids=no_po["invoice_id"].astype(str).tolist()[:50]),
            evidence={"invoices_without_po": int(len(no_po)), "total_invoices": int(len(inv)),
                      "share_pct": round(len(no_po) / len(inv) * 100, 1),
                      "value": round(exposure, 2)},
            money=exposure, confidence=0.75,
            explanation=(
                f"{len(no_po)} invoices ({len(no_po) / len(inv) * 100:.0f}% of the corpus) worth "
                f"{inr(exposure)} carry no purchase order, so no price or quantity was agreed "
                f"before the commitment was made."
            ),
            action=Action(kind="investigate", label="Bring off-contract spend under PO",
                          detail="Require a PO before commitment for these categories."),
            score=[("Spend committed without a purchase order", 15)],
        )]


@detector("BHV-009", "Quantity absurdity against headcount")
class QuantityAbsurdity:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        lines = ctx.lines
        cfg = ctx.config
        if lines.empty or not cfg.headcount or "sku_id" not in lines.columns:
            return []
        qty_col = "qty_canonical" if "qty_canonical" in lines.columns else "qty"
        out: list[Finding] = []
        for sku, grp in lines.groupby("sku_id"):
            total = float(pd.to_numeric(grp[qty_col], errors="coerce").sum())
            per_head = total / cfg.headcount
            if per_head < 50:
                continue
            price = float(pd.to_numeric(grp.get("unit_price"), errors="coerce").median() or 0)
            out.append(make(
                "BHV-009", key=(str(sku),),
                entities=Entities(sku_ids=[str(sku)]),
                evidence={"sku_id": str(sku), "total_qty": round(total, 2),
                          "headcount": cfg.headcount, "per_head": round(per_head, 1)},
                money=total * price, confidence=0.55,
                explanation=(
                    f"{total:.0f} units of this item were purchased for {cfg.headcount} people — "
                    f"{per_head:.0f} per head. The quantity is not consistent with plausible "
                    f"consumption."
                ),
                action=Action(kind="investigate", label="Verify physical stock",
                              detail="Reconcile purchases against a stock count."),
                score=[("Quantity implausible against headcount", 12)],
            ))
        return out


@detector("BHV-010", "Emergency-procurement abuse")
class EmergencyAbuse:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        pos = ctx.pos
        flag_col = next((c for c in ("procurement_type", "urgency", "po_type")
                         if c in pos.columns), None)
        if pos.empty or not flag_col:
            return []
        emergency = pos[pos[flag_col].astype(str).str.lower()
                        .str.contains("emergency|urgent|single.?source|nomination", na=False)]
        if len(emergency) < 3:
            return []
        out: list[Finding] = []
        by_approver = emergency.groupby("approver_id") if "approver_id" in emergency.columns else []
        for approver, grp in by_approver:
            if len(grp) < 5:
                continue
            exposure = float(pd.to_numeric(grp["amount"], errors="coerce").sum())
            out.append(make(
                "BHV-010", key=(str(approver),),
                entities=Entities(po_ids=grp["po_id"].astype(str).tolist()[:40]),
                evidence={"approver": str(approver), "emergency_orders": int(len(grp)),
                          "share_of_all_emergency_pct": round(len(grp) / len(emergency) * 100, 1),
                          "value": round(exposure, 2)},
                money=exposure, confidence=0.7,
                explanation=(
                    f"{len(grp)} emergency or single-source orders worth {inr(exposure)} were "
                    f"authorised by one approver. The route that exists to bypass competitive "
                    f"tendering is concentrated in one pair of hands."
                ),
                action=Action(kind="escalate", label="Review the emergency justifications",
                              detail="Confirm each invocation met the policy definition."),
                score=[("Emergency route concentrated on one approver", 18)],
            ))
        return out


@detector("BHV-011", "Isolation Forest multivariate outliers")
class IsolationForestOutliers:
    """Catches combinations no single-column rule is looking for: an ordinary
    amount, from an ordinary vendor, at an ordinary hour — but never together."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or len(inv) < 60:
            return []
        from sklearn.ensemble import IsolationForest

        feats = pd.DataFrame(index=inv.index)
        feats["amount"] = pd.to_numeric(inv["amount"], errors="coerce")
        feats["log_amount"] = np.log1p(feats["amount"].clip(lower=0))
        if "invoice_date" in inv.columns:
            d = pd.to_datetime(inv["invoice_date"], errors="coerce")
            feats["month"] = d.dt.month
            feats["dow"] = d.dt.dayofweek
        if "submitted_at" in inv.columns:
            feats["hour"] = pd.to_datetime(inv["submitted_at"], errors="coerce").dt.hour
        vendor_freq = inv["vendor_id"].map(inv["vendor_id"].value_counts())
        feats["vendor_freq"] = vendor_freq
        feats = feats.fillna(feats.median(numeric_only=True)).fillna(0)
        if feats.shape[1] < 3:
            return []

        model = IsolationForest(
            n_estimators=200, contamination=0.02,
            random_state=ctx.config.seed,      # determinism is a hard rule
        )
        pred = model.fit_predict(feats.to_numpy())
        scores = model.score_samples(feats.to_numpy())
        flagged = inv[pred == -1]
        if flagged.empty:
            return []

        out: list[Finding] = []
        for idx, row in flagged.iterrows():
            amount = float(pd.to_numeric(row["amount"], errors="coerce") or 0)
            if amount <= 0:
                continue
            drivers = feats.loc[idx]
            median = feats.median(numeric_only=True)
            unusual = sorted(
                ((c, float(drivers[c]), float(median[c])) for c in feats.columns
                 if median[c] and abs(drivers[c] - median[c]) / (abs(median[c]) + 1e-9) > 0.5),
                key=lambda t: -abs(t[1] - t[2]) / (abs(t[2]) + 1e-9),
            )[:3]
            out.append(make(
                "BHV-011", key=(str(row["invoice_id"]),),
                entities=Entities(invoice_ids=[str(row["invoice_id"])],
                                  vendor_id=str(row.get("vendor_id"))),
                evidence={"isolation_score": round(float(scores[inv.index.get_loc(idx)]), 4),
                          "contamination": 0.02, "n_estimators": 200,
                          "seed": ctx.config.seed,
                          "features_used": list(feats.columns),
                          "unusual_features": [
                              {"feature": c, "value": round(v, 2), "corpus_median": round(m, 2)}
                              for c, v, m in unusual]},
                money=amount, confidence=0.55,
                explanation=(
                    f"This invoice sits in the most isolated 2% of the corpus across "
                    f"{len(feats.columns)} dimensions considered together"
                    + (f", driven by {', '.join(c for c, _, _ in unusual)}" if unusual else "")
                    + ". No single field is unusual on its own."
                ),
                action=Action(kind="investigate", label="Manual review of this document",
                              detail="Multivariate outlier: review rather than act."),
                score=[("Multivariate isolation outlier", 10)],
            ))
        return out[:25]
