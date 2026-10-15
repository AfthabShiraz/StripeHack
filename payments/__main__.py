"""Command line for setting up and demoing Stripe payouts.

    python -m payments check                 # key, account country, float, payee status
    python -m payments setup                 # create the demo payee + fund the float
    python -m payments fund 5000             # add £5,000 to the claims float (test mode)
    python -m payments pay [decision.json]   # pay a decision (default: the answer key)
    python -m payments explain CLM-2026-004817
"""

from __future__ import annotations

import json
import sys

from . import stripe_payout as sp

CLAIM_DIR = sp.REPO_ROOT / "data" / "claims" / "CLM-2026-004817"
POLICY_RECORD = sp.REPO_ROOT / "data" / "company" / "policy_records" / "LRK-TRV-26-0071934_policy_admin_record.json"
ANSWER_KEY = sp.REPO_ROOT / "data" / "answer_key" / "CLM-2026-004817_expected_outcome.json"


def _load(path) -> dict:
    return json.loads(open(path).read())


def _print(obj) -> None:
    print(json.dumps(obj, indent=2, default=str))


def check() -> None:
    account = sp.client().v1.accounts.retrieve_current()
    print(f"platform account: {account.id}  country={account.country}  default_currency={account.default_currency}")
    if account.country != "GB":
        print("  WARNING: SAP-01 pays in GBP to a UK policyholder; a non-GB platform may not support this.")
    print(f"claims float available: £{sp.g.gbp(sp.float_available_pence())}")
    token = _load(POLICY_RECORD)["verified_payee_account"]["payee_token"]
    acct = sp.find_payee_account(token)
    print(f"demo payee account: {sp.payee_status(acct) if acct else 'not created yet (run setup)'}")
    print(f"kill switch: {'ON' if sp.kill_switch_on() else 'off'}")


def setup() -> None:
    acct = sp.ensure_payee_account(_load(POLICY_RECORD))
    _print(sp.payee_status(acct))
    if sp.float_available_pence() < 500_000:
        print("funding claims float with £10,000 ...", sp.fund_float(10_000))
    print(f"claims float available: £{sp.g.gbp(sp.float_available_pence())}")


def pay(decision_path: str | None) -> None:
    decision = _load(decision_path or ANSWER_KEY)
    decision.setdefault("decision_version", 1)
    claim_form = _load(CLAIM_DIR / "claim_form.json")
    _print(sp.pay_claim(decision, _load(POLICY_RECORD), claim_form).to_dict())


def main(argv: list[str]) -> None:
    if not argv:
        print(__doc__)
        return
    cmd, args = argv[0], argv[1:]
    if cmd == "check":
        check()
    elif cmd == "setup":
        setup()
    elif cmd == "fund":
        print(sp.fund_float(args[0] if args else 5000))
    elif cmd == "pay":
        pay(args[0] if args else None)
    elif cmd == "explain":
        _print(sp.explain_payments(args[0]))
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main(sys.argv[1:])
