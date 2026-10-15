"""Adapter to the team's `payments/` package (Stripe test mode). Never edit payments/. OWNER: core subagent.

    record, checks = payments.pay(claim_id, gate.decision_dict(claim_id, version, lines, settlement, settle=True))

- record is None when the decision was referred; `checks` then holds one failing CheckResult per SAP-01 rule.
- record.status: PAID | ALREADY_PAID | NOTHING_TO_PAY with Stripe; DRY_RUN | NOTHING_TO_PAY without a
  STRIPE_SECRET_KEY (stripe_object_id "DRY_RUN"). ALREADY_PAID moved no money now (amount = the earlier transfer).
- Setup or Stripe API problems (empty float, payee not active, bad key) raise PaymentsConfigError.
"""

from __future__ import annotations

import datetime as dt
import sys

import stripe

from . import config, documents
from .schemas import CheckResult, PaymentRecord

try:
    from payments import guardrails, stripe_payout
except ImportError:  # repo root not on sys.path
    sys.path.insert(0, str(config.ROOT))
    from payments import guardrails, stripe_payout

PaymentsConfigError = stripe_payout.PaymentsConfigError

DASHBOARD_TRANSFER_URL = "https://dashboard.stripe.com/test/connect/transfers/{}"
CONTROLS = "SAP-01 payment controls (payments/guardrails.py: P1 P2 P5 P6 P8 P9, 4.2, 5.2, 5.4-5.8)"

RULES = {
    "SAP-01 §3": "Decision is SETTLE",
    "SAP-01 P1": "Net settlement within ACA authority (£1,000)",
    "SAP-01 P2": "Policy active and premium paid",
    "SAP-01 P5": "No line pending evidence",
    "SAP-01 P6": "Fraud score below 40",
    "SAP-01 P8": "Payee is the verified account, unchanged for 14 days",
    "SAP-01 P9": "Every paid line cites a clause and evidence",
    "SAP-01 4.2": "At least one line is paid",
    "SAP-01 5.2": "Net payable above £0",
    "SAP-01 5.4": "Single payment cap £1,000 and daily cap £25,000",
    "SAP-01 5.5": "Claim-form bank details match the verified payee",
    "SAP-01 5.6": "Section nets add up to the net payable",
    "SAP-01 5.7": "ACA payments not suspended (kill switch)",
    "SAP-01 5.8": "New decision not below what was already paid",
}


def stripe_enabled() -> bool:
    return bool((config.STRIPE_SECRET_KEY or "").strip())


def _failed(rule: dict) -> CheckResult:
    rid = rule.get("rule", "SAP-01")
    return CheckResult(id=rid, description=RULES.get(rid, rid), passed=False, detail=rule.get("detail", ""))


def _passed(detail: str) -> CheckResult:
    return CheckResult(id="SAP-01 controls", description=CONTROLS, passed=True, detail=detail)


def _dry_run(claim_id: str, decision: dict, policy_record: dict, claim_form: dict, today: dt.date, already_paid_gbp: float):
    version = int(decision["decision_version"])
    failures = guardrails.check_decision(decision, policy_record, claim_form, today)
    if stripe_payout.kill_switch_on():
        failures.append(guardrails.RuleFailure("SAP-01 5.7", "ACA payments are suspended (ACA_PAYMENTS_SUSPENDED is set)"))
    to_pay = already = 0
    if not failures:
        already = guardrails.to_pence(already_paid_gbp)
        to_pay = guardrails.to_pence(decision["net_payable_gbp"]) - already
        failures = guardrails.check_amount_to_pay(to_pay, already, 0)
    if failures:
        return None, [_failed(f.as_dict()) for f in failures]
    payee = policy_record["verified_payee_account"]["payee_token"]
    status = "DRY_RUN" if to_pay > 0 else "NOTHING_TO_PAY"
    record = PaymentRecord(
        claim_id=claim_id,
        version=version,
        amount_gbp=float(guardrails.gbp(to_pay)),
        idempotency_key=f"{claim_id}-v{version}",
        stripe_object_id="DRY_RUN",
        stripe_destination=payee,
        status=status,
        dashboard_url="",
        created_at=documents.now_iso(),
    )
    detail = (
        f"DRY_RUN (no STRIPE_SECRET_KEY, Stripe not called): all checks passed; would pay £{guardrails.gbp(to_pay)} "
        f"to verified payee {payee} (net £{guardrails.gbp(to_pay + already)}, already paid £{guardrails.gbp(already)})"
    )
    return record, [_passed(detail)]


def _from_result(result) -> tuple[PaymentRecord | None, list[CheckResult]]:
    if result.status == "REFERRED":
        return None, [_failed(r) for r in result.failed_rules]
    tid = result.transfer_id or ""
    record = PaymentRecord(
        claim_id=result.claim_id,
        version=int(result.decision_version),
        amount_gbp=float(result.amount_gbp),
        idempotency_key=result.idempotency_key,
        stripe_object_id=tid,
        stripe_destination=result.destination_account or "",
        status=result.status,
        dashboard_url=DASHBOARD_TRANSFER_URL.format(tid) if tid else "",
        created_at=documents.now_iso(),
    )
    detail = {
        "PAID": f"paid £{result.amount_gbp} to {result.destination_account} (transfer {tid})",
        "ALREADY_PAID": f"decision v{result.decision_version} was already paid (transfer {tid}, £{result.amount_gbp}); nothing paid again",
        "NOTHING_TO_PAY": "nothing to pay: the claim total was already paid",
    }.get(result.status, result.status)
    detail += f"; claim net £{result.net_total_gbp}, paid before £{result.already_paid_gbp}"
    return record, [_passed(detail)]


def pay(
    claim_id: str,
    decision: dict,
    *,
    dry_run: bool | None = None,
    already_paid_gbp: float = 0.0,
    today: dt.date | None = None,
    policy_record: dict | None = None,
    claim_form: dict | None = None,
) -> tuple[PaymentRecord | None, list[CheckResult]]:
    """Call payments.pay_claim(decision, policy_record, claim_form). Map its PaymentResult to a PaymentRecord
    (PAID / ALREADY_PAID / NOTHING_TO_PAY) and its failed_rules to failing CheckResults (REFERRED -> no record).
    Without STRIPE_SECRET_KEY: run payments.guardrails checks only and return a PaymentRecord with
    status "DRY_RUN" so the pipeline still works end to end. Other PaymentsConfigError: raise with a clear message.

    dry_run: None = auto (dry run iff no key); True forces a dry run. already_paid_gbp is used only in a dry
    run (with Stripe, Stripe's transfers are the ledger). policy_record / claim_form override the files on disk."""
    if decision.get("claim_id") != claim_id:
        raise ValueError(f"decision is for {decision.get('claim_id')!r}, not {claim_id!r}")
    if claim_form is None:
        claim_form = documents.load_claim_form(claim_id)
    if policy_record is None:
        policy_record = documents.load_policy_record(claim_form["policy_number"])
    today = today or dt.date.today()
    if dry_run is None:
        dry_run = not stripe_enabled()
    if dry_run:
        return _dry_run(claim_id, decision, policy_record, claim_form, today, already_paid_gbp)

    version = decision.get("decision_version")
    try:
        result = stripe_payout.pay_claim(decision, policy_record, claim_form, today)
    except PaymentsConfigError as e:
        raise PaymentsConfigError(f"Stripe payment for {claim_id} v{version} was not made (setup problem): {e}") from e
    except stripe.StripeError as e:
        raise PaymentsConfigError(f"Stripe payment for {claim_id} v{version} was not made (Stripe error): {e.user_message or e}") from e
    return _from_result(result)
