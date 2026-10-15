"""Hard payment checks that run before any money moves.

Plain code, no LLM. Each check maps to a rule in SAP-01 (Settlement Authority &
Payment Controls), so a refusal can always name the rule that stopped it.
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

# SAP-01 limits, in pence.
CLAIM_NET_LIMIT_PENCE = 100_000        # P1: net settlement per claim <= £1,000
SINGLE_PAYMENT_CAP_PENCE = 100_000     # 5.4: single payment cap £1,000
DAILY_AGGREGATE_CAP_PENCE = 2_500_000  # 5.4: daily cap £25,000 across all claims
FRAUD_SCORE_REFER_AT = 40              # P6: refer at score >= 40
PAYEE_CHANGE_COOLDOWN_DAYS = 14        # P8: bank details unchanged for 14 days

PAY_OUTCOMES = {"PAY", "PAY_PARTIAL"}


@dataclass
class RuleFailure:
    rule: str
    detail: str

    def as_dict(self) -> dict:
        return {"rule": self.rule, "detail": self.detail}


def to_pence(amount_gbp) -> int:
    """Convert a GBP amount to whole pence without float rounding errors."""
    return int((Decimal(str(amount_gbp)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def gbp(pence: int) -> str:
    return f"{Decimal(pence) / 100:.2f}"


def check_decision(decision: dict, policy_record: dict, claim_form: dict | None, today: dt.date) -> list[RuleFailure]:
    """Checks that only need the decision and the policy record (no Stripe calls)."""
    failures: list[RuleFailure] = []

    if decision.get("overall_decision") != "SETTLE":
        failures.append(RuleFailure("SAP-01 §3", f"overall_decision is {decision.get('overall_decision')!r}, not 'SETTLE'"))

    if policy_record.get("aca_payments_suspended"):
        failures.append(RuleFailure("SAP-01 5.7", "ACA payments are suspended on this policy record (kill switch)"))

    net_pence = to_pence(decision["net_payable_gbp"])
    if net_pence <= 0:
        failures.append(RuleFailure("SAP-01 5.2", "net payable must be greater than £0"))
    if net_pence > CLAIM_NET_LIMIT_PENCE:
        failures.append(RuleFailure("SAP-01 P1", f"net settlement £{gbp(net_pence)} exceeds ACA authority of £{gbp(CLAIM_NET_LIMIT_PENCE)}"))

    # Money arithmetic: section nets must add up to the total being paid.
    sections = decision.get("sections") or {}
    if sections:
        section_total = sum(to_pence(s.get("net_gbp", 0)) for s in sections.values())
        if section_total != net_pence:
            failures.append(RuleFailure("SAP-01 5.6", f"section nets add up to £{gbp(section_total)} but net payable is £{gbp(net_pence)}"))

    # P9: every paid line cites a clause and an evidence document.
    paid_lines = [l for l in decision.get("lines", []) if l.get("outcome") in PAY_OUTCOMES]
    if not paid_lines:
        failures.append(RuleFailure("SAP-01 4.2", "no line is paid; a full decline must be referred"))
    for line in decision.get("lines", []):
        if line.get("outcome") == "PEND":
            failures.append(RuleFailure("SAP-01 P5", f"line {line.get('line')} is still pending evidence"))
        if line.get("outcome") in PAY_OUTCOMES and (not line.get("clauses") or not line.get("evidence")):
            failures.append(RuleFailure("SAP-01 P9", f"line {line.get('line')} is paid without a clause and an evidence citation"))

    # P2: policy in force and premium paid.
    if policy_record.get("status") != "ACTIVE":
        failures.append(RuleFailure("SAP-01 P2", f"policy status is {policy_record.get('status')!r}"))
    if (policy_record.get("premium") or {}).get("status") != "PAID":
        failures.append(RuleFailure("SAP-01 P2", "premium is not paid"))

    # P6: fraud score, if the decision carries one.
    score = (decision.get("fraud") or {}).get("score")
    if score is not None and score >= FRAUD_SCORE_REFER_AT:
        failures.append(RuleFailure("SAP-01 P6", f"fraud indicator score {score} is {FRAUD_SCORE_REFER_AT} or more"))

    failures += check_payee(policy_record, claim_form, today)
    return failures


def check_payee(policy_record: dict, claim_form: dict | None, today: dt.date) -> list[RuleFailure]:
    """P8 / 5.5: pay only the verified payee account on file."""
    failures: list[RuleFailure] = []
    payee = policy_record.get("verified_payee_account")
    if not payee or not payee.get("payee_token"):
        return [RuleFailure("SAP-01 P8", "no verified payee account on the policy record")]

    changed = dt.date.fromisoformat(payee["last_changed_on"])
    if (today - changed).days < PAYEE_CHANGE_COOLDOWN_DAYS:
        failures.append(RuleFailure("SAP-01 P8", f"payee bank details changed on {changed}, less than {PAYEE_CHANGE_COOLDOWN_DAYS} days ago"))

    # If the claim form supplies bank details, they must match the verified account.
    form_bank = (claim_form or {}).get("payment_details")
    if form_bank:
        acct = str(form_bank.get("account_number", "")).replace(" ", "")
        sort = str(form_bank.get("sort_code", "")).replace("-", "").replace(" ", "")
        want_last4 = payee.get("account_number_last4", "")
        want_sort_tail = payee.get("sort_code_masked", "")[-2:]
        if not acct.endswith(want_last4) or not sort.endswith(want_sort_tail):
            failures.append(RuleFailure("SAP-01 5.5", "bank details on the claim form differ from the verified payee account"))
    return failures


def check_amount_to_pay(to_pay_pence: int, already_paid_pence: int, paid_today_pence: int) -> list[RuleFailure]:
    """Checks that need Stripe state: what this claim already received and today's total."""
    failures: list[RuleFailure] = []
    if to_pay_pence < 0:
        failures.append(RuleFailure("SAP-01 5.8", f"new decision is £{gbp(-to_pay_pence)} below what was already paid (£{gbp(already_paid_pence)}); recovery needs a person"))
    if to_pay_pence > SINGLE_PAYMENT_CAP_PENCE:
        failures.append(RuleFailure("SAP-01 5.4", f"payment £{gbp(to_pay_pence)} exceeds single payment cap £{gbp(SINGLE_PAYMENT_CAP_PENCE)}"))
    if paid_today_pence + max(to_pay_pence, 0) > DAILY_AGGREGATE_CAP_PENCE:
        failures.append(RuleFailure("SAP-01 5.4", f"payment would take today's ACA total to £{gbp(paid_today_pence + to_pay_pence)}, over the £{gbp(DAILY_AGGREGATE_CAP_PENCE)} daily cap"))
    return failures
