"""
FastAPI surface.

The browser demo does not depend on this service: the Vaigai dataset is bundled
client-side and stays that way, so a failed network at demo time costs nothing.
This API powers "analyse your own data", which is the part that has to be real.
"""
from __future__ import annotations

import logging
import re
import time
from datetime import date
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ledgerlens import llm, registry
from ledgerlens.api.serialise import camelise, finding_to_dict
from ledgerlens.config import AnalysisConfig
from ledgerlens.detect._helpers import inr
from ledgerlens.pipeline import KINDS, SourceFile, build_context
from ledgerlens.audit import build_trail
from ledgerlens.savings.model import build_savings
from ledgerlens.score.integrity import assess as assess_integrity
from ledgerlens.score.prs import health_index, score_all_vendors

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ledgerlens")

registry.load_all()

app = FastAPI(
    title="LedgerLens",
    version="1.0.0",
    description="Procurement forensics. Rules and statistics compute; "
                "the language model only explains and drafts.",
)

# A hardcoded port list broke the moment the site was served from a different
# one, and would break for every Vercel preview URL — which is exactly the link
# a reviewer is most likely to be handed. Match the production domain, any
# preview of this project, and localhost on any port.
ALLOWED_ORIGIN = re.compile(
    r"^https://ledgerlens[a-z0-9-]*\.vercel\.app$"
    r"|^https://ledgerlens-[a-z0-9]+-[a-z0-9-]+\.vercel\.app$"
    r"|^https://ledgerlens[a-z0-9-]*\.onrender\.com$"
    r"|^http://(localhost|127\.0\.0\.1)(:\d+)?$"
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=ALLOWED_ORIGIN.pattern,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "detectors": len(registry.all_detectors()),
        "pillars": len({d.pillar for d in registry.all_detectors()}),
        "llmAvailable": llm.available(),
        "llmRole": "schema mapping, explanation and drafting only — never arithmetic",
    }


@app.get("/api/detectors")
def detectors() -> dict:
    rows = registry.summary()
    return {
        "count": len(rows),
        "baselineFree": sum(1 for r in rows if r["baseline_free"]),
        "opportunity": sum(1 for r in rows if r.get("opportunity")),
        "byPillar": {
            p: sum(1 for r in rows if r["pillar"] == p)
            for p in sorted({r["pillar"] for r in rows})
        },
        "detectors": camelise(rows),
    }


def _kind_of(filename: str, declared: str | None) -> str | None:
    if declared and declared in KINDS:
        return declared
    stem = filename.lower()
    for kind in KINDS:
        if kind[:-1] in stem or kind in stem:
            return kind
    if "invoice" in stem or "bill" in stem:
        return "invoices"
    if "po" in stem or "order" in stem:
        return "pos"
    if "grn" in stem or "receipt" in stem:
        return "grns"
    if "vendor" in stem or "supplier" in stem:
        return "vendors"
    if "line" in stem or "item" in stem:
        return "lines"
    return None


@app.post("/api/analyse")
async def analyse(
    files: Annotated[list[UploadFile], File()],
    kinds: Annotated[str | None, Form()] = None,
    approval_threshold: Annotated[float, Form()] = 50_000.0,
    zero_trust: Annotated[bool, Form()] = False,
    client_name: Annotated[str, Form()] = "Client",
    use_llm: Annotated[bool, Form()] = True,
) -> dict:
    """Upload procurement files and get findings back.

    `kinds` is an optional comma-separated list parallel to `files`; when absent
    the kind is inferred from the filename.
    """
    if not files:
        raise HTTPException(400, "no files uploaded")

    declared = [k.strip() for k in kinds.split(",")] if kinds else []
    sources: list[SourceFile] = []
    unrecognised: list[str] = []
    for i, up in enumerate(files):
        kind = _kind_of(up.filename or f"file{i}", declared[i] if i < len(declared) else None)
        if not kind:
            unrecognised.append(up.filename or f"file{i}")
            continue
        sources.append(SourceFile(kind=kind, filename=up.filename or f"file{i}",
                                  data=await up.read()))
    if not sources:
        raise HTTPException(
            400,
            f"could not tell what these files are: {unrecognised}. "
            f"Pass `kinds` as one of {list(KINDS)} per file.",
        )

    config = AnalysisConfig(
        client_name=client_name,
        approval_thresholds=[approval_threshold],
        zero_trust=zero_trust,
    )

    started = time.perf_counter()
    try:
        ctx, report = build_context(sources, config, use_llm=use_llm)
    except Exception as exc:                       # noqa: BLE001
        log.exception("ingest failed")
        raise HTTPException(422, f"could not read these files: {exc}") from exc

    # Grade the ledger before interpreting anything found in it.
    integrity = assess_integrity(ctx)
    findings = registry.run_all(ctx)
    savings = build_savings(findings, ctx.total_spend,
                            ceiling=config.savings_plausibility_ceiling)
    trail = build_trail(findings, ctx)
    vendor_scores = score_all_vendors(findings, ctx)
    phi = health_index(findings, ctx)
    elapsed = time.perf_counter() - started

    return {
        "meta": {
            "client": config.client_name,
            "elapsedSeconds": round(elapsed, 3),
            "detectorsRun": len(registry.detectors_for(config)),
            "detectorsRegistered": len(registry.all_detectors()),
            "zeroTrust": config.zero_trust,
            "llmUsedForMapping": any(
                m.get("llm_used") for m in report.mappings.values()
            ),
            "note": "No figure in this response was produced by a language model.",
        },
        "ingest": camelise(report.as_dict()),
        "rejected": {
            "count": ctx.rejected.count,
            "reasons": ctx.rejected.reasons(),
        },
        "corpus": {
            "invoices": int(len(ctx.invoices)),
            "purchaseOrders": int(len(ctx.pos)),
            "vendors": int(len(ctx.vendors)),
            "lineItems": int(len(ctx.lines)),
            "skusResolved": int(len(ctx.skus)),
            "spendAnalysed": round(ctx.total_spend, 2),
            "spendDisplay": inr(ctx.total_spend),
        },
        "dataIntegrity": camelise(integrity.as_dict()),
        "audit": trail.as_dict(),
        "findings": [finding_to_dict(f) for f in findings],
        "savings": camelise(savings.as_dict()),
        "riskScores": [camelise(s.as_dict()) for s in vendor_scores[:50]],
        "healthIndex": camelise(phi.as_dict()),
    }


class ExplainRequest(BaseModel):
    explanation: str
    evidence: dict
    rule_id: str
    money_at_risk: float
    vendor_name: str | None = None
    audience: str = "finance manager"


@app.post("/api/explain")
def explain(req: ExplainRequest) -> dict:
    """Rephrase an existing finding for a given audience.

    The model receives the numbers already computed and is told not to alter
    them. If it is unavailable the deterministic explanation is returned as-is,
    which is always a correct answer.
    """
    if not llm.available():
        return {"explanation": req.explanation, "source": "deterministic"}
    out = llm.complete(
        system=(
            "You rewrite a procurement audit finding for a specific reader. "
            "You must not change, recompute, round or add any number, date or "
            "identifier. Use only the figures given. Write two sentences, plain "
            "English, no jargon. Describe what the data is consistent with — "
            "never state that fraud occurred and never name a person as culpable."
        ),
        user=(
            f"Audience: {req.audience}\nRule: {req.rule_id}\n"
            f"Vendor: {req.vendor_name or 'the vendor'}\n"
            f"Amount at risk: {inr(req.money_at_risk)}\n"
            f"Evidence: {req.evidence}\n\nCurrent wording: {req.explanation}"
        ),
        max_tokens=400,
    )
    return {"explanation": out or req.explanation,
            "source": "llm" if out else "deterministic"}


_MD_PATTERNS = [
    (r"\*\*(.+?)\*\*", r"\1"),      # bold
    (r"(?<!\w)\*(.+?)\*(?!\w)", r"\1"),  # italic
    (r"^#{1,6}\s*", ""),             # headings
    (r"^\s*[-*+]\s+", "  "),         # bullets
    (r"^\s*\|.*\|\s*$", None),      # table rows
    (r"^\s*[-|: ]{6,}\s*$", None),   # table rules and --- separators
]


#: A drafted letter must never ship with a gap in it. If the model leaves one
#: anyway, that draft is discarded rather than shown — a placeholder in front of
#: a client is worse than a plainer template.
_PLACEHOLDER = re.compile(
    r"\[[^\]]{0,60}\]|<[a-z ]{2,40}>|\bTBD\b|\bXXX+\b|\bN/?A\b\s*$",
    re.IGNORECASE | re.MULTILINE,
)


_NUM = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numeric_atoms(value: object, into: set[str]) -> None:
    """Every number reachable from the inputs, normalised."""
    if isinstance(value, bool):
        return
    if isinstance(value, (int, float)):
        into.add(f"{float(value):g}")
        into.add(f"{float(value):.0f}")
        return
    if isinstance(value, dict):
        for k, v in value.items():
            _numeric_atoms(k, into)
            _numeric_atoms(v, into)
        return
    if isinstance(value, (list, tuple, set)):
        for v in value:
            _numeric_atoms(v, into)
        return
    for m in _NUM.finditer(str(value)):
        raw = m.group(0).replace(",", "")
        try:
            into.add(f"{float(raw):g}")
            into.add(f"{float(raw):.0f}")
        except ValueError:
            continue


def unsourced_number(text: str, allowed: set[str]) -> str | None:
    """The first number in the draft that did not come from the inputs.

    The hard rule is that no language model ever produces a number in this
    system. Instructing it is not the same as enforcing it: this checks. A
    model that helpfully totals two invoices has computed something, and that
    draft is discarded rather than shown.
    """
    for m in _NUM.finditer(text):
        raw = m.group(0).replace(",", "")
        try:
            val = float(raw)
        except ValueError:
            continue
        # ordinals and small counts in prose ("within five days", "1.") are not
        # claims about the data
        if val <= 31 and val == int(val):
            continue
        if f"{val:g}" in allowed or f"{val:.0f}" in allowed:
            continue
        return m.group(0)
    return None


def has_placeholder(text: str) -> str | None:
    m = _PLACEHOLDER.search(text)
    return m.group(0) if m else None


def _strip_markdown(text: str) -> str:
    """The model is asked for plain text and mostly complies; this makes sure.
    A letter with ### and pipe tables in it is not ready to send."""
    lines: list[str] = []
    for raw in text.splitlines():
        line = raw
        drop = False
        for pattern, repl in _MD_PATTERNS:
            if repl is None:
                if re.match(pattern, line):
                    drop = True
                    break
            else:
                line = re.sub(pattern, repl, line, flags=re.MULTILINE)
        if drop:
            continue
        lines.append(line.rstrip())
    out = "\n".join(lines)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    return out


class DraftRequest(BaseModel):
    kind: str = "recovery-email"
    vendor_name: str
    rule_id: str
    money_at_risk: float
    evidence: dict
    client_name: str = "Our organisation"


@app.post("/api/draft")
def draft(req: DraftRequest) -> dict:
    """Draft correspondence from a finding. Language only — every figure in the
    letter is passed in, never generated."""
    if not llm.available():
        raise HTTPException(503, "drafting requires GROQ_API_KEY to be configured")
    kind_brief = {
        "recovery-email": "a firm but courteous debit-note notice to the vendor",
        "audit-memo": "a confidential memo to the audit committee",
        "commercial-review": "a renegotiation letter ahead of contract renewal",
    }.get(req.kind, "a professional letter")
    today = date.today().strftime("%d %B %Y")
    out = llm.complete(
        system=(
            "You draft procurement correspondence that is ready to send as-is.\n"
            "RULES:\n"
            "1. Every figure, date and document number must be copied exactly "
            "from the evidence given. You may not compute, infer or round any "
            "number.\n"
            "2. Plain text only. No markdown whatsoever — no **bold**, no ### "
            "headings, no bullet characters, no pipe tables. Use ordinary "
            "sentences, blank lines between paragraphs, and simple indented "
            "lines for any list.\n"
            "3. Never leave a placeholder. No [insert date], no [name], no "
            "[signature], no TBD, no square brackets of any kind. Every detail "
            "you need is supplied below, including the date and the exact "
            "closing block to sign off with. If something genuinely is not "
            "supplied, write the sentence without it rather than marking a gap.\n"
            "4. Do not allege fraud and do not name an individual as culpable. "
            "Describe the discrepancy and request reconciliation.\n"
            "5. Do not add, total, subtract or otherwise derive any number. "
            "If two invoices are ₹1,00,000 each, do not write that they sum to "
            "₹2,00,000 — that figure was not given to you. Every number in your "
            "letter must appear verbatim in the evidence. This is checked, and a "
            "letter containing a number you derived is discarded.\n"
            "6. Be concise: at most 250 words."
        ),
        user=(
            f"Write {kind_brief}.\n"
            f"Today's date: {today}\n"
            f"From: {req.client_name}, Accounts Payable\n"
            f"To: {req.vendor_name}\n"
            f"Detector reference: {req.rule_id}\n"
            f"Amount at issue: {inr(req.money_at_risk)}\n"
            f"Evidence (use these figures verbatim): {req.evidence}\n\n"
            f"End the letter with exactly this closing block and nothing after it:\n"
            f"Regards,\n"
            f"Accounts Payable\n"
            f"{req.client_name}"
        ),
        max_tokens=900,
    )
    if out:
        out = _strip_markdown(out)
        gap = has_placeholder(out)
        if gap:
            log.warning("draft rejected, model left a placeholder: %r", gap)
            raise HTTPException(
                502,
                f"The drafted letter came back with an unfilled placeholder ({gap}). "
                f"Discarded rather than shown — use the deterministic template.",
            )
        allowed: set[str] = set()
        _numeric_atoms(req.evidence, allowed)
        _numeric_atoms(req.money_at_risk, allowed)
        _numeric_atoms(req.rule_id, allowed)
        _numeric_atoms(today, allowed)
        _numeric_atoms(inr(req.money_at_risk), allowed)
        invented = unsourced_number(out, allowed)
        if invented:
            log.warning("draft rejected, model produced an unsourced number: %r", invented)
            raise HTTPException(
                502,
                f"The drafted letter contained a number ({invented}) that does not appear "
                f"in the evidence. No language model may produce a figure in this system, "
                f"so the draft was discarded.",
            )
    if not out:
        raise HTTPException(502, "drafting service unavailable")
    return {"draft": out, "kind": req.kind}
