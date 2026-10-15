"""Code checks before payment that the team's `payments/` package doesn't already do, and the decision dict
that package expects. SAP-01 limits (P1, P2, P5, P6, P8, P9, caps, kill switch) live in payments/guardrails.py.
OWNER: core subagent."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from .money import triggered_ids
from .schemas import CheckResult, FinalReview, Indicator, LineDecision, Settlement

DECIDED = {"PAY", "PAY_PARTIAL", "DECLINE"}
PAYING = {"PAY", "PAY_PARTIAL"}


def _check(id: str, description: str, problems: list[str], ok_detail: str) -> CheckResult:
    return CheckResult(id=id, description=description, passed=not problems, detail="; ".join(problems) or ok_detail)


def pre_payment_checks(final: FinalReview, lines: list[LineDecision]) -> list[CheckResult]:
    """Final agent said AGREE; no line is PEND or REFER; every PAY/PAY_PARTIAL/DECLINE line has at least one
    clause ID and at least one evidence quote with verified=True. One CheckResult per check.

    Two more consistency checks: the final reviewer raised no *material* concern (it said an outcome or amount
    would change), and no PAY/PAY_PARTIAL line has money basis NONE (it would pay £0)."""
    decided = [ld for ld in lines if ld.outcome in DECIDED]
    checks = [
        _check(
            "FINAL_AGREE",
            "Independent final review agreed with the decision",
            [] if final.verdict == "AGREE" else [f"final review said {final.verdict}: {final.summary}"],
            f"AGREE: {final.summary}",
        ),
        _check(
            "NO_MATERIAL_CONCERNS",
            "Final review raised no material concern",
            [f"line {c.line}: {c.concern}" if c.line is not None else c.concern for c in final.concerns if c.material],
            "none",
        ),
        _check(
            "NO_PEND_OR_REFER",
            "No line is pending evidence or referred (SAP-01 P5, §3)",
            [f"line {ld.line} is {ld.outcome}" for ld in lines if ld.outcome in ("PEND", "REFER")],
            f"all {len(lines)} lines decided",
        ),
        _check(
            "CLAUSES_CITED",
            "Every decided line cites at least one clause ID (SAP-01 P9)",
            [f"line {ld.line} cites no clause" for ld in decided if not any((c or "").strip() for c in ld.clause_ids)],
            f"{len(decided)} decided lines cite clauses",
        ),
        _check(
            "EVIDENCE_VERIFIED",
            "Every decided line has an evidence quote verified in its document (SAP-01 P9, CHG-TRV 2.2)",
            [
                f"line {ld.line} has no verified quote ({len(ld.evidence)} cited)"
                for ld in decided
                if not any(e.verified and (e.quote or "").strip() for e in ld.evidence)
            ],
            f"{len(decided)} decided lines have verified quotes",
        ),
        _check(
            "PAYABLE_BASIS",
            "Every PAY/PAY_PARTIAL line has a money basis",
            [f"line {ld.line} is {ld.outcome} with basis NONE" for ld in lines if ld.outcome in PAYING and ld.basis == "NONE"],
            "ok",
        ),
    ]
    return checks


def gate_passed(checks: list[CheckResult]) -> bool:
    return all(c.passed for c in checks)


def _gbp(x: float) -> float:
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def decision_dict(
    claim_id: str,
    version: int,
    lines: list[LineDecision],
    settlement: Settlement,
    settle: bool,
    *,
    indicators: list[Indicator] | None = None,
) -> dict:
    """The dict payments.pay_claim expects: claim_id, decision_version, overall_decision ("SETTLE" if settle else
    "REFER"), net_payable_gbp, sections {head: {eligible_gbp, excess_gbp, net_gbp}}, lines [{line, outcome,
    payable_gbp, clauses, evidence}], fraud {score, band}.

    `evidence` lists the doc IDs of the line's verified quotes. Pass `indicators` to add fraud.triggered."""
    money = {}
    for m in settlement.lines:
        if m.line in money:
            raise ValueError(f"settlement has line {m.line} twice")
        money[m.line] = m
    numbers = [ld.line for ld in lines]
    if len(set(numbers)) != len(numbers) or set(numbers) != set(money):
        raise ValueError(f"line decisions {sorted(numbers)} don't match the settlement lines {sorted(money)}")

    sections: dict[str, dict] = {}
    for s in settlement.sections:
        if s.head in sections:
            raise ValueError(f"settlement has section {s.head} twice")
        sections[s.head] = {
            "eligible_gbp": _gbp(s.eligible_gbp),
            "after_limits_gbp": _gbp(s.after_limits_gbp),
            "excess_gbp": _gbp(s.excess_gbp),
            "net_gbp": _gbp(s.net_gbp),
        }

    out_lines = []
    for ld in lines:
        evidence: list[str] = []
        for e in ld.evidence:
            if e.verified and e.doc_id and e.doc_id not in evidence:
                evidence.append(e.doc_id)
        out_lines.append(
            {
                "line": ld.line,
                "head": ld.head,
                "outcome": ld.outcome,
                "payable_gbp": _gbp(money[ld.line].eligible_gbp),
                "clauses": [c.strip() for c in ld.clause_ids if c and c.strip()],
                "evidence": evidence,
            }
        )

    fraud = {"score": int(settlement.fraud_score), "band": settlement.fraud_band, "qa_flag": settlement.fraud_band == "AMBER"}
    if indicators is not None:
        fraud["triggered"] = triggered_ids(indicators)
    return {
        "claim_id": claim_id,
        "decision_version": int(version),
        "overall_decision": "SETTLE" if settle else "REFER",
        "net_payable_gbp": _gbp(settlement.net_total_gbp),
        "sections": sections,
        "lines": out_lines,
        "fraud": fraud,
    }
