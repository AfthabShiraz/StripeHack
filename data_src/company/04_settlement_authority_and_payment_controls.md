# Larkspur Assurance — Settlement Authority & Payment Controls

**Document ID:** SAP-01
**Version:** 2.1
**Effective:** 1 March 2026
**Owner:** Claims Director, with Finance Controls

---

## 1. Purpose

This document sets out who (or what) may settle a claim, up to what amount, and the controls on every payment. It applies to human handlers and to the Autonomous Claims Agent (ACA). The ACA has **no authority** beyond what is written here.

---

## 2. Authority matrix (travel)

Authority is determined by the **net settlement amount** for the claim (total payable after limits and excesses across all sections), not by the amount claimed.

| Tier | Holder | Settle up to (net, per claim) | May issue partial declines? | May issue full declines? |
|---|---|---|---|---|
| T0 | Autonomous Claims Agent (ACA) | **£1,000** | Yes — only under Section 4 | **No** |
| T1 | Claims Handler | £5,000 | Yes | Yes, up to £5,000 claimed |
| T2 | Senior Claims Handler | £25,000 | Yes | Yes, up to £25,000 claimed |
| T3 | Claims Technical Manager | £100,000 | Yes | Yes |
| T4 | Claims Director | Unlimited | Yes | Yes |

---

## 3. Preconditions for autonomous settlement (ACA, Tier T0)

The ACA may settle and pay a claim **without human approval** only if **every** condition below is met. If any condition fails, the ACA must REFER to a T1 handler with its Evidence Pack, and must not make any payment.

| ID | Condition |
|---|---|
| P1 | Net settlement amount ≤ £1,000. |
| P2 | Policy status is ACTIVE and premium is paid; every incident date falls within the period of insurance. |
| P3 | Claimant is a named insured on the Certificate, and claim notified within 31 days of return (GC.1). |
| P4 | The governing wording reference and cover level are taken from the Certificate. |
| P5 | Every PAY / PAY_PARTIAL line has all mandatory evidence (CHG-TRV §6). No line is in PEND. |
| P6 | Fraud indicator score < 40 (FRD-03). Scores 25–39 may proceed but must be flagged for post-payment QA sampling. |
| P7 | No Section C in-patient treatment, repatriation, or any Section H / Section I claim. |
| P8 | Payee = policyholder named on the Certificate, and the bank account matches the **verified payee account on file** in the policy record. Bank details on file must not have been changed in the last 14 days. |
| P9 | Every line outcome cites at least one clause ID and at least one evidence document ID. |
| P10 | Any partial decline satisfies Section 4. |

---

## 4. Autonomous partial declines

4.1 The ACA may decline individual line items within a claim it otherwise settles, provided **all** of the following are true:

(a) the declined line is ≤ £1,000 (as claimed);
(b) the decline relies on an **Objective Exclusion** in Appendix B, or on the absence of cover under the Certificate (e.g. cover level or extension not purchased);
(c) the facts establishing the exclusion come from an evidence source at level 1 or 2 of the hierarchy (CHG-TRV §5), or from the claimant's own written statement, and the decision quotes that evidence verbatim;
(d) at least one other line on the claim is paid.

4.2 A claim where **every** line would be declined is a full decline and must be referred to T1.

---

## 5. Payment controls

5.1 **Currency.** All payments are in GBP.

5.2 **One settlement payment per decision.** Each settlement decision produces exactly one payment. Payments must carry an idempotency key equal to `{claim_id}-{decision_version}` so that retries never pay twice.

5.3 **Payment reference** shown to the customer: `LARKSPUR {claim_id}`.

5.4 **Single payment cap (ACA):** £1,000. **Daily aggregate cap (ACA, all claims):** £25,000. If either cap would be exceeded, REFER.

5.5 **Payee.** Pay only to the verified payee account in the policy record (P8). Never pay to an account supplied only on a claim form if it differs from the verified account; in that case REFER.

5.6 **Linkage.** Every payment record must store the claim ID, decision version, net amount by section, the clause IDs relied on, and the evidence document IDs relied on.

5.7 **Kill switch.** Claims Operations can suspend ACA payments at any time. When suspended, the ACA must REFER all claims.

5.8 **No partial manual overrides.** The ACA may not change its own limits, retry a refused payment with different parameters, or split a payment to fit a cap.

---

## Appendix A — Payment rail

Settlement payments are made through the Claims Payments Platform. In non-production environments the platform runs against a payments provider sandbox (test mode). The payment record must be written before the customer letter is issued.

## Appendix B — Objective Exclusions (eligible for autonomous partial decline)

| Ref | Clause | Description |
|---|---|---|
| OE-1 | E.4.1 | Delayed-baggage purchases made after baggage was returned (time-stamped receipt vs carrier delivery confirmation) |
| OE-2 | E.4.2 | Non-essential items under delayed baggage (fashion/luxury/outerwear beyond reasonable need) |
| OE-3 | D.4.4 | Gadgets where the Gadget extension is not shown on the Certificate |
| OE-4 | D.4.5 + def. 2.12 | Property left unattended in a public place |
| OE-5 | D.4.6 | Theft not reported to police within 24 hours |
| OE-6 | C7.2 | Non-medical items on pharmacy receipts |
| OE-7 | 1.3 / B2.3(b) / C7.4 | Costs attributable to persons not named on the Certificate |
| OE-8 | CHG-TRV 7.4 | Duplicate receipts (second and later occurrences) |
| OE-9 | E.4.3 | Baggage delays on return journey |
