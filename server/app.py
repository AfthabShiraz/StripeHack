"""HTTP API between the claims console UI (ui/) and the pipeline (claims_agent/) + Stripe (payments/).

    .venv-claims/bin/uvicorn server.app:app --port 8000        # from the repo root

The Next.js app proxies /api/* here (ui/next.config.ts). Endpoints:

    GET  /api/health                         backend, Stripe and demo-snapshot status
    GET  /api/claims/{id}/live               pipeline state + latest decision, mapped to the UI's field names
    POST /api/claims/{id}/prepare            start_claim with the default hold-back; snapshots runs/ once WAITING
    POST /api/claims/{id}/evidence           {"doc_ids": [...]} (default: everything still pending) -> add_documents
    POST /api/claims/{id}/ask                {"question": "..."} -> answer from Cognee memory
    GET  /api/claims/{id}/payments           every Stripe transfer on the claim, with clauses and evidence
    POST /api/demo/reset                     {"claim_id": ...} reverse the claim's transfers, restore the WAITING snapshot

Runs are started as background tasks; the UI polls /live. Live Stripe transfers are used whenever
STRIPE_SECRET_KEY is set (test mode only; payments/ refuses live keys).
"""

from __future__ import annotations

import asyncio
import shutil
import sys
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from claims_agent import config, pipeline, state  # noqa: E402
from claims_agent.schemas import CheckerReport, ClaimState  # noqa: E402
from claims_agent.payments import stripe_enabled  # noqa: E402

app = FastAPI(title="Larkspur claims API")

SNAPSHOT_DIR = config.RUNS_DIR / "_demo_snapshots"
_tasks: dict[str, asyncio.Task] = {}


# ---------------------------------------------------------------- helpers


def _running(claim_id: str) -> bool:
    task = _tasks.get(claim_id)
    return bool(task and not task.done())


def _snapshot(claim_id: str) -> Path:
    return SNAPSHOT_DIR / claim_id


def _start(claim_id: str, coro) -> None:
    if _running(claim_id):
        raise HTTPException(409, f"{claim_id} already has a run in progress")
    _tasks[claim_id] = asyncio.create_task(coro)


async def _prepare(claim_id: str) -> None:
    result = await pipeline.start_claim(claim_id, live=stripe_enabled())
    if result.status == "WAITING":
        snap = _snapshot(claim_id)
        shutil.rmtree(snap, ignore_errors=True)
        shutil.copytree(state.run_dir(claim_id), snap)


def _gbp(x) -> float:
    return round(float(x or 0), 2)


def _overlay(claim_id: str, st: ClaimState) -> dict | None:
    """Latest decision mapped to the UI's Claim field names (lib/types.ts)."""
    pack = pipeline.latest_pack(claim_id)
    decision = pipeline.latest_decision(claim_id)
    if not pack:
        return None
    money_by_line = {m.line: m for m in pack.settlement.lines}
    limits = {s.head: s.section_limit_gbp for s in pack.sections}
    lines = []
    for d in sorted(pack.final_lines, key=lambda d: d.line):
        m = money_by_line.get(d.line)
        lines.append({
            "line": d.line,
            "section": d.head,
            "outcome": "PEND" if d.outcome == "REFER" else d.outcome,
            "payable": _gbp(m.eligible_gbp if m else 0),
            "clauses": d.clause_ids,
            "evidence": sorted({e.doc_id for e in d.evidence}),
            "reason": d.reason,
            "calculation": m.calculation if m else "",
            "cites": [{"doc": e.doc_id, "quote": e.quote} for e in d.evidence if e.verified],
        })
    checker: CheckerReport = pack.checker
    out = {
        "version": pack.version,
        "net": _gbp(pack.settlement.net_total_gbp),
        "fraudScore": pack.settlement.fraud_score,
        "fraudBand": pack.settlement.fraud_band.title(),
        "lines": lines,
        "sections": [
            {"section": s.head, "eligible": _gbp(s.eligible_gbp), "limit": f"£{limits.get(s.head, 0):,.0f}",
             "excess": _gbp(s.excess_gbp), "net": _gbp(s.net_gbp), "calculation": s.calculation}
            for s in pack.settlement.sections
        ],
        "fraud": [
            {"id": i.id, "label": i.name, "weight": i.weight, "triggered": i.triggered, "note": i.evidence}
            for i in checker.indicators
        ],
        "crossChecks": [c.model_dump() for c in checker.cross_checks],
        "decision": None,
    }
    if decision:
        p = decision.payment
        out["decision"] = {
            "status": decision.status,
            "decidedAt": decision.decided_at,
            "paidNow": _gbp(decision.paid_now_gbp),
            "paidTotal": _gbp(decision.paid_total_gbp),
            "verdict": decision.final_review.verdict,
            "summary": decision.final_review.summary,
            "authority": [
                {"id": c.id, "rule": c.description, "pass": c.passed, "note": c.detail} for c in decision.gate.checks
            ],
            "payment": p and {
                "id": p.stripe_object_id,
                "amount": _gbp(p.amount_gbp),
                "status": p.status,
                "account": p.stripe_destination,
                "idempotencyKey": p.idempotency_key,
                "dashboardUrl": p.dashboard_url,
                "created": p.created_at,
            },
            "letter": decision.letter and decision.letter.model_dump(),
        }
    return out


# ---------------------------------------------------------------- endpoints


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "stripe": stripe_enabled(), "running": [c for c in _tasks if _running(c)],
            "snapshots": sorted(p.name for p in SNAPSHOT_DIR.glob("*")) if SNAPSHOT_DIR.exists() else []}


@app.get("/api/claims/{claim_id}/live")
def live(claim_id: str) -> dict:
    if not state.run_dir(claim_id).exists():
        return {"exists": False, "claimId": claim_id, "running": _running(claim_id),
                "snapshot": _snapshot(claim_id).exists()}
    st = state.load_state(claim_id)
    try:
        pending = pipeline.pending_documents(claim_id)
    except Exception:  # manifest missing etc.
        pending = []
    return {
        "exists": True,
        "claimId": claim_id,
        "status": st.status,
        "running": _running(claim_id),
        "received": st.documents_received,
        "waitingFor": st.waiting_for,
        "pending": pending,
        "decisionVersion": st.decision_version,
        "paidTotal": _gbp(st.paid_total_gbp),
        "timeline": [e.model_dump() for e in st.timeline],
        "snapshot": _snapshot(claim_id).exists(),
        "overlay": _overlay(claim_id, st),
    }


@app.post("/api/claims/{claim_id}/prepare", status_code=202)
async def prepare(claim_id: str) -> dict:
    _start(claim_id, _prepare(claim_id))
    return {"started": "prepare", "claimId": claim_id}


class EvidenceIn(BaseModel):
    doc_ids: list[str] = []


@app.post("/api/claims/{claim_id}/evidence", status_code=202)
async def evidence(claim_id: str, body: EvidenceIn) -> dict:
    if not state.run_dir(claim_id).exists():
        raise HTTPException(409, f"{claim_id} hasn't been prepared; POST /api/claims/{claim_id}/prepare first")
    ids = body.doc_ids or pipeline.pending_documents(claim_id)
    if not ids:
        raise HTTPException(409, "No documents pending for this claim")
    _start(claim_id, pipeline.add_documents(claim_id, ids, live=stripe_enabled()))
    return {"started": "evidence", "claimId": claim_id, "docIds": ids, "livePayments": stripe_enabled()}


class AskIn(BaseModel):
    question: str


@app.post("/api/claims/{claim_id}/ask")
async def ask(claim_id: str, body: AskIn) -> dict:
    answer = await pipeline.ask(claim_id, body.question)
    return answer.model_dump()


@app.get("/api/claims/{claim_id}/payments")
def payments_ledger(claim_id: str) -> list[dict]:
    if not stripe_enabled():
        return []
    from payments import explain_payments

    return explain_payments(claim_id)


class ResetIn(BaseModel):
    claim_id: str


@app.post("/api/demo/reset")
def reset(body: ResetIn) -> dict:
    claim_id = body.claim_id
    if _running(claim_id):
        raise HTTPException(409, f"{claim_id} has a run in progress; wait for it to finish")
    stripe = None
    if stripe_enabled():
        from reset_demo_payments import reset_claim_payments

        stripe = reset_claim_payments(claim_id, apply=True)
    snap = _snapshot(claim_id)
    restored = False
    if snap.exists():
        shutil.rmtree(state.run_dir(claim_id), ignore_errors=True)
        shutil.copytree(snap, state.run_dir(claim_id))
        restored = True
    return {"claimId": claim_id, "stripe": stripe, "restoredSnapshot": restored}
