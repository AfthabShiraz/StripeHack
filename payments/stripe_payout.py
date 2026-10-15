"""Pays approved claims through Stripe test mode.

Money path: the insurer (our Stripe platform account) holds a claims float in its
Stripe balance. Each policyholder is a connected Account with the "recipient"
configuration. A settlement is one Stripe Transfer from the float to the
policyholder, tagged with the claim, decision version, clauses and evidence.

Stripe is the only payment ledger: what a claim has already been paid, and what
the agent paid today, are read back from Stripe transfers before every payment.
"""

from __future__ import annotations

import datetime as dt
import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

import stripe

from . import guardrails as g

REPO_ROOT = Path(__file__).resolve().parent.parent
CURRENCY = "gbp"           # SAP-01 5.1
PAID_BY = "ACA"            # tag for the Autonomous Claims Agent's transfers
METADATA_VALUE_MAX = 500   # Stripe metadata value limit


class PaymentsConfigError(RuntimeError):
    """Setup problem (missing key, empty float, wrong account country). Not a claim decision."""


@dataclass
class PaymentResult:
    status: str                       # PAID | ALREADY_PAID | NOTHING_TO_PAY | REFERRED
    claim_id: str
    decision_version: int
    amount_gbp: str = "0.00"          # paid by this call
    net_total_gbp: str = "0.00"       # what this decision version says the claim is worth
    already_paid_gbp: str = "0.00"    # paid by earlier versions
    idempotency_key: str = ""
    transfer_id: str | None = None
    destination_account: str | None = None
    failed_rules: list[dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Client


def _load_dotenv() -> None:
    env = REPO_ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_client: stripe.StripeClient | None = None


def client() -> stripe.StripeClient:
    global _client
    if _client is None:
        _load_dotenv()
        key = os.environ.get("STRIPE_SECRET_KEY")
        if not key:
            raise PaymentsConfigError("STRIPE_SECRET_KEY is not set (put it in .env)")
        if "_live_" in key:
            raise PaymentsConfigError("refusing to run with a live-mode key; use a sandbox / test key")
        _client = stripe.StripeClient(key, max_network_retries=2)
    return _client


def kill_switch_on() -> bool:
    """SAP-01 5.7: Claims Operations can suspend ACA payments with ACA_PAYMENTS_SUSPENDED=1."""
    _load_dotenv()
    return os.environ.get("ACA_PAYMENTS_SUSPENDED", "").lower() in {"1", "true", "yes"}


# ---------------------------------------------------------------------------
# Payees: one connected Account (recipient configuration) per verified payee


def find_payee_account(payee_token: str) -> str | None:
    for account in client().v2.core.accounts.list({"limit": 20}).auto_paging_iter():
        if _meta(account).get("payee_token") == payee_token:
            return account.id
    return None


def ensure_payee_account(policy_record: dict) -> str:
    """Find or create the policyholder's connected account. Returns its ID (acct_...)."""
    payee = policy_record["verified_payee_account"]
    token = payee["payee_token"]
    existing = find_payee_account(token)
    if existing:
        return existing

    holder = policy_record["policyholder"]
    address = holder["address"]
    dob = dt.date.fromisoformat(holder["date_of_birth"])
    account = client().v2.core.accounts.create(
        {
            "display_name": f"{holder['first_name']} {holder['last_name']}",
            "contact_email": holder["email"],
            "dashboard": "none",
            "identity": {
                "country": address["country"].lower(),
                "entity_type": "individual",
                "individual": {
                    "given_name": holder["first_name"],
                    "surname": holder["last_name"],
                    "email": holder["email"],
                    "date_of_birth": {"day": dob.day, "month": dob.month, "year": dob.year},
                    "address": {
                        "line1": address["line1"],
                        "city": address["city"],
                        "postal_code": address["postcode"],
                        "country": address["country"].lower(),
                    },
                },
                "attestations": {
                    "terms_of_service": {
                        "account": {
                            "date": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                            "ip": "127.0.0.1",
                        }
                    }
                },
            },
            "configuration": {
                "recipient": {"capabilities": {"stripe_balance": {"stripe_transfers": {"requested": True}}}}
            },
            "defaults": {
                "currency": CURRENCY,
                "responsibilities": {"fees_collector": "application", "losses_collector": "application"},
            },
            "metadata": {
                "payee_token": token,
                "policy_number": policy_record["policy_number"],
                "customer_id": holder["customer_id"],
            },
            "include": ["configuration.recipient", "requirements"],
        },
        {"idempotency_key": f"payee-account-{token}"},
    )
    return account.id


def payee_status(account_id: str) -> dict:
    """Whether the account can receive transfers yet, and what Stripe still wants."""
    account = client().v2.core.accounts.retrieve(account_id, {"include": ["configuration.recipient", "requirements"]})
    transfers = account.configuration.recipient.capabilities.stripe_balance.stripe_transfers
    requirements = account.requirements
    due = [e.description for e in (requirements.entries or [])] if requirements else []
    return {"account_id": account_id, "stripe_transfers": transfers.status, "requirements_due": due}


# ---------------------------------------------------------------------------
# Claims float (the insurer's Stripe balance)


def float_available_pence() -> int:
    balance = client().v1.balance.retrieve()
    return sum(b.amount for b in balance.available if b.currency == CURRENCY)


def fund_float(amount_gbp) -> str:
    """Test mode only: add funds to the claims float with a test card that settles instantly."""
    intent = client().v1.payment_intents.create(
        {
            "amount": g.to_pence(amount_gbp),
            "currency": CURRENCY,
            "payment_method": "pm_card_bypassPending",
            "automatic_payment_methods": {"enabled": True, "allow_redirects": "never"},
            "confirm": True,
            "description": "Larkspur claims float top-up (test mode)",
            "metadata": {"purpose": "claims_float"},
        }
    )
    return intent.id


# ---------------------------------------------------------------------------
# Reading the ledger back from Stripe


def _meta(obj) -> dict:
    return obj.metadata.to_dict() if obj.metadata else {}


def _transfer_net(transfer) -> int:
    return transfer.amount - (transfer.amount_reversed or 0)


def claim_transfers(claim_id: str, destination: str | None = None) -> list:
    params: dict = {"limit": 100}
    if destination:
        params["destination"] = destination
    return [
        t for t in client().v1.transfers.list(params).auto_paging_iter()
        if _meta(t).get("claim_id") == claim_id
    ]


def paid_today_pence() -> int:
    start = dt.datetime.combine(dt.datetime.now(dt.timezone.utc).date(), dt.time.min, dt.timezone.utc)
    transfers = client().v1.transfers.list({"limit": 100, "created": {"gte": int(start.timestamp())}})
    return sum(_transfer_net(t) for t in transfers.auto_paging_iter() if _meta(t).get("paid_by") == PAID_BY)


# ---------------------------------------------------------------------------
# Paying a claim


def _metadata(decision: dict, policy_record: dict, net_pence: int, already_pence: int, to_pay_pence: int) -> dict:
    """SAP-01 5.6: every payment stores claim, version, section nets, clauses and evidence."""
    paid = [l for l in decision.get("lines", []) if l.get("outcome") in g.PAY_OUTCOMES]
    clauses = sorted({c for l in paid for c in l.get("clauses", [])})
    evidence = sorted({e for l in paid for e in l.get("evidence", [])})
    sections = {k: str(v.get("net_gbp")) for k, v in (decision.get("sections") or {}).items()}
    lines = ";".join(f"{l['line']}:{l['outcome']}:{l.get('payable_gbp', 0)}" for l in decision.get("lines", []))
    fields = {
        "claim_id": decision["claim_id"],
        "decision_version": str(decision["decision_version"]),
        "policy_number": policy_record["policy_number"],
        "payee_token": policy_record["verified_payee_account"]["payee_token"],
        "paid_by": PAID_BY,
        "authority": "SAP-01 T0 (ACA, up to £1,000 net)",
        "net_total_gbp": g.gbp(net_pence),
        "already_paid_gbp": g.gbp(already_pence),
        "this_payment_gbp": g.gbp(to_pay_pence),
        "section_net_gbp": json.dumps(sections, separators=(",", ":")),
        "lines": lines,
        "clauses": ",".join(clauses),
        "evidence": ",".join(evidence),
    }
    # Split anything longer than Stripe's 500-character limit across numbered keys.
    out: dict = {}
    for key, value in fields.items():
        if len(value) <= METADATA_VALUE_MAX:
            out[key] = value
        else:
            for i in range(0, len(value), METADATA_VALUE_MAX):
                out[f"{key}_{i // METADATA_VALUE_MAX + 1}"] = value[i:i + METADATA_VALUE_MAX]
    return out


def pay_claim(decision: dict, policy_record: dict, claim_form: dict | None = None, today: dt.date | None = None) -> PaymentResult:
    """Pay what a settlement decision says the claim is owed, or refer it.

    `decision` needs: claim_id, decision_version (int, 1, 2, ...), overall_decision,
    net_payable_gbp, sections ({section: {net_gbp}}), lines ([{line, outcome,
    payable_gbp, clauses, evidence}]), and optionally fraud.score.
    A later decision version pays only the difference from what Stripe shows was already paid.
    """
    today = today or dt.date.today()
    claim_id = decision["claim_id"]
    version = int(decision["decision_version"])
    net_pence = g.to_pence(decision["net_payable_gbp"])
    result = PaymentResult(
        status="REFERRED",
        claim_id=claim_id,
        decision_version=version,
        net_total_gbp=g.gbp(net_pence),
        idempotency_key=f"{claim_id}-v{version}",  # SAP-01 5.2
    )

    failures = g.check_decision(decision, policy_record, claim_form, today)
    if kill_switch_on():
        failures.append(g.RuleFailure("SAP-01 5.7", "ACA payments are suspended (ACA_PAYMENTS_SUSPENDED is set)"))
    if failures:
        result.failed_rules = [f.as_dict() for f in failures]
        return result

    destination = ensure_payee_account(policy_record)
    result.destination_account = destination

    previous = claim_transfers(claim_id, destination)
    # Same decision version already paid: return that payment, never pay twice.
    for t in previous:
        if _meta(t).get("decision_version") == str(version):
            result.status = "ALREADY_PAID"
            result.transfer_id = t.id
            result.amount_gbp = g.gbp(_transfer_net(t))
            result.already_paid_gbp = g.gbp(sum(_transfer_net(p) for p in previous))
            return result

    already = sum(_transfer_net(t) for t in previous)
    to_pay = net_pence - already
    result.already_paid_gbp = g.gbp(already)

    failures = g.check_amount_to_pay(to_pay, already, paid_today_pence())
    if failures:
        result.failed_rules = [f.as_dict() for f in failures]
        return result
    if to_pay == 0:
        result.status = "NOTHING_TO_PAY"
        return result

    status = payee_status(destination)
    if status["stripe_transfers"] != "active":
        raise PaymentsConfigError(f"payee account {destination} cannot receive transfers yet: {status}")
    if float_available_pence() < to_pay:
        raise PaymentsConfigError(f"claims float has less than £{g.gbp(to_pay)} available; run `python -m payments fund 5000`")

    transfer = client().v1.transfers.create(
        {
            "amount": to_pay,
            "currency": CURRENCY,
            "destination": destination,
            "description": f"LARKSPUR {claim_id} (decision v{version})",  # SAP-01 5.3
            "transfer_group": claim_id,
            "metadata": _metadata(decision, policy_record, net_pence, already, to_pay),
        },
        {"idempotency_key": result.idempotency_key},
    )
    result.status = "PAID"
    result.transfer_id = transfer.id
    result.amount_gbp = g.gbp(to_pay)
    return result


def explain_payments(claim_id: str) -> list[dict]:
    """Every payment Stripe holds for a claim, with the clauses and evidence it was made on."""
    return [
        {
            "transfer_id": t.id,
            "created": dt.datetime.fromtimestamp(t.created, dt.timezone.utc).isoformat(),
            "amount_gbp": g.gbp(t.amount),
            "reversed_gbp": g.gbp(t.amount_reversed or 0),
            "destination": t.destination,
            "description": t.description,
            "metadata": _meta(t),
        }
        for t in sorted(claim_transfers(claim_id), key=lambda t: t.created)
    ]
