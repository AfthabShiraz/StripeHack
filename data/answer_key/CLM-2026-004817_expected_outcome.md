# ANSWER KEY — CLM-2026-004817 (do NOT ingest into Cognee or show to agents)

This is the ground truth for evaluating the pipeline. Everything here can be derived from `company/` + `claims/CLM-2026-004817/`.

## Headline

| | |
|---|---|
| Governing wording | **TRV-2026 v1** (from Certificate) — not TRV-2024 v3, not the brochure |
| Cover level | **Silver**, **no Gadget extension** |
| Insured persons | **Eleanor Whitcombe only** (Tom Ashdown is NOT insured) |
| Net payable | **£390.20** |
| Overall decision | **SETTLE** with autonomous partial declines (phone, jacket, duplicate, sunscreen, Tom's excursion share) |
| Authority | **T0 — ACA may pay autonomously** (all P1–P10 satisfied) |
| Fraud score | **30 — Amber** → pay, flag for post-payment QA sample |
| Payment | £390.20 GBP to verified payee `payee_tok_8f3c2a91e4` (acct ending 3092), reference `LARKSPUR CLM-2026-004817`, idempotency key `CLM-2026-004817-v1` |

## Coverage verification

- Policy ACTIVE, premium paid 20/08/2026 (admin record; E21 line 1).
- All incident dates (12, 15, 16, 17 Sep) within period of insurance 12–19 Sep 2026 (Certificate).
- Notified 24/09/2026, returned 19/09/2026 → 5 days, within 31 days (GC.1).
- Destination Portugal = Area 1 ✓.

## Line-by-line

| Line | Item | Claimed | Outcome | Payable | Clauses | Evidence | Reasoning |
|---|---|---|---|---|---|---|---|
| 1 | Farmácia Estrela toiletries | €38.40 | PAY | £32.86 | E.1, 2.5, GC.5, CHG 7.1.1 | E04, E05, E06, E21 | Bought 12/09 15:52, inside delay window (13:06 12/09 → 19:20 13/09). Toiletries are essential. Sunscreen on this receipt is a toiletry: **C7.2 does NOT apply to Section E**. GBP debited used. |
| 2 | Loja Tejo Moda clothes | €86.50 | PAY | £74.02 | E.1, 2.5 | E06–E07, E21 | 12/09 16:41, inside window. Basic clothing. |
| 3 | Cais Beachwear swimsuit + sandals | €84.90 | PAY | £72.61 | E.1, 2.5, CHG 8.1.3 | E08, E21 | 13/09 10:58, inside window. Swimwear/simple footwear essential on a coastal trip; both were in the delayed bag per PIR contents. |
| 4 | TecnoBaixa charger + adaptor | €29.99 | PAY | £25.65 | E.1, 2.5 | E09, E21 | 13/09 12:26, inside window. Chargers/adaptors explicitly essential. |
| 5 | Pharmacy items (same receipt FE-2026-118734) | €38.40 | DECLINE (duplicate) | £0.00 | CHG 7.4, OE-8 | E06, 02_email_thread | Same receipt number as line 1. Claimant acknowledged it in email 29/09. Triggers F4. |
| 6 | Alfama Linen jacket | €139.00 | DECLINE | £0.00 | **E.4.1** (primary), E.4.2, OE-1/OE-2 | E10 (14/09 11:37), E05 (bag returned 13/09 19:20), E22 front-desk log | Bought after bag was returned. Also a handmade fashion jacket, not an essential item. |
| 7 | iPhone 15 | £649.00 | DECLINE | £0.00 | **D.4.4** (no Gadget extension), **D.4.5 + def. 2.12** (unattended), OE-3, OE-4 | Certificate ("Gadget extension: NOT purchased"); E12 original: *"deixou o seu saco de praia sobre a toalha, na areia, sem vigilância, enquanto nadava no mar … a uma distância aproximada de 40 (quarenta) metros"*; 01 statement ("we went for a swim together … about 20 minutes") | Two independent grounds. Must quote the **original** Portuguese report, not the claimant's translation (E13), which drops "sem vigilância" and "40 metros". Triggers F2 and F5. Counterfactual if covered: £699 × 70% (1–2 yrs, CHG 7.6) = £489.30 → capped at £300 single-article → minus £75 excess = £225. |
| 8 | Clinic consultation + X-ray + bandage | €185.00 | PAY | £158.66 | C1.1, GC.5 | E15, E16, E21 | Private patient; GHIC not used → excess NOT waived (C6, CHG 8.3.2). |
| 9 | Farmácia Central de Sintra | €42.15 | PAY_PARTIAL | £25.09 | C1.2, **C7.2**, CHG 7.2.2, OE-6 | E16 (doctor recommended diclofenac gel + ankle support), E17, E21 | Gel €9.85 + support €19.40 = €29.25 eligible; sunscreen €12.90 excluded. £36.15 × 29.25/42.15 = £25.09. |
| 10 | Taxi Pena → clinic (cash) | €16.80 | PAY | £14.35 | C3, CHG 7.1.2 | E18, FX-REF 16/09 0.8540 | Cash — no statement line, so FX reference rate. |
| 11 | Taxi clinic → hotel Lisbon (cash) | €41.30 | PAY | £35.27 | C3, CHG 7.1.2 | E18, FX-REF | C3 total £49.62 < £100 sub-limit. |
| 12 | Tagus sunset cruise | €120.00 | PAY_PARTIAL | £51.69 | **B2.1, B2.2, B2.3(b)**, 1.3, CHG 7.3.2, OE-7 | E16 (restriction until 19/09 13:20 covers 17/09 18:30), E19 (2 adults, booked 28/08 — before injury), E20 (non-refundable in writing), E21 (£103.38 debited) | Only Eleanor's share: £103.38 / 2. Tom's ticket excluded. No excess on B2. |

## Settlement calculation

| Section | Eligible | Limit / sub-limit | Excess | Net |
|---|---|---|---|---|
| E Delayed baggage | £32.86 + £74.02 + £72.61 + £25.65 = **£205.14** | £300 (not reached) | nil | **£205.14** |
| C Medical (C1 + C3) | £158.66 + £25.09 + £14.35 + £35.27 = **£233.37** | C3 £49.62 ≤ £100 | £100 (once, C5) | **£133.37** |
| B2 Missed excursion | **£51.69** | £250 | nil | **£51.69** |
| D Personal belongings | £0.00 | — | — | **£0.00** |
| **Total** | | | | **£390.20** |

## Fraud screen (FRD-03)

| ID | Triggered? | Weight | Evidence |
|---|---|---|---|
| F1 | No | — | Policy bought 20/08, departure 12/09 (23 days) |
| F2 | **Yes** | 15 | Claim form "while I was nearby" + claimant translation "swimming nearby" vs original police report "sem vigilância … 40 metros" |
| F3 | No | — | Theft ~15:30–15:50, reported 16:45 same day |
| F4 | **Yes** | 10 | Receipt FE-2026-118734 on lines 1 and 5 |
| F5 | **Yes** | 5 | iPhone claimed at £649 |
| F6 | No | — | One prior claim (notified 09/05/2024), > 24 months before 24/09/2026 |
| F7 | No | — | All receipts printed with tax IDs |
| F8 | No | — | Phone receipt dated 02/11/2024 |
| F9 | No | — | Claim form bank details (…61 / …3092) match verified payee on file |
| F10 | No | — | Form amounts match receipts |
| F11 | No | — | Clinic has ERS registration, address, doctor's OM number |
| **Total** | | **30** | **Amber** — proceed; flag for post-payment QA |

## Authority check (SAP-01 §3)

P1 £390.20 ≤ £1,000 ✓ · P2 active/paid/in period ✓ · P3 named insured, notified in 5 days ✓ · P4 wording from Certificate ✓ · P5 mandatory docs present for all paid lines (E: PIR E04 + delivery E05 + receipts; C: E16 + E15 + E17 + E18 + E21; B2: E19 + E20 + E21 + E16) ✓ · P6 score 30 < 40 ✓ (QA flag) · P7 no in-patient/H/I ✓ · P8 payee matches verified account, unchanged since 2024 ✓ · P9 every line cites clause + doc ✓ · P10 partial declines all ≤ £1,000, all Objective Exclusions, ≥1 line paid ✓.

## Other things a strong system notices (no effect on payout)

- **Recovery opportunity (GC.4):** E04/E05 say Solent Airways accepts interim-expense claims within 21 days. Larkspur may pursue recovery of the £205.14 from the carrier. Claimant declared no carrier compensation received.
- **Irrelevant documents:** E02 boarding pass (corroborates bag tag only), E03 hotel booking, E11 restaurant receipt, E22 hotel invoice (but its front-desk log corroborates the 19:20 delivery), E23 newsletter, plus non-claim lines on E21.
- **Brochure conflict:** brochure says "phones protected wherever you go" and "up to £400" for delayed bags. Not contractual (wording §preamble, CHG 4.3). Must not grant cover.
- **Medical certificate fit-to-fly** — no curtailment or repatriation issue.
- **Decision letter (LTR-02)** must not mention fraud score or QA flag, and must invite Eleanor to provide further information on the phone decline.

## Common wrong answers (useful for evals)

| Mistake | Resulting total |
|---|---|
| Duplicate pharmacy receipt not removed | £423.06 |
| Jacket included (E capped at £300) | £485.06 |
| Used TRV-2024 v3 (medical excess £75, no B2 cover) | £363.51 |
| Paid Tom's half of excursion | £441.89 |
| Sunscreen not removed from medical pharmacy receipt | £401.26 |
| Removed sunscreen from Section E toiletries receipt too (over-applying C7.2) | £377.41 |
| Used FX table instead of GBP debited for card transactions (Section E only) | £389.31 |
| Phone paid at counterfactual £225 (missed both exclusions) | £615.20 |
| GHIC excess wrongly waived | £490.20 |
