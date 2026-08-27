"""
SKU normalisation.

"A4 PAPER 75GSM RM", "Copier paper A-4 (75 gsm) 500sh" and "Paper, A4, white,
75gsm" are one catalogue item. Until they are, comparing their unit prices
compares strings, and every price finding built on top is noise.

Clustering is deterministic: descriptions are canonicalised, then grouped by a
blocking key (so we never do an O(n²) comparison across the whole corpus), then
fuzzy-matched within each block. Cluster ids derive from the lexicographically
smallest member, so the same corpus always yields the same catalogue.
"""
from __future__ import annotations

import re
from collections import defaultdict

import pandas as pd
from rapidfuzz import fuzz

DESC_MATCH_THRESHOLD = 82

# Abbreviations that appear constantly in Indian procurement descriptions.
_EXPAND = {
    r"\bgsm\b": "gsm", r"\bpc?s\b": "", r"\bnos?\b": "", r"\bqty\b": "",
    r"\brm\b": "ream", r"\bsh\b": "sheet", r"\bpkt\b": "packet",
    r"\bmtr?\b": "metre", r"\bltr?\b": "litre", r"\bkgs?\b": "kg",
    r"\bw/?o\b": "without", r"\bc/?w\b": "with", r"\bassy\b": "assembly",
    r"\bqnty\b": "", r"\bapprox\b": "", r"\bsize\b": "",
}
_STOP = {"the", "of", "for", "and", "with", "a", "an", "in", "to", "as", "per"}
_PUNCT = re.compile(r"[^a-z0-9\s]")
_SPACE = re.compile(r"\s+")
# Units must be word-bounded and at least two characters: a bare "w" turned
# "a4 white" into "a4white" and silently split a SKU into two.
_NUMUNIT = re.compile(
    r"(\d+)\s*(gsm|mm|cm|mtr|metre|ml|ltr|litre|kg|watt|inch|ply|ton|mt)\b"
)
# "A-4", "A 4" and "A4" are the same token; joining them is what lets a
# hyphenated export match an unhyphenated one.
_ALPHANUM_SPLIT = re.compile(r"\b([a-z])\s+(\d)")


def canonical_description(raw: str) -> str:
    """Reduce a free-text line description to comparable tokens."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    s = str(raw).lower()
    s = _PUNCT.sub(" ", s)
    s = _SPACE.sub(" ", s)
    s = _ALPHANUM_SPLIT.sub(r"\1\2", s)               # "a 4" -> "a4"
    for pattern, repl in _EXPAND.items():
        s = re.sub(pattern, repl, s)
    s = _NUMUNIT.sub(r"\1\2", s)                      # "75 gsm" -> "75gsm"
    tokens = [t for t in _SPACE.sub(" ", s).split() if t and t not in _STOP]
    # sort so word order never decides identity
    return " ".join(sorted(set(tokens)))


def _blocking_keys(canon: str) -> set[str]:
    """Every significant token becomes a key.

    Single-key blocking (e.g. the longest word) is wrong here: "A4 PAPER 75GSM"
    and "Copier paper A-4 75 gsm" have different longest tokens, land in
    different buckets and are never compared. Indexing under every token means
    two descriptions sharing any significant token get considered, which is the
    whole point of blocking.
    """
    keys = {w[:5] for w in canon.split() if len(w) > 2}
    return keys or {"_"}


def resolve_skus(lines: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Returns (lines with sku_id, catalogue).

    `catalogue` has one row per resolved SKU with its canonical description,
    the raw variants that map to it, and the peer price statistics that the
    price pillar reads.
    """
    if lines.empty or "raw_description" not in lines.columns:
        out = lines.copy()
        out["sku_id"] = None
        return out, pd.DataFrame(columns=["sku_id", "canonical", "variants", "n_vendors"])

    df = lines.copy()
    df["_canon"] = df["raw_description"].map(canonical_description)

    uniques = sorted({c for c in df["_canon"] if c})
    blocks: dict[str, list[str]] = defaultdict(list)
    for c in uniques:
        for key in _blocking_keys(c):
            blocks[key].append(c)

    parent: dict[str, str] = {c: c for c in uniques}

    def find(a: str) -> str:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    def union(a: str, b: str) -> None:
        ra, rb = find(a), find(b)
        if ra == rb:
            return
        lo, hi = (ra, rb) if ra < rb else (rb, ra)
        parent[hi] = lo

    compared: set[tuple[str, str]] = set()
    for members in blocks.values():
        if len(members) > 400:          # a stop-word-ish key; skip the blow-up
            continue
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                pair = (a, b) if a < b else (b, a)
                if pair in compared:
                    continue
                compared.add(pair)
                if fuzz.token_set_ratio(a, b) >= DESC_MATCH_THRESHOLD:
                    union(a, b)

    canon_to_root = {c: find(c) for c in uniques}
    roots = sorted(set(canon_to_root.values()))
    root_to_id = {r: f"SKU-{i + 1:04d}" for i, r in enumerate(roots)}

    df["sku_id"] = df["_canon"].map(lambda c: root_to_id.get(canon_to_root.get(c, ""), None))

    # ── catalogue ─────────────────────────────────────────────────────────
    rows = []
    for root, sku_id in root_to_id.items():
        members = [c for c, r in canon_to_root.items() if r == root]
        sub = df[df["sku_id"] == sku_id]
        variants = sorted(set(sub["raw_description"].astype(str)))[:12]
        price_col = ("unit_price_canonical"
                     if "unit_price_canonical" in sub.columns else "unit_price")
        prices = pd.to_numeric(sub[price_col], errors="coerce").dropna()
        by_vendor = (sub.assign(_p=pd.to_numeric(sub[price_col], errors="coerce"))
                        .groupby("vendor_id")["_p"].median()
                     if "vendor_id" in sub.columns else pd.Series(dtype=float))
        rows.append({
            "sku_id": sku_id,
            "canonical": max(members, key=len),
            "variants": variants,
            "n_variants": len(set(sub["raw_description"].astype(str))),
            "n_vendors": int(by_vendor.size),
            "n_lines": int(len(sub)),
            "peer_median": float(by_vendor.median()) if by_vendor.size else None,
            "price_min": float(prices.min()) if len(prices) else None,
            "price_max": float(prices.max()) if len(prices) else None,
            "unit": (sub["unit_canonical"].mode().iloc[0]
                     if "unit_canonical" in sub.columns and not sub["unit_canonical"].isna().all()
                     else None),
            "hsn": (sub["hsn"].mode().iloc[0]
                    if "hsn" in sub.columns and not sub["hsn"].isna().all() else None),
        })

    catalogue = pd.DataFrame(rows).sort_values("sku_id").reset_index(drop=True)
    return df.drop(columns=["_canon"]), catalogue
