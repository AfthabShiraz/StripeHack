import type { Claim, RawDoc } from "../../types";

const s = (sec: number) => Math.round(sec * 1000);

const docs: RawDoc[] = [
  {
    id: "CF",
    name: "00_claim_form.pdf",
    title: "Claim form",
    kind: "form",
    text: `# LARKSPUR ASSURANCE — ONLINE CLAIM FORM

**Claim reference:** CLM-2026-004791
**Submitted:** 2026-09-28 10:14:06 UTC · Channel: web
**Policy number:** LRK-TRV-26-0072288

## 1. Claimant

| Field | Detail |
|---|---|
| Name | Daniel Okafor |
| Email | daniel.okafor@example.com |
| Phone | +44 7700 900256 |

## 2. Trip

| Field | Detail |
|---|---|
| Destination | Tenerife, Spain |
| Planned departure | 2026-10-03 |
| Planned return | 2026-10-17 |
| Travelling with | Alone |

## 3. What you are claiming for

### Cancellation — incident date 2026-09-22

I had to cancel my holiday because I need back surgery. My consultant booked the operation for 6 October and said I cannot fly. The villa and the airline will not give me my money back.

| Line | Description | Date | Amount | Receipt |
|---|---|---|---|---|
| 1 | Return flights LGW–TFS (Solent Airways) | 2026-07-02 | GBP 612.00 | SA-PNR QX7T2B |
| 2 | Villa Mirador, Adeje, 14 nights | 2026-07-05 | GBP 1,848.00 | VM-26-0418 |

## 4. Other information

**Total claimed (estimate):** GBP 2,460.00
**Other insurance:** No
**Have you received any refund:** No

## 5. Medical

**Did you have this condition before you bought the policy?** No

## 6. Payment details

| Field | Detail |
|---|---|
| Account name | Mr D Okafor |
| Sort code | 40-12-77 |
| Account number | 33019264 |

## 7. Declaration

I declare that the information I have given is true and complete to the best of my knowledge.

Signed: Daniel Okafor · 2026-09-28 10:13:51 UTC`,
  },
  {
    id: "CERT",
    name: "LRK-TRV-26-0072288_certificate.pdf",
    title: "Certificate of insurance",
    kind: "policy",
    text: `# LARKSPUR ASSURANCE LTD — CERTIFICATE OF INSURANCE

**Travel Insurance — Single Trip**

| Field | Value |
|---|---|
| Policy number | LRK-TRV-26-0072288 |
| Policyholder | Mr Daniel Okafor |
| Date of issue | 14 August 2026 |
| Cover level | **Gold** |
| Destination area | Area 1 — Europe (declared destination: Spain) |
| Trip dates | 3 October 2026 to 17 October 2026 (inclusive) |
| Period of insurance — Section A (Cancellation) | From 14 August 2026 until start of trip |
| Policy wording reference | **TRV-2026 v1** |
| Optional extensions purchased | **None** |
| Premium | £54.90 — paid 14/08/2026 |

## Insured persons

| # | Name | Date of birth | Relationship |
|---|---|---|---|
| 1 | Daniel Okafor | 22/01/1979 | Policyholder |

## Medical declaration

The policyholder confirmed on 14/08/2026 that no insured person has a pre-existing medical condition requiring declaration. No conditions declared.

## Excesses applicable (Gold)

Cancellation/Curtailment £50 · Emergency medical £50 · Personal belongings £50

*Larkspur Assurance Ltd is a fictional company. All persons and details in this document are fictitious.*`,
  },
  {
    id: "E01",
    name: "E01_flight_booking_confirmation.pdf",
    title: "Flight booking confirmation",
    kind: "document",
    text: `**From:** Solent Airways <bookings@solentairways.example>
**To:** daniel.okafor@example.com
**Date:** Thu, 2 Jul 2026 21:12
**Subject:** Booking confirmed — QX7T2B

| | |
|---|---|
| Booking reference | QX7T2B |
| Passenger | MR DANIEL OKAFOR |
| Outbound | SA1820 LGW–TFS, Sat 3 Oct 2026 07:05 |
| Return | SA1821 TFS–LGW, Sat 17 Oct 2026 13:40 |
| Fare type | Saver (non-refundable) |
| Total paid | £612.00 |

Saver fares are non-refundable. Airport taxes and charges can be refunded on request if you do not travel.

*Synthetic test document.*`,
  },
  {
    id: "E02",
    name: "E02_villa_booking_confirmation.pdf",
    title: "Villa booking confirmation",
    kind: "document",
    text: `# VILLA MIRADOR — ADEJE

**Booking:** VM-26-0418
**Guest:** Daniel Okafor
**Booked on:** 5 July 2026
**Stay:** 3 October 2026 – 17 October 2026 (14 nights)
**Total:** £1,848.00 — paid in full 5 July 2026

**Cancellation terms:** Cancellations made 60 days or more before arrival receive a full refund. Cancellations made within 60 days of arrival are non-refundable.

*Villa Mirador is fictional. Synthetic test document.*`,
  },
  {
    id: "E03",
    name: "E03_gp_letter_24sep.pdf",
    title: "GP letter 24 Sep",
    kind: "document",
    text: `# CLIFTON ROAD MEDICAL PRACTICE

12 Clifton Road, Bristol BS8 1AF · Tel 0117 000 4410

**Date:** 24 September 2026
**Re:** Mr Daniel OKAFOR, DOB 22/01/1979, NHS no. 000 000 0000

To whom it may concern,

Mr Okafor has been under my care for a lumbar disc prolapse since February 2026.

He was treated with analgesia and physiotherapy. Because his symptoms did not settle he was referred to the orthopaedic spinal team on 2 July 2026.

He was seen by the spinal surgeon on 22 September 2026 and listed for a microdiscectomy on 6 October 2026.

In my opinion he is not fit to travel between now and at least six weeks after surgery.

Yours faithfully,

Dr Hannah Price MRCGP
GMC 0000000

*Synthetic test document.*`,
  },
  {
    id: "E04",
    name: "E04_orthopaedic_referral_02jul.pdf",
    title: "Orthopaedic referral 2 Jul",
    kind: "document",
    text: `# NHS e-REFERRAL — ORTHOPAEDICS (SPINAL)

**Referral date:** 2 July 2026
**Referring clinician:** Dr Hannah Price, Clifton Road Medical Practice
**Patient:** Daniel OKAFOR, 22/01/1979
**Priority:** Routine

**Reason for referral:**
L5/S1 disc prolapse confirmed on MRI 14 May 2026. Persistent right-sided sciatica for 5 months despite physiotherapy. Please assess for surgical management.

**Patient informed of referral:** Yes, 2 July 2026

*Synthetic test document.*`,
  },
  {
    id: "E05",
    name: "E05_hospital_admission_letter.pdf",
    title: "Hospital admission letter",
    kind: "document",
    text: `# BRISTOL ROYAL INFIRMARY — SPINAL SURGERY

**Date:** 22 September 2026
**Patient:** Mr Daniel Okafor

Dear Mr Okafor,

Following your clinic appointment today, you are listed for **right L5/S1 microdiscectomy** on **6 October 2026**. Please attend the Day Surgery Unit at 07:30.

You should not undertake air travel for six weeks after surgery.

Spinal Surgery Admissions

*Synthetic test document.*`,
  },
  {
    id: "E06",
    name: "E06_supplier_refusals.pdf",
    title: "Supplier refusal emails",
    kind: "email",
    text: `**From:** Villa Mirador <reservas@villamirador.example>
**Date:** Fri, 25 Sep 2026 09:02
**Subject:** RE: VM-26-0418 cancellation

Dear Daniel, we are sorry to hear this. As your cancellation is within 60 days of arrival the booking is non-refundable under our terms.

---

**From:** Solent Airways <customer.relations@solentairways.example>
**Date:** Fri, 25 Sep 2026 14:47
**Subject:** RE: QX7T2B cancellation

Your Saver fare is non-refundable. We have refunded unused airport taxes of £84.20 to your original payment card.

*Synthetic test document.*`,
  },
];

export const c004791: Claim = {
  id: "CLM-2026-004791",
  apiId: "clm_1Q7tKpLk4791DnOkf",
  claimant: "Daniel Okafor",
  email: "daniel.okafor@example.com",
  policy: "LRK-TRV-26-0072288",
  product: "Travel · Single trip",
  cover: "Gold",
  wording: "TRV-2026 v1",
  heads: ["Cancellation"],
  destination: "Tenerife, ES",
  tripDates: "3–17 Oct 2026",
  lossDate: "Sep 22, 2026",
  reported: "Sep 28, 2026",
  status: "needs_review",
  claimed: 2460.0,
  net: 0,
  route: "human",
  tier: "T1",
  recommendation: "DECLINE",
  summary:
    "Cancellation for back surgery. Condition treated since February and referred to a surgeon on 2 July, before the policy was bought on 14 August. Not declared. Agents recommend decline under A.3(b). Full declines need a T1 handler.",
  fraudScore: 15,
  fraudBand: "Green",
  documents: docs,
  runLength: s(142),

  findings: [
    {
      id: "F-01",
      side: "for",
      title: "Cancellation for a covered reason",
      detail: "Insured listed for surgery on 6 Oct and certified unfit to travel.",
      agent: "cancellation",
      clauses: ["A.1", "A.2(a)"],
      cites: [
        { doc: "E03", quote: "In my opinion he is not fit to travel between now and at least six weeks after surgery." },
        { doc: "E05", quote: "You should not undertake air travel for six weeks after surgery." },
      ],
    },
    {
      id: "F-02",
      side: "for",
      title: "Villa cost not recoverable",
      detail: "Cancelled inside 60 days. Operator refused refund in writing.",
      agent: "cancellation",
      lines: [2],
      clauses: ["A.1"],
      cites: [
        { doc: "E02", quote: "Cancellations made within 60 days of arrival are non-refundable." },
        { doc: "E06", quote: "As your cancellation is within 60 days of arrival the booking is non-refundable under our terms." },
      ],
    },
    {
      id: "F-03",
      side: "for",
      title: "Section A cover started at purchase",
      detail: "Gold, TRV-2026 v1. Cancellation cover from 14 Aug.",
      agent: "intake",
      clauses: ["SAP P2"],
      cites: [{ doc: "CERT", quote: "From 14 August 2026 until start of trip" }],
    },
    {
      id: "A-01",
      side: "against",
      title: "Condition known before policy was bought",
      detail: "Under GP care since February. MRI in May. Referred to a spinal surgeon on 2 July and told the same day. Policy bought 14 August.",
      agent: "medical",
      lines: [1, 2],
      impact: "−£2,410.00",
      clauses: ["A.3(b)", "GE.1"],
      cites: [
        { doc: "E03", quote: "Mr Okafor has been under my care for a lumbar disc prolapse since February 2026." },
        { doc: "E04", quote: "Patient informed of referral: Yes, 2 July 2026" },
        { doc: "E04", quote: "L5/S1 disc prolapse confirmed on MRI 14 May 2026." },
        { doc: "POL", quote: "any medical condition you knew about at the time you bought this policy unless declared and accepted by us" },
      ],
    },
    {
      id: "A-02",
      side: "against",
      title: "Nothing declared at purchase",
      detail: "Medical declaration on 14 Aug lists no conditions.",
      agent: "medical",
      clauses: ["A.3(b)"],
      cites: [{ doc: "CERT", quote: "No conditions declared." }],
    },
    {
      id: "A-03",
      side: "against",
      title: "Airline taxes refunded",
      detail: "£84.20 refunded by the airline. Recoverable costs are excluded even if cover applied.",
      agent: "cancellation",
      lines: [1],
      impact: "−£84.20",
      clauses: ["A.3(d)"],
      cites: [{ doc: "E06", quote: "We have refunded unused airport taxes of £84.20 to your original payment card." }],
    },
    {
      id: "R-01",
      side: "flag",
      title: "Claim form answer conflicts with GP records",
      detail: "Claimant answered No to having the condition before buying. FRD F2, +15.",
      agent: "consistency",
      clauses: ["FRD F2"],
      cites: [
        { doc: "CF", quote: "Did you have this condition before you bought the policy? No" },
        { doc: "E03", quote: "Mr Okafor has been under my care for a lumbar disc prolapse since February 2026." },
      ],
    },
    {
      id: "R-02",
      side: "flag",
      title: "Full decline is outside agent authority",
      detail: "T0 may not issue full declines. Referred to T1 with Evidence Pack.",
      agent: "decision",
      clauses: ["SAP §2", "SAP 4.2"],
      cites: [{ doc: "SAP", quote: "A claim where every line would be declined is a full decline and must be referred to T1." }],
    },
  ],

  lines: [
    { line: 1, section: "A", description: "Return flights LGW–TFS", date: "2 Jul", claimed: "GBP 612.00", claimedGbp: 612.0, outcome: "DECLINE", payable: 0, clauses: ["A.3(b)", "A.3(d)"], evidence: ["E01", "E03", "E04", "E06"], reason: "Pre-existing, undeclared. £84.20 refunded." },
    { line: 2, section: "A", description: "Villa Mirador, 14 nights", date: "5 Jul", claimed: "GBP 1,848.00", claimedGbp: 1848.0, outcome: "DECLINE", payable: 0, clauses: ["A.3(b)"], evidence: ["E02", "E03", "E04", "E06"], reason: "Pre-existing, undeclared." },
  ],

  sections: [{ section: "A · Cancellation", eligible: 0, limit: "£5,000", excess: 50, net: 0 }],

  authority: [
    { id: "P1", rule: "Net ≤ £1,000", pass: false, note: "£2,325.80 if overridden" },
    { id: "P2", rule: "Policy active, paid, in period", pass: true, note: "Section A from 14 Aug" },
    { id: "P3", rule: "Named insured, notified ≤ 31 days", pass: true, note: "6 days" },
    { id: "P4", rule: "Wording from Certificate", pass: true, note: "TRV-2026 v1" },
    { id: "P5", rule: "Mandatory evidence present", pass: true, note: "Bookings, refusals, medical" },
    { id: "P6", rule: "Fraud score < 40", pass: true, note: "15, Green" },
    { id: "P7", rule: "No in-patient, H or I", pass: true, note: "Section A" },
    { id: "P8", rule: "Verified payee, unchanged 14 days", pass: true, note: "…9264" },
    { id: "P9", rule: "Every line cites clause and doc", pass: true, note: "2 of 2" },
    { id: "P10", rule: "Partial declines meet §4", pass: false, note: "Every line declined, full decline" },
  ],

  fraud: [
    { id: "F1", label: "Policy bought ≤ 7 days before departure", weight: 20, triggered: false, note: "50 days" },
    { id: "F2", label: "Account differs from independent evidence", weight: 15, triggered: true, note: "Form vs GP letter" },
    { id: "F6", label: "2+ claims in 24 months", weight: 15, triggered: false, note: "None" },
    { id: "F9", label: "Bank details differ from payee on file", weight: 25, triggered: false, note: "Match" },
    { id: "F11", label: "Unverifiable medical provider", weight: 20, triggered: false, note: "GP and NHS trust" },
  ],

  payment: {
    id: "",
    amount: 2325.8,
    status: "not_created",
    payee: "Mr D Okafor",
    payeeToken: "payee_tok_51c0e9a7d2",
    account: "•••• 9264",
    reference: "LARKSPUR CLM-2026-004791",
    idempotencyKey: "CLM-2026-004791-v1",
    approvedBy: "",
  },

  logs: [
    { id: "evt_01", type: "claim.referred", detail: "T1 · full decline outside T0 authority", actor: "agent.decision", at: "Sep 30, 11:07" },
    { id: "evt_02", type: "evidence_pack.created", detail: "2 lines · 8 findings · 14 citations", actor: "agent.orchestrator", at: "Sep 30, 11:06" },
    { id: "evt_03", type: "triage.started", detail: "9 agents scheduled", actor: "agent.orchestrator", at: "Sep 30, 11:04" },
    { id: "evt_04", type: "document.received", detail: "E04 orthopaedic referral", actor: "claimant", at: "Sep 30, 10:58" },
    { id: "evt_05", type: "info.requested", detail: "Referral letter mentioned in GP letter", actor: "claims@larkspur", at: "Sep 28, 13:20" },
    { id: "evt_06", type: "claim.created", detail: "Web form · 5 attachments", actor: "claimant", at: "Sep 28, 10:14" },
  ],

  why: [
    {
      q: "Why do you recommend declining?",
      a: "Section A covers cancellation for illness, but A.3(b) excludes any medical condition the insured knew about when they bought the policy unless it was declared. The GP letter says he was under care for a lumbar disc prolapse since February 2026, and the referral shows he was told on 2 July he was being sent to a spinal surgeon. The policy was bought on 14 August with no conditions declared.",
      cites: [
        { doc: "E03", quote: "Mr Okafor has been under my care for a lumbar disc prolapse since February 2026." },
        { doc: "E04", quote: "Patient informed of referral: Yes, 2 July 2026" },
        { doc: "CERT", quote: "No conditions declared." },
      ],
      clauses: ["A.3(b)", "GE.1"],
    },
    {
      q: "Why didn't the agent decide this itself?",
      a: "Every line would be declined, which makes it a full decline. The agent's T0 authority allows partial declines only. SAP-01 4.2 requires a full decline to go to a T1 handler with the Evidence Pack.",
      cites: [{ doc: "SAP", quote: "A claim where every line would be declined is a full decline and must be referred to T1." }],
      clauses: ["SAP §2", "SAP 4.2"],
    },
  ],

  agents: [
    {
      id: "orch",
      name: "Orchestrator",
      kind: "orchestrator",
      model: "claude-opus-5-5",
      start: 0,
      duration: s(142),
      tokensIn: 9310,
      tokensOut: 1620,
      docs: [],
      clauses: [],
      steps: [
        { t: s(0.3), type: "memory", label: "Loaded claim graph clm_1Q7tKpLk4791DnOkf", detail: "8 documents · 2 claimed lines · 1 head of claim" },
        { t: s(0.8), type: "spawn", label: "Spawned Intake & coverage, Document router" },
        { t: s(11.2), type: "spawn", label: "Spawned 2 evidence extractors" },
        { t: s(44.0), type: "spawn", label: "Spawned Cancellation (A), Medical history, Consistency & fraud" },
        { t: s(104.8), type: "spawn", label: "Spawned Settlement calculator" },
        { t: s(110.0), type: "spawn", label: "Spawned Decision & authority" },
        { t: s(141.6), type: "decision", label: "Referred to T1", detail: "Recommendation DECLINE · no payment", result: "warn" },
      ],
      output: { evidence_pack: "ep_4791_v1", findings: 8, citations: 14, outcome: "REFER", recommendation: "DECLINE" },
    },
    {
      id: "intake",
      name: "Intake & coverage",
      kind: "intake",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(1.0),
      duration: s(16),
      tokensIn: 7720,
      tokensOut: 610,
      docs: ["CF", "CERT"],
      clauses: ["§1", "GC.1"],
      steps: [
        { t: s(1.6), type: "read", label: "Read claim form", cite: { doc: "CF", quote: "LRK-TRV-26-0072288" } },
        { t: s(4.4), type: "read", label: "Read certificate", cite: { doc: "CERT", quote: "TRV-2026 v1" } },
        { t: s(8.9), type: "check", label: "Section A in force from purchase", clause: "SAP P2", result: "pass", cite: { doc: "CERT", quote: "From 14 August 2026 until start of trip" } },
        { t: s(12.1), type: "extract", label: "Medical declaration: none", result: "info", cite: { doc: "CERT", quote: "No conditions declared." } },
        { t: s(16.3), type: "finding", label: "Wrote F-03", finding: "F-03" },
      ],
      output: { wording: "TRV-2026 v1", cover_level: "GOLD", section_a_from: "2026-08-14", conditions_declared: [] },
    },
    {
      id: "router",
      name: "Document router",
      kind: "router",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(1.1),
      duration: s(9.5),
      tokensIn: 6090,
      tokensOut: 280,
      docs: [],
      clauses: [],
      steps: [
        { t: s(1.7), type: "tool", label: "classify_documents(8)" },
        { t: s(10.3), type: "handoff", label: "Routing table returned", detail: "A → E01 E02 E06 · medical → E03 E04 E05" },
      ],
      output: { relevant: 8, noise: [] },
    },
    {
      id: "x-book",
      name: "Extractor · E01, E02, E06 bookings",
      kind: "extractor",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(11.5),
      duration: s(24),
      tokensIn: 3010,
      tokensOut: 390,
      docs: ["E01", "E02", "E06"],
      clauses: [],
      steps: [
        { t: s(12.2), type: "extract", label: "E01 flights £612 Saver, booked 2 Jul", cite: { doc: "E01", quote: "Saver (non-refundable)" } },
        { t: s(18.6), type: "extract", label: "E02 villa £1,848, non-refundable within 60 days", cite: { doc: "E02", quote: "Cancellations made within 60 days of arrival are non-refundable." } },
        { t: s(27.0), type: "extract", label: "E06 airline refunded taxes £84.20", cite: { doc: "E06", quote: "We have refunded unused airport taxes of £84.20 to your original payment card." } },
        { t: s(35.1), type: "memory", label: "Wrote 5 facts to claim graph" },
      ],
      output: { flights_gbp: 612, villa_gbp: 1848, refunded_gbp: 84.2 },
    },
    {
      id: "x-med",
      name: "Extractor · E03–E05 medical",
      kind: "extractor",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(11.7),
      duration: s(31),
      tokensIn: 3640,
      tokensOut: 520,
      docs: ["E03", "E04", "E05"],
      clauses: [],
      steps: [
        { t: s(12.5), type: "extract", label: "E03 under care since Feb 2026", cite: { doc: "E03", quote: "Mr Okafor has been under my care for a lumbar disc prolapse since February 2026." } },
        { t: s(20.2), type: "extract", label: "E04 MRI 14 May, referral 2 Jul, patient informed", cite: { doc: "E04", quote: "Patient informed of referral: Yes, 2 July 2026" } },
        { t: s(31.4), type: "extract", label: "E05 surgery 6 Oct, no flying 6 weeks", cite: { doc: "E05", quote: "You should not undertake air travel for six weeks after surgery." } },
        { t: s(42.3), type: "memory", label: "Wrote 6 facts, 1 timeline edge to claim graph" },
      ],
      output: { condition: "L5/S1 disc prolapse", first_care: "2026-02", referral: "2026-07-02", surgery: "2026-10-06" },
    },
    {
      id: "cancellation",
      name: "Cancellation (A)",
      kind: "section",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(44.2),
      duration: s(52),
      tokensIn: 10420,
      tokensOut: 1540,
      docs: ["E01", "E02", "E03", "E05", "E06"],
      clauses: ["A.1", "A.2", "A.3"],
      steps: [
        { t: s(45.0), type: "retrieve", label: "Retrieved Section A", cite: { doc: "POL", quote: "if you necessarily cancel your journey because of one of the reasons in A.2" } },
        { t: s(52.3), type: "check", label: "Illness of insured is a covered reason", clause: "A.2(a)", result: "pass", cite: { doc: "E03", quote: "In my opinion he is not fit to travel between now and at least six weeks after surgery." } },
        { t: s(61.0), type: "check", label: "Villa non-recoverable", result: "pass", cite: { doc: "E06", quote: "As your cancellation is within 60 days of arrival the booking is non-refundable under our terms." } },
        { t: s(70.5), type: "check", label: "Airline taxes recoverable", clause: "A.3(d)", result: "fail", cite: { doc: "E06", quote: "We have refunded unused airport taxes of £84.20 to your original payment card." } },
        { t: s(82.0), type: "tool", label: "counterfactual(612 − 84.20 + 1848 − 50) → £2,325.80" },
        { t: s(90.4), type: "finding", label: "Wrote F-01, F-02, A-03", finding: "F-01" },
        { t: s(95.8), type: "handoff", label: "Section A eligible £2,325.80 before A.3(b)" },
      ],
      output: { section: "A", eligible_before_exclusion_gbp: 2325.8 },
    },
    {
      id: "medical",
      name: "Medical history",
      kind: "section",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(44.5),
      duration: s(58),
      tokensIn: 9870,
      tokensOut: 1720,
      docs: ["E03", "E04", "CERT", "CF"],
      clauses: ["A.3(b)", "GE.1"],
      steps: [
        { t: s(45.3), type: "retrieve", label: "Retrieved A.3(b), GE.1", cite: { doc: "POL", quote: "any medical condition you knew about at the time you bought this policy unless declared and accepted by us" } },
        { t: s(53.9), type: "check", label: "Condition under GP care since Feb 2026", result: "fail", cite: { doc: "E03", quote: "Mr Okafor has been under my care for a lumbar disc prolapse since February 2026." } },
        { t: s(62.4), type: "check", label: "MRI confirmed 14 May 2026", result: "fail", cite: { doc: "E04", quote: "L5/S1 disc prolapse confirmed on MRI 14 May 2026." } },
        { t: s(71.0), type: "check", label: "Insured told of surgical referral 2 Jul, before purchase 14 Aug", clause: "A.3(b)", result: "fail", cite: { doc: "E04", quote: "Patient informed of referral: Yes, 2 July 2026" } },
        { t: s(80.6), type: "check", label: "Not declared at purchase", result: "fail", cite: { doc: "CERT", quote: "No conditions declared." } },
        { t: s(94.0), type: "finding", label: "Wrote A-01, A-02", finding: "A-01" },
        { t: s(102.1), type: "handoff", label: "Exclusion A.3(b) applies to all lines" },
      ],
      output: { known_before_purchase: true, declared: false, exclusion: "A.3(b)" },
    },
    {
      id: "consistency",
      name: "Consistency & fraud",
      kind: "consistency",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(44.8),
      duration: s(46),
      tokensIn: 8830,
      tokensOut: 690,
      docs: ["CF", "E03"],
      clauses: ["FRD-03"],
      steps: [
        { t: s(46.0), type: "check", label: "Claim form medical answer vs GP letter", clause: "F2", result: "fail", cite: { doc: "CF", quote: "Did you have this condition before you bought the policy? No" } },
        { t: s(66.2), type: "check", label: "Policy bought 50 days before departure", clause: "F1", result: "pass" },
        { t: s(78.0), type: "check", label: "Bank details match payee on file", clause: "F9", result: "pass" },
        { t: s(88.5), type: "decision", label: "Score 15 · Green", result: "pass" },
        { t: s(90.0), type: "finding", label: "Wrote R-01", finding: "R-01" },
      ],
      output: { score: 15, band: "Green", triggered: ["F2"] },
    },
    {
      id: "calc",
      name: "Settlement calculator",
      kind: "calculator",
      parent: "orch",
      model: "deterministic",
      start: s(105.0),
      duration: s(4.5),
      tokensIn: 0,
      tokensOut: 0,
      docs: [],
      clauses: ["CHG 7.5"],
      steps: [
        { t: s(105.6), type: "tool", label: "apply_exclusion(A.3(b), lines 1–2) → £0.00" },
        { t: s(109.0), type: "tool", label: "override_value → £2,325.80" },
      ],
      output: { net_gbp: 0, if_overridden_gbp: 2325.8 },
    },
    {
      id: "decision",
      name: "Decision & authority",
      kind: "decision",
      parent: "orch",
      model: "claude-opus-5-5",
      start: s(110.2),
      duration: s(31),
      tokensIn: 7420,
      tokensOut: 1510,
      docs: ["SAP"],
      clauses: ["SAP-01 §2", "SAP-01 §4"],
      steps: [
        { t: s(111.0), type: "read", label: "Read Evidence Pack ep_4791_v1" },
        { t: s(118.4), type: "check", label: "Every line declined: full decline", clause: "SAP 4.2", result: "fail", cite: { doc: "SAP", quote: "A claim where every line would be declined is a full decline and must be referred to T1." } },
        { t: s(126.9), type: "check", label: "Override value £2,325.80 > £1,000", clause: "P1", result: "fail" },
        { t: s(134.0), type: "decision", label: "REFER to T1 · recommend DECLINE", result: "warn" },
        { t: s(140.8), type: "handoff", label: "Placed in review queue" },
      ],
      output: { decision: "REFER", tier: "T1", recommendation: "DECLINE", human_required: true },
    },
  ],
};
