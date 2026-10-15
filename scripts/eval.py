"""Score the latest decision for a claim against data/answer_key/<claim_id>_expected_outcome.json.

    .venv-claims/bin/python scripts/eval.py [CLM-2026-004817] [--version N]

Exits 1 on a mismatch in a line outcome, a line or section amount, the net total, the overall decision or the
total paid. Fraud indicators, irrelevant documents and the idempotency key are reported but don't fail.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from claims_agent import config, state  # noqa: E402
from claims_agent.schemas import DecisionRecord, EvidencePack  # noqa: E402

TOL = 0.005


def _same(a, b) -> bool:
    return a is not None and b is not None and abs(float(a) - float(b)) < TOL


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("claim_id", nargs="?", default="CLM-2026-004817")
    parser.add_argument("--version", type=int, default=None)
    args = parser.parse_args(argv)
    claim_id = args.claim_id

    key = json.loads((config.ANSWER_KEY_DIR / f"{claim_id}_expected_outcome.json").read_text(encoding="utf-8"))
    st = state.load_state(claim_id)
    version = args.version or st.decision_version
    if not version:
        print(f"{claim_id}: no decision yet (status {st.status}; waiting for: {'; '.join(st.waiting_for) or '—'})")
        return 2
    pack = state.read_model(claim_id, f"v{version}/pack.json", EvidencePack)
    decision = state.read_model(claim_id, f"v{version}/decision.json", DecisionRecord)
    if pack is None or decision is None:
        print(f"{claim_id}: v{version} has no pack.json/decision.json")
        return 2

    failures: list[str] = []
    rows = 0

    def row(ok: bool, label: str, got, want, fails: bool = True) -> None:
        nonlocal rows
        rows += 1
        mark = "✓" if ok else ("✗" if fails else "~")
        print(f"  {mark} {label:<34} got {got!s:<22} want {want}")
        if not ok and fails:
            failures.append(label)

    print(f"Scorecard {claim_id} v{version} ({decision.status}) vs answer key\n")
    print("Lines (outcome, payable GBP):")
    lines = {d.line: d for d in pack.final_lines}
    money = {m.line: m.eligible_gbp for m in pack.settlement.lines}
    for exp in key["lines"]:
        n = exp["line"]
        got = lines.get(n)
        row(got is not None and got.outcome == exp["outcome"], f"line {n} outcome", got.outcome if got else None, exp["outcome"])
        row(_same(money.get(n), exp["payable_gbp"]), f"line {n} payable", money.get(n), exp["payable_gbp"])
        got_clauses = [c.strip() for c in (got.clause_ids if got else [])]
        missing = [c for c in exp.get("clauses", [])
                   if not any(g.startswith(c) or c.startswith(g) for g in got_clauses)]  # "CHG 7.4.1" matches "CHG 7.4"
        row(not missing, f"line {n} clauses (prefix match)", ",".join(got_clauses) or "—",
            ",".join(exp.get("clauses", [])), False)

    print("\nSections (net GBP):")
    sections = {s.head: s for s in pack.settlement.sections}
    for head, exp in key["sections"].items():
        got = sections.get(head)
        net = got.net_gbp if got else 0.0
        row(_same(net, exp["net_gbp"]), f"section {head} net", net, exp["net_gbp"])
        row(_same(got.excess_gbp if got else 0.0, exp["excess_gbp"]), f"section {head} excess",
            got.excess_gbp if got else 0.0, exp["excess_gbp"])

    print("\nTotals:")
    row(_same(pack.settlement.net_total_gbp, key["net_payable_gbp"]), "net total", pack.settlement.net_total_gbp, key["net_payable_gbp"])
    overall = {"PAID": "SETTLE", "NO_PAYMENT_DUE": "SETTLE"}.get(decision.status, "REFER")
    row(overall == key["overall_decision"], "overall decision", f"{overall} ({decision.status})", key["overall_decision"])
    row(_same(st.paid_total_gbp, key["payment"]["amount_gbp"]), "total paid", st.paid_total_gbp, key["payment"]["amount_gbp"])

    print("\nFraud screen (reported, doesn't fail):")
    triggered = sorted(i.id for i in pack.checker.indicators if i.triggered)
    row(triggered == sorted(key["fraud"]["triggered"]), "indicators triggered", ",".join(triggered), ",".join(key["fraud"]["triggered"]), False)
    row(pack.settlement.fraud_score == key["fraud"]["score"], "fraud score", pack.settlement.fraud_score, key["fraud"]["score"], False)
    row(pack.settlement.fraud_band == key["fraud"]["band"], "fraud band", pack.settlement.fraud_band, key["fraud"]["band"], False)

    print("\nIrrelevant documents (reported, doesn't fail):")
    received = {n.doc_id for n in pack.documents}
    got_irrelevant = {n.doc_id for n in pack.documents if not n.heads}
    want_irrelevant = set(key["irrelevant_documents"]) & received
    missed = sorted(want_irrelevant - got_irrelevant)
    extra = sorted(got_irrelevant - want_irrelevant - {"ADMIN"})
    row(not missed, "expected irrelevant, tagged irrelevant", f"{len(want_irrelevant) - len(missed)}/{len(want_irrelevant)}",
        f"missed: {', '.join(missed) or '—'}", False)
    row(not extra, "tagged irrelevant, not in key", len(extra), f"{', '.join(extra) or '—'}", False)

    print("\nPayment (reported, doesn't fail):")
    payment = decision.payment
    want_key = key["payment"]["idempotency_key"]
    got_key = payment.idempotency_key if payment else None
    row(got_key == want_key, "idempotency key", got_key, want_key, False)
    row(payment is not None and _same(payment.amount_gbp, key["payment"]["amount_gbp"]), "this version's payment",
        f"{payment.amount_gbp} {payment.status}" if payment else None, key["payment"]["amount_gbp"], False)

    print(f"\n{rows - len(failures)}/{rows} checks passed; {len(failures)} failing" + (f": {', '.join(failures)}" if failures else ""))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
