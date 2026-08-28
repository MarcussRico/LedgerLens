"""
P4 — Vendor Integrity & Collusion (VND-*).

These are structural facts, not trends: two vendors sharing a bank account share
it whatever the history says. That is why the whole pillar is baseline-free and
survives zero_trust mode.

This is also where resolution's restraint pays off. Vendors sharing an account
under *different* trade names were deliberately not merged during resolution,
precisely so this pillar can see them.
"""
from __future__ import annotations

import math
import re

import networkx as nx
import pandas as pd

from ledgerlens.context import AnalysisContext
from ledgerlens.contracts import Action, Entities, Finding
from ledgerlens.detect._helpers import inr, make
from ledgerlens.registry import detector

SHARED_ATTRS = [
    ("bank_account", "bank account", 28),
    ("pan", "PAN", 24),
    ("address", "registered address", 20),
    ("phone", "phone number", 16),
    ("email_domain", "email domain", 12),
]


def _prevalence_discount(n_sharing: int) -> float:
    """How much a shared value is worth when many vendors share it.

    Two vendors at one address is a fact about those two. Eight vendors at one
    address is an industrial estate, and says almost nothing about any pair
    within it. 1 / (1 + log2(n-1)) is gentle on pairs and harsh on cohorts.
    """
    if n_sharing <= 2:
        return 1.0
    return 1.0 / (1.0 + math.log2(n_sharing - 1))


def _key(v) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = re.sub(r"[^A-Za-z0-9]", "", str(v)).upper()
    return s or None


def _norm_addr(v) -> str | None:
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = re.sub(r"[^a-z0-9]", "", str(v).lower())
    return s or None


def _vendor_spend(ctx: AnalysisContext) -> dict[str, float]:
    if ctx.invoices.empty:
        return {}
    return (ctx.invoices.groupby("vendor_id")["amount"]
            .sum().astype(float).to_dict())


@detector("VND-001", "Shared-attribute vendor rings", baseline_free=True)
class VendorRings:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        vendors = ctx.vendors
        if vendors.empty or len(vendors) < 2:
            return []
        spend = _vendor_spend(ctx)
        graph = nx.Graph()
        graph.add_nodes_from(vendors["vendor_id"].astype(str))

        cfg = ctx.config
        weights = cfg.ring_attribute_weight
        discounted = set(cfg.ring_prevalence_discounted)
        ignored_domains = {d.lower() for d in cfg.ring_ignored_domains}
        suppressed: list[dict] = []

        for field, label, points in SHARED_ATTRS:
            if field not in vendors.columns:
                continue
            norm = (vendors[field].map(_norm_addr) if field == "address"
                    else vendors[field].map(_key))
            base = weights.get(label, 0.0)
            if base <= 0:
                continue
            for value, grp in vendors.groupby(norm.rename("k"), dropna=True):
                ids = grp["vendor_id"].astype(str).tolist()
                if len(ids) < 2:
                    continue
                # a free-mail or hosting domain carries no identity signal
                if field == "email_domain" and str(value).lower() in ignored_domains:
                    suppressed.append({"attribute": label, "value": str(value),
                                       "vendors": len(ids), "reason": "generic domain"})
                    continue
                discount = _prevalence_discount(len(ids)) if label in discounted else 1.0
                evidence_weight = base * discount
                for i, a in enumerate(ids):
                    for b in ids[i + 1:]:
                        if graph.has_edge(a, b):
                            graph[a][b]["attrs"].append(label)
                            graph[a][b]["evidence"] += evidence_weight
                            graph[a][b]["points"] += points
                            graph[a][b]["values"][label] = str(value)
                        else:
                            graph.add_edge(a, b, attrs=[label],
                                           evidence=evidence_weight, points=points,
                                           values={label: str(value)})

        # Drop links that do not carry enough evidence to be worth asserting.
        # A false collusion finding implicitly claims a relationship between a
        # named vendor and, often, a named employee. That costs more than a
        # false duplicate, so this pillar is deliberately held to a higher bar.
        thin = [(a, b, d) for a, b, d in graph.edges(data=True)
                if d["evidence"] < cfg.ring_link_threshold]
        for a, b, d in thin:
            suppressed.append({
                "attribute": " + ".join(sorted(set(d["attrs"]))),
                "vendors": 2, "evidence": round(d["evidence"], 3),
                "threshold": cfg.ring_link_threshold,
                "reason": "shared attributes too weak to assert a relationship",
            })
            graph.remove_edge(a, b)

        out: list[Finding] = []
        for component in nx.connected_components(graph):
            if len(component) < 2:
                continue
            sub = graph.subgraph(component)
            if not sub.edges:
                continue
            shared = sorted({a for _, _, d in sub.edges(data=True) for a in d["attrs"]})
            strongest = max(sub.edges(data=True), key=lambda e: e[2]["evidence"])[2]
            names = {vid: ctx.vendor_name(vid) for vid in sorted(component)}
            ring_spend = sum(spend.get(v, 0.0) for v in component)
            strength = sum(d["points"] for _, _, d in sub.edges(data=True))
            confidence = min(0.95, 0.5 + 0.06 * strength / max(len(component), 1))
            out.append(make(
                "VND-001", key=tuple(sorted(component)),
                entities=Entities(vendor_id=sorted(component)[0]),
                evidence={
                    "vendors_in_ring": len(component),
                    "vendor_ids": sorted(component),
                    "vendor_names": [names[v] for v in sorted(component)],
                    "shared_attributes": shared,
                    # Sorted, and each pair orientated. networkx yields edges in
                    # the iteration order of the component set, and Python
                    # randomises string hashing per process — so the same ring
                    # produced a differently-ordered list on every host and the
                    # audit root did not reproduce.
                    "links": sorted(
                        (
                            {"a": min(a, b), "b": max(a, b),
                             "shared": sorted(set(d["attrs"])),
                             "values": dict(sorted(d.get("values", {}).items()))}
                            for a, b, d in sub.edges(data=True)
                        ),
                        key=lambda e: (e["a"], e["b"]),
                    ),
                    "combined_spend": round(ring_spend, 2),
                    "link_evidence": round(float(strongest["evidence"]), 3),
                    "link_threshold": cfg.ring_link_threshold,
                    "attribute_weights": {a: weights.get(a) for a in shared},
                    "weighting_note": (
                        "Each shared attribute is weighted by how discriminating it is, "
                        "then discounted by how many vendors share the same value. A link "
                        "forms only above the threshold."
                    ),
                },
                money=ring_spend, confidence=confidence,
                explanation=(
                    f"{len(component)} vendors ({', '.join(names[v] for v in sorted(component))}) "
                    f"share {', '.join(shared)}. Independent counterparties do not normally "
                    f"share these attributes; {inr(ring_spend)} has been paid across the group."
                ),
                action=Action(
                    kind="escalate", label="Refer the group for beneficial-ownership checks",
                    detail="Verify the ownership and bank mandates of each vendor in the group "
                           "before releasing further payment.",
                ),
                score=[(f"Shared {a}", w) for _, a, w in
                       [(f, lbl, wt) for f, lbl, wt in SHARED_ATTRS if lbl in shared]],
            ))
        return out


@detector("VND-003", "Vendor linked to an employee", baseline_free=True)
class VendorEmployeeLink:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        vendors, employees = ctx.vendors, ctx.employees
        if vendors.empty or employees.empty:
            return []
        spend = _vendor_spend(ctx)
        pairs = [("bank_account", "bank account", _key),
                 ("address", "registered address", _norm_addr),
                 ("phone", "phone number", _key)]
        out: list[Finding] = []
        seen: set[tuple[str, str]] = set()
        for field, label, fn in pairs:
            if field not in vendors.columns or field not in employees.columns:
                continue
            vkeys = vendors[field].map(fn)
            ekeys = employees[field].map(fn)
            for value in set(vkeys.dropna()) & set(ekeys.dropna()):
                vids = vendors.loc[vkeys == value, "vendor_id"].astype(str).tolist()
                emps = employees.loc[ekeys == value]
                for vid in vids:
                    for _, emp in emps.iterrows():
                        eid = str(emp.get("employee_id", emp.get("name", "?")))
                        if (vid, eid) in seen:
                            continue
                        seen.add((vid, eid))
                        exposure = spend.get(vid, 0.0)
                        out.append(make(
                            "VND-003", key=(vid, eid, label),
                            entities=Entities(vendor_id=vid, employee_ids=[eid]),
                            evidence={"vendor_id": vid, "vendor_name": ctx.vendor_name(vid),
                                      "employee_id": eid,
                                      "employee_name": str(emp.get("name", "")),
                                      "department": str(emp.get("department", "")),
                                      "shared_attribute": label, "shared_value": str(value)},
                            money=exposure, confidence=0.88,
                            explanation=(
                                f"Vendor {ctx.vendor_name(vid)} and employee "
                                f"{emp.get('name', eid)} share a {label}. "
                                f"{inr(exposure)} has been paid to this vendor. This is a "
                                f"conflict-of-interest indicator requiring declaration and review."
                            ),
                            action=Action(kind="escalate", label="Refer for conflict-of-interest review",
                                          detail="Obtain a related-party declaration and review "
                                                 "the employee's involvement in awards."),
                            score=[(f"Vendor and employee share a {label}", 24)],
                        ))
        return out


@detector("VND-005", "Bank-account change before a large payment", baseline_free=True)
class BankChangeBeforePayment:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        changes = getattr(ctx, "bank_changes", None)
        if changes is None or not isinstance(changes, pd.DataFrame) or changes.empty:
            return []
        inv = ctx.invoices
        if inv.empty or "paid_at" not in inv.columns:
            return []
        out: list[Finding] = []
        for _, ch in changes.dropna(subset=["changed_at", "vendor_id"]).iterrows():
            when = pd.to_datetime(ch["changed_at"])
            window = inv[(inv["vendor_id"].astype(str) == str(ch["vendor_id"]))]
            window = window.dropna(subset=["paid_at"])
            after = window[(pd.to_datetime(window["paid_at"]) >= when)
                           & (pd.to_datetime(window["paid_at"]) <= when + pd.Timedelta(days=30))]
            big = after[pd.to_numeric(after["amount"], errors="coerce") >= 1_00_000]
            if big.empty:
                continue
            exposure = float(pd.to_numeric(big["amount"], errors="coerce").sum())
            out.append(make(
                "VND-005", key=(str(ch["vendor_id"]), str(when)[:10]),
                entities=Entities(vendor_id=str(ch["vendor_id"]),
                                  invoice_ids=big["invoice_id"].astype(str).tolist()),
                evidence={"changed_at": str(when)[:10],
                          "old_account": str(ch.get("old_account", "")),
                          "new_account": str(ch.get("new_account", "")),
                          "payments_within_30_days": int(len(big)),
                          "value": round(exposure, 2)},
                money=exposure, confidence=0.9,
                explanation=(
                    f"Payee bank details for {ctx.vendor_name(str(ch['vendor_id']))} changed on "
                    f"{str(when)[:10]}, followed by {len(big)} payment(s) totalling "
                    f"{inr(exposure)} within 30 days. This is the standard mandate-fraud pattern "
                    f"and warrants out-of-band verification."
                ),
                action=Action(kind="block-payment", label="Verify the mandate out of band",
                              detail="Call the vendor on a previously known number before "
                                     "releasing further payment."),
                score=[("Bank change immediately before a large payment", 26)],
            ))
        return out


@detector("VND-002", "Vendor created shortly before its first large order", baseline_free=True)
class NewVendorLargeOrder:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        vendors, pos = ctx.vendors, ctx.pos
        if vendors.empty or pos.empty or "onboarded_at" not in vendors.columns:
            return []
        if "po_date" not in pos.columns:
            return []
        first = pos.dropna(subset=["po_date"]).sort_values("po_date").groupby("vendor_id").first()
        out: list[Finding] = []
        for _, v in vendors.dropna(subset=["onboarded_at"]).iterrows():
            vid = str(v["vendor_id"])
            if vid not in first.index:
                continue
            row = first.loc[vid]
            gap = (pd.to_datetime(row["po_date"]) - pd.to_datetime(v["onboarded_at"])).days
            amount = float(pd.to_numeric(row["amount"], errors="coerce") or 0)
            if gap < 0 or gap > 30 or amount < 1_00_000:
                continue
            out.append(make(
                "VND-002", key=(vid,),
                entities=Entities(vendor_id=vid, po_ids=[str(row.name if "po_id" not in row else row["po_id"])]),
                evidence={"onboarded_at": str(v["onboarded_at"])[:10],
                          "first_po_date": str(row["po_date"])[:10],
                          "days_between": int(gap), "first_po_amount": round(amount, 2)},
                money=amount, confidence=0.7,
                explanation=(
                    f"{ctx.vendor_name(vid)} was onboarded {gap} day(s) before receiving its "
                    f"first order of {inr(amount)}. A vendor created immediately ahead of a "
                    f"large award warrants due-diligence review."
                ),
                action=Action(kind="investigate", label="Review the onboarding file",
                              detail="Confirm competitive selection preceded onboarding."),
                score=[("Vendor onboarded immediately before a large award", 18)],
            ))
        return out


@detector("VND-004", "Sequential invoice numbering to a single customer", baseline_free=True)
class SequentialInvoices:
    """If our invoices from a vendor run 1, 2, 3 … we are their only customer.
    A mathematical property of the sequence, not of our history."""

    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "gst_invoice_no" not in inv.columns:
            return []
        spend = _vendor_spend(ctx)
        out: list[Finding] = []
        for vendor, grp in inv.dropna(subset=["gst_invoice_no"]).groupby("vendor_id"):
            if len(grp) < 8:
                continue
            nums = (grp["gst_invoice_no"].astype(str)
                    .str.extract(r"(\d+)$", expand=False).dropna().astype(int).sort_values())
            if len(nums) < 8:
                continue
            diffs = nums.diff().dropna()
            consecutive = float((diffs == 1).mean())
            if consecutive < 0.7:
                continue
            exposure = spend.get(str(vendor), 0.0)
            out.append(make(
                "VND-004", key=(str(vendor),),
                entities=Entities(vendor_id=str(vendor)),
                evidence={"invoices_examined": int(len(nums)),
                          "consecutive_share_pct": round(consecutive * 100, 1),
                          "first_number": int(nums.iloc[0]), "last_number": int(nums.iloc[-1]),
                          "span": int(nums.iloc[-1] - nums.iloc[0])},
                money=exposure, confidence=0.82,
                explanation=(
                    f"{consecutive * 100:.0f}% of invoice numbers from "
                    f"{ctx.vendor_name(str(vendor))} to us are strictly consecutive. That is "
                    f"only possible if this vendor issues almost no invoices to anyone else, "
                    f"which is characteristic of an entity created to serve one customer."
                ),
                action=Action(kind="investigate", label="Verify the vendor trades independently",
                              detail="Check GST filings and registry facts for other customers."),
                score=[("Invoice sequence implies a single customer", 22)],
            ))
        return out


@detector("VND-006", "Bid rotation or single-bidder awards", baseline_free=True)
class BidRotation:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        bids = getattr(ctx, "bids", None)
        if bids is None or not isinstance(bids, pd.DataFrame) or bids.empty:
            return []
        if not {"tender_id", "vendor_id"} <= set(bids.columns):
            return []
        counts = bids.groupby("tender_id")["vendor_id"].nunique()
        single = counts[counts == 1]
        if single.empty:
            return []
        affected = bids[bids["tender_id"].isin(single.index)]
        value = float(pd.to_numeric(affected.get("amount", pd.Series(dtype=float)),
                                    errors="coerce").sum())
        return [make(
            "VND-006", key=("single-bidder",),
            entities=Entities(vendor_id=str(affected["vendor_id"].mode().iloc[0])),
            evidence={"single_bidder_tenders": int(len(single)),
                      "total_tenders": int(len(counts)),
                      "share_pct": round(len(single) / len(counts) * 100, 1),
                      "value": round(value, 2)},
            money=value, confidence=0.75,
            explanation=(
                f"{len(single)} of {len(counts)} tenders attracted a single bidder. "
                f"Competitive tension was absent from those awards whatever the process record says."
            ),
            action=Action(kind="investigate", label="Review tender publication and scope",
                          detail="Check whether specifications were drawn narrowly."),
            score=[("Tenders with a single bidder", 16)],
        )]


@detector("VND-007", "Approver concentration", baseline_free=True)
class ApproverConcentration:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        pos = ctx.pos
        if pos.empty or "approver_id" not in pos.columns or len(pos) < 25:
            return []
        out: list[Finding] = []
        n_approvers = pos["approver_id"].nunique()
        for vendor, grp in pos.dropna(subset=["approver_id"]).groupby("vendor_id"):
            # a small sample makes concentration likely by chance alone
            if len(grp) < 15 or n_approvers < 4:
                continue
            top = grp["approver_id"].value_counts()
            share = float(top.iloc[0]) / len(grp)
            # probability of this share arising at random across n approvers
            if share < 0.9 or (1.0 / n_approvers) ** (len(grp) * share) > 1e-6:
                continue
            exposure = float(pd.to_numeric(grp["amount"], errors="coerce").sum())
            out.append(make(
                "VND-007", key=(str(vendor), str(top.index[0])),
                entities=Entities(vendor_id=str(vendor),
                                  po_ids=grp["po_id"].astype(str).tolist()[:40]),
                evidence={"approver": str(top.index[0]), "orders_approved": int(top.iloc[0]),
                          "vendor_orders": int(len(grp)),
                          "concentration_pct": round(share * 100, 1),
                          "value": round(exposure, 2)},
                money=exposure, confidence=0.72,
                explanation=(
                    f"{top.iloc[0]} of {len(grp)} orders to {ctx.vendor_name(str(vendor))} "
                    f"({share * 100:.0f}%) were approved by one person, covering "
                    f"{inr(exposure)}. Concentration removes the independent check that "
                    f"rotation provides."
                ),
                action=Action(kind="investigate", label="Rotate approval for this vendor",
                              detail="Introduce a second approver for this relationship."),
                score=[("Single approver dominates a vendor relationship", 14)],
            ))
        return out


@detector("VND-008", "Dormant vendor reactivation", baseline_free=True)
class DormantReactivation:
    def run(self, ctx: AnalysisContext) -> list[Finding]:
        inv = ctx.invoices
        if inv.empty or "invoice_date" not in inv.columns:
            return []
        out: list[Finding] = []
        for vendor, grp in inv.dropna(subset=["invoice_date"]).groupby("vendor_id"):
            if len(grp) < 3:
                continue
            dates = pd.to_datetime(grp["invoice_date"]).sort_values()
            gaps = dates.diff().dt.days.dropna()
            if gaps.empty or gaps.max() < 365:
                continue
            idx = gaps.idxmax()
            resumed = dates.loc[idx]
            after = grp[pd.to_datetime(grp["invoice_date"]) >= resumed]
            exposure = float(pd.to_numeric(after["amount"], errors="coerce").sum())
            if exposure < 50_000:
                continue
            out.append(make(
                "VND-008", key=(str(vendor),),
                entities=Entities(vendor_id=str(vendor)),
                evidence={"dormant_days": int(gaps.max()),
                          "reactivated_on": str(resumed)[:10],
                          "invoices_since": int(len(after)),
                          "value_since": round(exposure, 2)},
                money=exposure, confidence=0.6,
                explanation=(
                    f"{ctx.vendor_name(str(vendor))} was dormant for {gaps.max():.0f} days, then "
                    f"resumed on {str(resumed)[:10]} and has since billed {inr(exposure)}. "
                    f"Reactivated vendor records are a known vector because the master data is "
                    f"already approved."
                ),
                action=Action(kind="investigate", label="Re-verify the vendor's details",
                              detail="Confirm bank mandate and ownership are unchanged."),
                score=[("Long-dormant vendor reactivated", 12)],
            ))
        return out
