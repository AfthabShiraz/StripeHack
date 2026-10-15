# Larkspur Assurance — Claims Handling Guidelines: Travel

**Document ID:** CHG-TRV v4.2
**Owner:** Head of Travel Claims
**Effective:** 1 March 2026
**Classification:** Internal — applies to all claims handlers, including the Autonomous Claims Agent (ACA)

---

## 1. Purpose and scope

1.1 These guidelines set out how travel insurance claims are assessed, quantified, decided and recorded. They apply to every travel claim regardless of who handles it — a human handler or the Autonomous Claims Agent (ACA).

1.2 These guidelines do **not** change the policy contract. If anything here appears to conflict with the policy wording, the policy wording prevails, and the conflict must be raised with Claims Technical.

1.3 Settlement authority and payment controls are in a separate document: *Settlement Authority & Payment Controls (SAP-01)*. Fraud indicators are in *Fraud Indicators & SIU Referral (FRD-03)*.

---

## 2. Principles

2.1 **Fair and prompt.** Claims must be handled promptly and fairly. A claim must not be rejected unreasonably (FCA ICOBS 8.1.1R). Under the Consumer Duty we must avoid foreseeable harm and support customers to pursue their claims.

2.2 **Evidence-led.** Every decision must be traceable to (a) a specific clause of the governing policy wording and (b) specific evidence in the claim file. A decision that cannot cite both is not a decision — it must be pended or referred.

2.3 **Ambiguity favours the customer.** Where a policy term is genuinely ambiguous, it is interpreted in the way most favourable to the customer (contra proferentem). This does not apply to clear definitions, e.g. the definition of **unattended**.

2.4 **Decide line by line.** A claim is made up of several heads of claim (sections) and line items. Each line item receives its own outcome. One declined item must never cause unrelated items to be declined, unless fraud is established under GC.2 by SIU.

2.5 **Do not infer facts not in evidence.** If a fact needed for a decision is not in the file, request it (PEND). Do not assume it.

---

## 3. Workflow

| Stage | Description | Output |
|---|---|---|
| 1. Intake (FNOL) | Register claim, link to policy record, check notification within 31 days of return (GC.1) | Claim ID |
| 2. Coverage verification | Policy in force on date of each incident; claimant is a named insured; destination within cover area; correct wording version and cover level identified | Coverage record |
| 3. Document triage | Classify every document, map it to a head of claim, flag irrelevant documents | Document index |
| 4. Validation | Check each line item against the governing clauses and mandatory evidence (Section 6) | Line-item findings |
| 5. Consistency & fraud screen | Cross-check accounts and documents; score indicators per FRD-03 | Fraud score |
| 6. Quantum | Calculate payable amount per line, apply sub-limits and excess (Section 7) | Settlement calculation |
| 7. Decision | Determine outcome per line and overall within authority (SAP-01) | Decision record |
| 8. Payment & communication | Issue payment; send decision letter per LTR-02 | Payment ref, letter |

---

## 4. Determining the governing wording and cover level

4.1 The governing wording is the version shown on the claimant's **Certificate of Insurance** (field "Policy wording reference"). Do not use the newest wording simply because it is newest, and do not use superseded wordings for policies issued under a newer reference.

4.2 Cover level (Silver / Gold / Platinum) and optional extensions (e.g. Gadget extension) are taken **only** from the Certificate.

4.3 Marketing brochures, web pages, sales scripts and social media posts are **not** contractual and must never be relied upon to grant or deny cover. If a customer cites marketing material, record it and refer to Customer Relations; still decide the claim on the wording.

---

## 5. Evidence hierarchy

5.1 When documents conflict, weigh them in this order (strongest first):

1. Independent official records — police reports, carrier PIRs and delivery confirmations, medical certificates and invoices from treating providers.
2. Independent commercial records — merchant receipts, bank and card statements, booking confirmations, operator correspondence.
3. The claimant's detailed written statement.
4. The claim form (a summary — lowest weight where it conflicts with the above).

5.2 **Original language prevails.** Where a document is supplied in its original language and a translation is also supplied, the **original** is authoritative. Claimant-supplied translations are for convenience only. If a claimant-supplied translation omits or softens a material fact in the original, record this as an inconsistency (FRD-03 indicator F2).

5.3 **Contemporaneous over later.** Statements made at the time of the incident (e.g. to police) carry more weight than later recollections.

---

## 6. Mandatory evidence by section

A line item cannot be paid until all its mandatory evidence is on file. Missing evidence → PEND and request it from the claimant.

| Section | Mandatory evidence |
|---|---|
| A / B1 | Booking confirmation; proof of payment; cancellation invoice / proof costs are non-recoverable; medical certificate where reason is illness or injury |
| B2 | Excursion booking confirmation showing number of persons and price; proof of payment; operator's written confirmation that the cost is non-refundable; **medical practitioner's** certificate covering the excursion date |
| C | Medical report or certificate from the treating **medical practitioner**; itemised invoices; proof of payment; receipts for C3 travel showing date, fare and destination |
| D | Police report obtained within 24 hrs (theft/loss); PIR (carrier loss); proof of ownership and value for items > £100 |
| E | PIR; carrier's written confirmation of baggage return date/time; itemised receipts for each essential item |
| F | Police report within 24 hrs; proof of withdrawal / ownership |

---

## 7. Quantum rules

### 7.1 Currency (applies GC.5)

7.1.1 If a card or bank statement on file shows the GBP amount actually debited for a transaction, pay the **GBP amount debited**. This is the preferred basis.
7.1.2 If no statement line exists for a transaction (e.g. cash payments), convert the foreign-currency amount at the **Larkspur reference rate** (document FX-REF) for the date the cost was incurred.
7.1.3 Round each converted line to the nearest penny (half-up) **before** summing.

### 7.2 Partially eligible receipts

7.2.1 Where a single receipt contains both eligible and ineligible items, the eligible amount is the eligible items' share of the receipt.
7.2.2 Where the GBP debited amount is used (7.1.1), pro-rate it: `eligible GBP = GBP debited × (eligible foreign-currency amount ÷ receipt foreign-currency total)`, rounded half-up to the penny.

### 7.3 Shared costs and non-insured persons

7.3.1 Only costs of insured persons named on the Certificate are payable (policy 1.3).
7.3.2 Where a booking covers several people and is not itemised per person, the insured person's share is the total divided equally by the number of persons on the booking.

### 7.4 Duplicates

7.4.1 Each receipt (identified by merchant, receipt/invoice number, date and amount) may be paid once only. Where the same receipt appears more than once on a claim, pay it once and record the duplicate (FRD-03 indicator F4). An innocent duplicate is common and is not by itself evidence of fraud.

### 7.5 Order of calculation per section

1. Determine eligible amount for each line (7.1–7.4).
2. Sum eligible lines in the section.
3. Apply the section sub-limits (e.g. C3 cap) and the section limit.
4. Deduct the **excess** once per insured person, per section, per incident (unless waived — e.g. C6).
5. The result cannot be less than zero.

### 7.6 Depreciation scale (Section D)

| Age of item at date of loss | Deduction from original purchase price |
|---|---|
| Under 1 year | 10% |
| 1–2 years | 30% |
| 2–3 years | 50% |
| 3–4 years | 70% |
| Over 4 years | 80% |

Gadgets under D.6 use the same scale. Settlement is the lower of the depreciated value and the single article limit.

---

## 8. Section-specific guidance

### 8.1 Section E — Delayed baggage

8.1.1 Compute the delay as **actual arrival time** (from the carrier/PIR) to **baggage return time** (from the carrier's delivery confirmation — not the claimant's recollection).
8.1.2 Only receipts timestamped **inside** that window are eligible. A receipt timestamped after the baggage was returned is declined under E.4.1, regardless of item.
8.1.3 Essential items (policy 2.5): basic clothing, underwear, swimwear on a beach/coastal trip, simple footwear, toiletries, chargers/adaptors. Decline items that are fashion or luxury purchases beyond reasonable need (E.4.2), and record the reason.

### 8.2 Section D — Unattended property

8.2.1 Apply the definition in policy 2.12 strictly. Common examples that **are unattended**: items left on a beach or sun lounger while the claimant swims; bags hung on a chair back out of sight; items left in a hotel lobby while checking in elsewhere.
8.2.2 Determine the facts from the evidence hierarchy (Section 5). The police report's account, as taken at the time, is usually decisive.
8.2.3 Where the exclusion applies, the decline must quote the **specific wording** of the evidence establishing the facts (e.g. the sentence from the police report) and cite **both** the definition (2.12) and the exclusion (D.4.5).
8.2.4 Check D.4.4 first for gadgets: if the Certificate does not show the Gadget extension, a gadget is not covered under D.1 at all. Where both D.4.4 and D.4.5 apply, cite both.

### 8.3 Section C — Medical

8.3.1 Pharmacy receipts: pay only medication and medical supports (C1.2). Remove sunscreen, cosmetics, food and drink (C7.2) line by line.
8.3.2 GHIC waiver (C6): waive the excess only if the provider's invoice shows GHIC/EHIC was used. Private patient invoices do not qualify.
8.3.3 Local travel (C3): taxis to and from the treating facility on the date(s) of treatment. Cash fares without statement lines are converted under 7.1.2.

### 8.4 Section B2 — Missed pre-booked excursions

8.4.1 Confirm the excursion was booked before the injury (B2.3(c)), that the operator confirmed in writing it is non-refundable (B2.3(d)), and that the medical certificate's restriction covers the excursion date (B2.2).
8.4.2 Pay only the insured person's share (B2.3(b), 7.3.2). A companion's ticket is not payable even if the insured person paid for it.

---

## 9. Outcomes

Each line item receives exactly one outcome:

| Outcome | Meaning |
|---|---|
| PAY | Eligible in full (subject to section limits/excess) |
| PAY_PARTIAL | Part of the line is eligible (e.g. pro-rated receipt, insured person's share) |
| DECLINE | Not covered — must cite clause(s) and evidence |
| PEND | Evidence missing — specify exactly what is requested |
| REFER | Outside handler/ACA authority or SIU threshold reached (see SAP-01, FRD-03) |

The overall claim decision is derived from the line outcomes: **SETTLE** (at least one PAY/PAY_PARTIAL, no PEND/REFER), **SETTLE_PARTIAL_PEND** (pay what can be paid, pend the rest — human only), **DECLINE** (all lines declined — human only), **REFER**.

---

## 10. The Evidence Pack (decision record)

Before a decision is made, the handler/ACA must produce an Evidence Pack containing:

1. **Claim summary** — claim ID, policy number, claimant, insured persons, journey dates, notification date.
2. **Coverage verification** — governing wording reference, cover level, extensions, policy status on each incident date, notification-period check.
3. **Document index** — every document received, its classification, the head of claim it relates to, and whether it was relied on, disregarded (with reason) or found irrelevant.
4. **Line-item findings** — for each claimed line: what was claimed, supporting evidence (document IDs and quoted extracts), governing clause IDs, mandatory-evidence check, eligible amount and calculation, outcome.
5. **Consistency & fraud screen** — each indicator triggered, its weight, the evidence for it, and the total score.
6. **Settlement calculation** — per section: eligible total, limits applied, excess applied, net payable; overall net payable.
7. **Authority check** — which SAP-01 tier applies and whether every precondition for autonomous settlement is met.
8. **Recommended decision** — outcome per line and overall.

Every factual statement in the Evidence Pack must reference a document ID. Every coverage statement must reference a clause ID. Statements without references are treated as unsupported.

---

## 11. Records

11.1 The Evidence Pack, decision, payment reference and decision letter are retained for 7 years.
11.2 The ACA must store, for every payment, the clause IDs and evidence document IDs that authorised it, so that the question "why was this paid?" can be answered from the record alone.
