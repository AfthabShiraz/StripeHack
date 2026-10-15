# Synthetic claims dataset — Larkspur Assurance (fictional)

All companies, people, documents and numbers here are made up. Dates are in September 2026.

## Layout

```
data/
├── company/                         # The insurer's knowledge base. Shared across every claim. Put this in a long-lived Cognee dataset.
│   ├── 01_policy_wording_TRV-2026-v1.md          # The contract (the version this claim is governed by)
│   ├── 02_policy_wording_TRV-2024-v3_SUPERSEDED.md  # Older version: different limits, no excursion cover
│   ├── 03_claims_handling_guidelines_v4.2.md     # How to assess: evidence hierarchy, FX, pro-rating, Evidence Pack format
│   ├── 04_settlement_authority_and_payment_controls.md  # Autonomy guardrails: £1,000 agent limit, P1–P10, payment rules
│   ├── 05_fraud_indicators_and_SIU_referral.md   # Weighted indicators, Green/Amber/Red bands
│   ├── 06_fx_reference_rates_2026-09.csv         # FX rates for cash transactions
│   ├── 07_customer_decision_letter_standards.md  # What the customer letter must contain
│   ├── 08_marketing_brochure_travel_2026.md      # NOT contractual (distractor)
│   └── policy_records/
│       ├── LRK-TRV-26-0071934_certificate_of_insurance.md  # Cover level, insured persons, wording version
│       └── LRK-TRV-26-0071934_policy_admin_record.json     # Status, verified payee, claims history
├── claims/
│   └── CLM-2026-004817/             # One claim. Put this in a per-claim Cognee dataset.
│       ├── 00_claim_form.json       # 12 claimed lines across 4 heads of claim
│       ├── 01_claimant_statement.md
│       ├── 02_email_thread.md
│       └── evidence/E01–E23         # Bookings, airline PIR, receipts (PT), police report (PT + claimant translation), medical, card statement, noise
└── answer_key/                      # Ground truth. Never ingest; use for evals only.
```

## The case in one paragraph

Eleanor Whitcombe (Silver, single trip, Lisbon, 12–19 Sep 2026) claims for four things. (1) Her suitcase was delayed ~30 hours, so she bought essentials. (2) Her phone was stolen from the beach. (3) She sprained her ankle in Sintra and paid for a clinic, pharmacy and taxis. (4) She missed a pre-booked sunset cruise. She claims about £1,380. The correct outcome is to pay **£390.20** autonomously and decline several lines with cited clauses. That amount is under the agent's £1,000 limit, so the payment can move in Stripe test mode.

## Suggested agent split (one agent per head of claim)

| Agent | Documents | Clauses it needs |
|---|---|---|
| Coverage / intake | claim form, certificate, admin record, email thread | §1, §2, GC.1, CHG §4 |
| Delayed baggage (E) | E04, E05, E06–E10, E21, E22 | §8 (E), def. 2.5, CHG 7.1, 7.4, 8.1 |
| Personal belongings (D) | E12, E13, E14, statement, certificate | §7 (D), def. 2.12, 2.13, CHG 5.2, 8.2 |
| Medical (C) | E15–E18, E21, FX | §6 (C), CHG 7.1, 7.2, 8.3 |
| Excursion (B2) | E16, E19, E20, E21 | §5 (B2), §1.3, CHG 7.3, 8.4 |
| Consistency / fraud | everything (via graph links: receipt numbers, times, people, places) | FRD-03 |
| Decision + payment | Evidence Pack only | SAP-01, LTR-02 |

Noise documents (E02, E03, E11, E22, E23, the brochure, and unclaimed card-statement lines) test whether the router sends documents only to the agents that need them.
