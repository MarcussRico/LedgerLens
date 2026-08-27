"""
Vendor entity resolution.

"Sharma Traders", "M/s Sharma Traders Pvt Ltd" and "SHARMA TRADERS PVT LTD" are
one commercial counterparty. Until they are one row, a duplicate-payment check
cannot see across them and a spend total is wrong.

Two mechanisms, in strict order:
  1. Hard joins on identity facts — GSTIN, PAN, bank account. These are not
     similarities; two vendors on one bank account ARE one payee.
  2. Fuzzy name match on a normalised trade name, but only within the same
     hard-join component boundary conditions (see below).

Union-find gives the connected components. The canonical id is deterministic
(lowest vendor_id in the component) so the same input always resolves the same
way — a resolution that shifts between runs makes every downstream number
irreproducible.
"""
from __future__ import annotations

import re

import pandas as pd
from rapidfuzz import fuzz, process

# Legal-form and honorific noise that carries no identity signal.
_NOISE = re.compile(
    r"(\bm/s\b|\bm\s*/\s*s\b|\bmessrs\b)|"
    r"\b(pvt|private|ltd|limited|llp|inc|corp|corporation|co|company|"
    r"enterprises?|enterprise|and|&|the|india|indian)\b",
    re.I,
)
_PUNCT = re.compile(r"[^a-z0-9\s]")
_SPACE = re.compile(r"\s+")

NAME_MATCH_THRESHOLD = 88     # rapidfuzz token_sort_ratio


def normalise_name(raw: str) -> str:
    """'M/s Sharma Traders Pvt. Ltd.' -> 'sharma traders'"""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    s = str(raw).lower()
    s = _NOISE.sub(" ", s)          # before punctuation: "m/s" must still match
    s = _PUNCT.sub(" ", s)
    s = _NOISE.sub(" ", s)          # again: punctuation removal exposes more
    return _SPACE.sub(" ", s).strip()


def _norm_key(v) -> str | None:
    """Identity facts compared on digits/letters only — bank accounts and PANs
    arrive with spaces, dashes and inconsistent case."""
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return None
    s = re.sub(r"[^A-Za-z0-9]", "", str(v)).upper()
    return s or None


class _UnionFind:
    def __init__(self) -> None:
        self.parent: dict[str, str] = {}

    def find(self, a: str) -> str:
        self.parent.setdefault(a, a)
        while self.parent[a] != a:
            self.parent[a] = self.parent[self.parent[a]]
            a = self.parent[a]
        return a

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        # deterministic: the lexicographically smaller root always wins
        lo, hi = (ra, rb) if ra < rb else (rb, ra)
        self.parent[hi] = lo


def resolve_vendors(
    vendors: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, str], list[dict]]:
    """Returns (vendors with entity_id, alias_map, evidence of each merge).

    Merge evidence entries whose basis is "shared bank account (unmerged)" are
    handed to the integrity pillar as ring candidates rather than applied.
    """
    if vendors.empty:
        return vendors, {}, []

    df = vendors.copy()
    df["vendor_id"] = df["vendor_id"].astype(str)
    uf = _UnionFind()
    for vid in df["vendor_id"]:
        uf.find(vid)

    merges: list[dict] = []

    # ── 1. hard joins on *legal identity* ─────────────────────────────────
    # GSTIN and PAN are registrations: two records carrying one of them are one
    # legal entity. A shared BANK ACCOUNT is deliberately NOT here — see below.
    for field, label in (("gstin", "identical GSTIN"), ("pan", "identical PAN")):
        if field not in df.columns:
            continue
        keys = df[field].map(_norm_key)
        for key, group in df.groupby(keys.rename("k"), dropna=True):
            ids = group["vendor_id"].tolist()
            if len(ids) < 2:
                continue
            for other in ids[1:]:
                uf.union(ids[0], other)
            merges.append({"basis": label, "value": key, "vendor_ids": ids})

    # ── 1b. shared bank account: identity only when the names agree ───────
    # Three differently-named vendors paid into one account is the collusion
    # finding (VND-001), not an alias group. Merging them would erase exactly
    # the thing we exist to detect. We merge only where the trade names already
    # match, and otherwise record the account as a ring signal for P4.
    shared_accounts: list[dict] = []
    if "bank_account" in df.columns:
        keys = df["bank_account"].map(_norm_key)
        name_of = dict(zip(df["vendor_id"], df.get("name", df["vendor_id"]), strict=False))
        for key, group in df.groupby(keys.rename("k"), dropna=True):
            ids = group["vendor_id"].tolist()
            if len(ids) < 2:
                continue
            norm = {vid: normalise_name(str(name_of.get(vid, ""))) for vid in ids}
            merged_ids: set[str] = set()
            for i, a in enumerate(ids):
                for b in ids[i + 1:]:
                    same_name = fuzz.token_sort_ratio(norm[a], norm[b]) >= NAME_MATCH_THRESHOLD
                    if same_name and not _contradicts(df, a, b):
                        uf.union(a, b)
                        merged_ids.update((a, b))
            if merged_ids:
                # evidence lists only what actually merged, not everyone on the account
                merges.append({"basis": "shared bank account, matching trade name",
                               "value": key, "vendor_ids": sorted(merged_ids)})
            distinct = {n for n in norm.values() if n}
            if len(distinct) > 1:
                shared_accounts.append({
                    "bank_account": key,
                    "vendor_ids": ids,
                    "names": [str(name_of.get(v, v)) for v in ids],
                })

    # ── 2. fuzzy trade name ───────────────────────────────────────────────
    if "name" in df.columns:
        df["_norm"] = df["name"].map(normalise_name)
        candidates = df[df["_norm"].str.len() > 2]
        names = candidates["_norm"].tolist()
        ids = candidates["vendor_id"].tolist()
        seen: set[tuple[str, str]] = set()
        for i, name in enumerate(names):
            matches = process.extract(
                name, names, scorer=fuzz.token_sort_ratio,
                score_cutoff=NAME_MATCH_THRESHOLD, limit=6,
            )
            for matched_name, score, j in matches:
                if i == j:
                    continue
                a, b = ids[i], ids[j]
                pair = (a, b) if a < b else (b, a)
                if pair in seen:
                    continue
                seen.add(pair)
                # A name match must not override a hard *contradiction*: two
                # vendors with different, valid GSTINs are different legal
                # entities however alike their names read.
                if _contradicts(df, a, b):
                    continue
                uf.union(a, b)
                merges.append({"basis": "trade name match",
                               "value": f"{name!r} ≈ {matched_name!r} ({score:.0f}%)",
                               "vendor_ids": [a, b]})
        df = df.drop(columns=["_norm"])

    for sa in shared_accounts:
        merges.append({"basis": "shared bank account (unmerged - ring candidate)",
                       "value": sa["bank_account"], "vendor_ids": sa["vendor_ids"],
                       "names": sa["names"]})

    df["entity_id"] = df["vendor_id"].map(uf.find)
    alias_map = dict(zip(df["vendor_id"], df["entity_id"], strict=True))

    # canonical display name: the longest name in the component, which is
    # almost always the fullest legal form
    if "name" in df.columns:
        canon = (df.assign(_len=df["name"].astype(str).str.len())
                   .sort_values("_len", ascending=False)
                   .groupby("entity_id")["name"].first())
        df["entity_name"] = df["entity_id"].map(canon)

    return df, alias_map, merges


def _contradicts(df: pd.DataFrame, a: str, b: str) -> bool:
    """True when two vendors carry different non-null values for an identity
    field — evidence they are genuinely distinct."""
    for field in ("gstin", "pan"):
        if field not in df.columns:
            continue
        va = _norm_key(df.loc[df["vendor_id"] == a, field].iloc[0])
        vb = _norm_key(df.loc[df["vendor_id"] == b, field].iloc[0])
        if va and vb and va != vb:
            return True
    return False


def apply_resolution(frames: dict[str, pd.DataFrame], alias_map: dict[str, str]) -> None:
    """Rewrite vendor_id to entity_id everywhere, in place. After this call no
    downstream code should ever see an alias id."""
    for name, frame in frames.items():
        if frame is None or frame.empty or "vendor_id" not in frame.columns:
            continue
        frame["vendor_id_raw"] = frame["vendor_id"]
        frame["vendor_id"] = frame["vendor_id"].astype(str).map(
            lambda v: alias_map.get(v, v)
        )
