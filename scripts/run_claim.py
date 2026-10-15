"""Run the Larkspur claims pipeline from the command line (prints the timeline live).

    .venv-claims/bin/python scripts/run_claim.py start CLM-2026-004817 [--hold E12,M02,M03] [--concurrency 4] [--live]
    .venv-claims/bin/python scripts/run_claim.py add CLM-2026-004817 E12 M02 M03 [--live]
    .venv-claims/bin/python scripts/run_claim.py status CLM-2026-004817
    .venv-claims/bin/python scripts/run_claim.py ask CLM-2026-004817 "Why was the phone declined?"
    .venv-claims/bin/python scripts/run_claim.py resume CLM-2026-004817 [--live]     # after an ERROR
    .venv-claims/bin/python scripts/run_claim.py reset CLM-2026-004817               # deletes runs/<claim_id>/

Payments are DRY_RUN unless --live (or LIVE_PAYMENTS=1): a live run spends the claim's Stripe idempotency keys.
`--hold none` holds nothing back.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from claims_agent import pipeline, state  # noqa: E402
from claims_agent.packs import gbp  # noqa: E402


def _print_event(claim_id, event) -> None:
    where = f"  [runs/{claim_id}/{event.artifact}]" if event.artifact else ""
    print(f"{event.at[11:19]} {event.step:>8} | {event.message}{where}", flush=True)


def _summary(claim_id: str) -> None:
    st = state.load_state(claim_id)
    print()
    print(f"{claim_id}: {st.status}" + (f" (decision v{st.decision_version})" if st.decision_version else ""))
    print(f"  documents received: {len(st.documents_received)}; pending: {', '.join(pipeline.pending_documents(claim_id)) or 'none'}")
    if st.waiting_for:
        print("  waiting for:")
        for item in st.waiting_for:
            print(f"    - {item}")
    print(f"  paid total: {gbp(st.paid_total_gbp)} in {len(st.payments)} payment(s)")
    for p in st.payments:
        print(f"    v{p.version} {gbp(p.amount_gbp)} {p.status} {p.stripe_object_id} → {p.stripe_destination} (key {p.idempotency_key})")
    decision = pipeline.latest_decision(claim_id)
    pack = pipeline.latest_pack(claim_id)
    if decision and pack:
        money = {m.line: m.eligible_gbp for m in pack.settlement.lines}
        print(f"  latest decision v{decision.version}: {decision.status}, net {gbp(decision.net_total_gbp)}, paid now "
              f"{gbp(decision.paid_now_gbp)}; final review {decision.final_review.verdict}; gate "
              f"{'passed' if decision.gate.passed else 'FAILED'}; fraud {pack.settlement.fraud_score} {pack.settlement.fraud_band}")
        for d in pack.final_lines:
            print(f"    line {d.line:>2} {d.head:<3} {d.outcome:<12} {gbp(money.get(d.line)):>10}  {', '.join(d.clause_ids)}")
        print(f"  pack: runs/{claim_id}/v{decision.version}/pack.md   letter: runs/{claim_id}/v{decision.version}/letter.md")
    print(f"  state: runs/{claim_id}/state.json")


async def _run(coro_factory, claim_id: str) -> int:
    state.on_log(_print_event)
    try:
        await coro_factory()
    except Exception as exc:
        print(f"\nERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        if state.load_state(claim_id).status == "ERROR":
            print(f"Fix the cause, then: scripts/run_claim.py resume {claim_id}", file=sys.stderr)
        _summary(claim_id)
        return 1
    _summary(claim_id)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("start")
    p.add_argument("claim_id")
    p.add_argument("--hold", default=None, help="comma-separated doc IDs to hold back (default E12,M02,M03; 'none' for none)")
    p.add_argument("--concurrency", type=int, default=None)
    p.add_argument("--live", action="store_true", help="real Stripe test-mode transfers (default DRY_RUN)")
    p = sub.add_parser("add")
    p.add_argument("claim_id")
    p.add_argument("doc_ids", nargs="+")
    p.add_argument("--concurrency", type=int, default=None)
    p.add_argument("--live", action="store_true")
    p = sub.add_parser("resume")
    p.add_argument("claim_id")
    p.add_argument("--live", action="store_true")
    p = sub.add_parser("status")
    p.add_argument("claim_id")
    p.add_argument("--events", type=int, default=15, help="how many recent timeline events to show")
    p = sub.add_parser("ask")
    p.add_argument("claim_id")
    p.add_argument("question")
    p = sub.add_parser("reset")
    p.add_argument("claim_id")
    args = parser.parse_args(argv)
    live = True if getattr(args, "live", False) else None  # None -> LIVE_PAYMENTS env var, default DRY_RUN

    if args.cmd == "start":
        hold = None
        if args.hold is not None:
            hold = [] if args.hold.strip().lower() in {"", "none"} else [h for h in args.hold.split(",") if h.strip()]
        return asyncio.run(_run(lambda: pipeline.start_claim(args.claim_id, hold, concurrency=args.concurrency, live=live), args.claim_id))
    if args.cmd == "add":
        return asyncio.run(_run(lambda: pipeline.add_documents(args.claim_id, args.doc_ids, concurrency=args.concurrency, live=live), args.claim_id))
    if args.cmd == "resume":
        return asyncio.run(_run(lambda: pipeline.resume(args.claim_id, live=live), args.claim_id))
    if args.cmd == "status":
        st = state.load_state(args.claim_id)
        for event in st.timeline[-args.events:]:
            _print_event(args.claim_id, event)
        _summary(args.claim_id)
        return 0
    if args.cmd == "ask":
        answer = asyncio.run(pipeline.ask(args.claim_id, args.question))
        print(answer.text)
        if answer.references:
            print("\nReferences: " + ", ".join(answer.references))
        return 0
    if args.cmd == "reset":
        state.reset_claim(args.claim_id)
        print(f"Deleted runs/{args.claim_id}/ (Cognee memory and Stripe transfers are not touched)")
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
