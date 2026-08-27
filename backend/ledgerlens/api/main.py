"""
FastAPI surface.

The browser demo does not depend on this service: the Vaigai dataset is bundled
client-side and stays that way, so a failed network at demo time costs nothing.
This API powers "analyse your own data", which is the part that has to be real.
"""
from __future__ import annotations

import logging
import time
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ledgerlens import llm, registry
from ledgerlens.api.serialise import camelise, finding_to_dict
from ledgerlens.config import AnalysisConfig
from ledgerlens.detect._helpers import inr
from ledgerlens.pipeline import KINDS, SourceFile, build_context
from ledgerlens.savings.model import build_savings
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ledgerlens-ten.vercel.app", "http://localhost:5173",
                   "http://localhost:4173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "detectors": len(registry.all_detectors()),
        "pillars": len({d.pillar for d in registry.all_detectors()}),
        "llm_available": llm.available(),
        "llm_role": "schema mapping, explanation and drafting only — never arithmetic",
    }


@app.get("/api/detectors")
def detectors() -> dict:
    rows = registry.summary()
    return {
        "count": len(rows),
        "baseline_free": sum(1 for r in rows if r["baseline_free"]),
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

    findings = registry.run_all(ctx)
    savings = build_savings(findings, ctx.total_spend)
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
    out = llm.complete(
        system=(
            "You draft procurement correspondence. Every figure, date and "
            "document number must be copied exactly from the evidence given; "
            "you may not compute, infer or round any number. Do not allege "
            "fraud or name an individual as culpable — describe the discrepancy "
            "and request reconciliation."
        ),
        user=(
            f"Write {kind_brief}.\nFrom: {req.client_name}\nTo: {req.vendor_name}\n"
            f"Rule: {req.rule_id}\nAmount: {inr(req.money_at_risk)}\n"
            f"Evidence: {req.evidence}"
        ),
        max_tokens=900,
    )
    if not out:
        raise HTTPException(502, "drafting service unavailable")
    return {"draft": out, "kind": req.kind}
