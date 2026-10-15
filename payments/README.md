# payments: Stripe payouts for settled claims

Takes a settlement decision, runs the SAP-01 payment controls in plain code, then pays the policyholder through a Stripe test-mode Transfer. If a check fails it pays nothing and returns `REFERRED` with the rule that stopped it.

## How money moves

```
Insurer's Stripe balance ("claims float", GBP)
        │  Transfer: £ net payable, metadata = claim, version, clauses, evidence
        ▼
Policyholder's connected account (Accounts v2, recipient configuration)
```

- The platform is a UK sandbox (GBP). Each verified payee on a policy record gets one connected account, found by its `payee_token` metadata.
- Stripe is the payment ledger. Before each payment the code reads back what this claim has already been paid, and what the agent has paid today.

## Calling it from the pipeline

```python
from payments import pay_claim

result = pay_claim(decision, policy_record, claim_form)   # claim_form is optional
result.status        # PAID | ALREADY_PAID | NOTHING_TO_PAY | REFERRED
result.failed_rules  # [{"rule": "SAP-01 P1", "detail": "..."}] when REFERRED
result.transfer_id   # tr_... when PAID / ALREADY_PAID
result.to_dict()     # everything, JSON-safe, for the Evidence Pack / Cognee
```

`decision` has the same shape as `data/answer_key/CLM-2026-004817_expected_outcome.json`, plus `decision_version`:

| Field | Notes |
|---|---|
| `claim_id` | |
| `decision_version` | 1, 2, 3, ... A later version pays only the difference from what's already been paid. |
| `overall_decision` | Must be `"SETTLE"` to pay |
| `net_payable_gbp` | The claim total for this version, not the top-up |
| `sections` | `{"E": {"net_gbp": 205.14}, ...}` must add up to `net_payable_gbp` |
| `lines` | `[{line, outcome, payable_gbp, clauses, evidence}]`. Each PAY / PAY_PARTIAL line needs clauses and evidence. |
| `fraud.score` | Optional. 40 or more is referred. |

`policy_record` is the JSON in `data/company/policy_records/`.

`pay_claim` raises `PaymentsConfigError` only for setup problems: a missing key, an empty float, or a payee who can't receive transfers. A guardrail never raises; it always comes back as `REFERRED`.

### "Why did you pay this?"

```python
from payments import explain_payments
explain_payments("CLM-2026-004817")   # every transfer, with its clauses, evidence, lines and section nets
```

## Guardrails (all in `guardrails.py`)

| Rule | Check |
|---|---|
| P1 | Net settlement ≤ £1,000 |
| P2 | Policy ACTIVE, premium PAID |
| P5 / 4.2 | No PEND lines, and at least one line paid |
| P6 | Fraud score < 40 |
| P8 / 5.5 | Verified payee on file, unchanged for 14 days, claim-form bank details match it |
| P9 | Every paid line cites a clause and evidence |
| 5.2 | One payment per decision version, idempotency key `{claim_id}-v{version}` |
| 5.4 | £1,000 single payment cap, £25,000 daily total across all claims |
| 5.6 | Section nets add up to the total, and the payment stores claim, version, section nets, clauses and evidence |
| 5.7 | Kill switch: `ACA_PAYMENTS_SUSPENDED=1` in env, or `aca_payments_suspended` on the policy record |
| 5.8 | A later version lower than what's already paid is referred, not clawed back |

## Setup and demo commands

`.env` needs `STRIPE_SECRET_KEY=sk_test_...` (sandbox key; live keys are refused).

```bash
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m payments check     # account country, float balance, payee status, kill switch
.venv/bin/python -m payments setup     # create Eleanor's payee account, fund the float to £10k
.venv/bin/python -m payments fund 5000 # top up the float (test card, settles instantly)
.venv/bin/python -m payments pay [decision.json]   # default: the answer key, as version 1
.venv/bin/python -m payments explain CLM-2026-004817
```

To see the money in the Dashboard (StripeHack sandbox), open **Balances → Transfers**, or **Connect → Accounts → Eleanor Whitcombe**.
