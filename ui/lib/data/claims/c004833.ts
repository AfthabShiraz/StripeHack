import type { Claim, RawDoc } from "../../types";

const s = (sec: number) => Math.round(sec * 1000);

const docs: RawDoc[] = [
  {
    id: "CF",
    name: "00_claim_form.pdf",
    title: "Claim form",
    kind: "form",
    text: `# LARKSPUR ASSURANCE — ONLINE CLAIM FORM

**Claim reference:** CLM-2026-004833
**Submitted:** 2026-10-11 19:02:41 UTC · Channel: app
**Policy number:** LRK-TRV-26-0074410

## 1. Claimant

| Field | Detail |
|---|---|
| Name | Priya Raman |
| Email | priya.raman@example.com |
| Phone | +44 7700 900733 |

## 2. Trip

| Field | Detail |
|---|---|
| Destination | Barcelona, Spain |
| Departed UK | 2026-10-02 |
| Returned UK | 2026-10-09 |
| Travelling with | Alone |

## 3. What you are claiming for

### Delayed baggage — incident date 2026-10-02

My bag did not arrive on SA2210. The airline brought it to my apartment the next morning. I bought toiletries, a change of clothes and a charger.

| Line | Description | Date | Amount | Receipt |
|---|---|---|---|---|
| 1 | Toiletries (Farmàcia Diagonal) | 2026-10-02 | EUR 27.35 | FD-0021-88412 |
| 2 | Underwear, t-shirt, leggings (Roba Gràcia) | 2026-10-02 | EUR 64.80 | RG 7781-1002 |
| 3 | USB-C charger (ElectroRambla) | 2026-10-02 | EUR 22.99 | ER-2026-31877 |

## 4. Other information

**Total claimed (estimate):** GBP 98.76
**Other insurance:** No
**Compensation received from carrier:** No

## 5. Payment details

| Field | Detail |
|---|---|
| Account name | Ms P Raman |
| Sort code | 30-90-12 |
| Account number | 71224508 |

## 6. Declaration

I declare that the information I have given is true and complete to the best of my knowledge.

Signed: Priya Raman · 2026-10-11 19:02:30 UTC`,
  },
  {
    id: "CERT",
    name: "LRK-TRV-26-0074410_certificate.pdf",
    title: "Certificate of insurance",
    kind: "policy",
    text: `# LARKSPUR ASSURANCE LTD — CERTIFICATE OF INSURANCE

**Travel Insurance — Single Trip**

| Field | Value |
|---|---|
| Policy number | LRK-TRV-26-0074410 |
| Policyholder | Ms Priya Raman |
| Date of issue | 11 September 2026 |
| Cover level | **Silver** |
| Destination area | Area 1 — Europe (declared destination: Spain) |
| Trip dates | 2 October 2026 to 9 October 2026 (inclusive) |
| Period of insurance — all other sections | 2 October 2026 00:01 to 9 October 2026 23:59 (UK time) |
| Policy wording reference | **TRV-2026 v1** |
| Optional extensions purchased | **None** |
| Premium | £31.20 — paid 11/09/2026 |

## Insured persons

| # | Name | Date of birth | Relationship |
|---|---|---|---|
| 1 | Priya Raman | 19/07/1994 | Policyholder |

## Excesses applicable (Silver)

Emergency medical £100 · Personal belongings £75 · Delayed baggage nil

*Larkspur Assurance Ltd is a fictional company. All persons and details in this document are fictitious.*`,
  },
  {
    id: "E01",
    name: "E01_airline_property_irregularity_report.pdf",
    title: "Airline property irregularity report",
    kind: "document",
    text: `# PROPERTY IRREGULARITY REPORT (PIR)

**Issued by:** Solent Airways Baggage Services — Barcelona El Prat (BCN)
**File reference:** BCNSA20915
**Report type:** AHL (Delayed baggage)
**Date/time of report:** 02 OCT 2026 10:21 (local)

| Field | Detail |
|---|---|
| Passenger name | RAMAN / PRIYA MS |
| Flight / date | SA2210 / 02OCT26 |
| Routing | LGW / BCN |
| Scheduled arrival | 09:30 |
| **Actual arrival (on blocks)** | **09:42** |
| Bag tag number | SA 220481 |
| Bag description | Soft case, black, 2 wheels. Type code BK02 |
| Contents (passenger declared) | Clothing, toiletries, chargers, shoes |
| Local address | Carrer de Verdi 41, 2-1, Barcelona |

**Remarks:** Bag short-shipped at LGW. Forwarded on SA2212.

Agent: M. PUIG (BH-0412)

*Synthetic test document.*`,
  },
  {
    id: "E02",
    name: "E02_airline_bag_delivery_confirmation.pdf",
    title: "Airline bag delivery confirmation",
    kind: "document",
    text: `**From:** Solent Airways Baggage Services <baggage@solentairways.example>
**To:** priya.raman@example.com
**Date:** Sat, 3 Oct 2026 08:40
**Subject:** Your delayed bag — file BCNSA20915 — DELIVERED

Dear Ms Raman,

Your baggage under file reference **BCNSA20915** has been delivered.

| | |
|---|---|
| Bag tag | SA 220481 |
| Delivered to | Carrer de Verdi 41, 2-1 |
| **Delivery date/time** | **03 OCT 2026 08:15 (local)** |
| Signed for by | Passenger |

Your file is now closed.

Kind regards,
Solent Airways Baggage Services

*Synthetic test document.*`,
  },
  {
    id: "E03",
    name: "E03_receipt_farmacia_diagonal_02oct.txt",
    title: "Receipt Farmàcia Diagonal 02 Oct",
    kind: "receipt",
    text: `      FARMACIA DIAGONAL
  Av. Diagonal 402, 08037 Barcelona
      NIF: B-61 220 417
--------------------------------------
FACTURA SIMPLIFICADA  FD-0021-88412
02/10/2026            13:18
--------------------------------------
Cepillo dientes          1    2.95
Pasta dientes 75ml       1    3.80
Champu 300ml             1    7.40
Desodorante              1    5.25
Crema hidratante         1    7.95
--------------------------------------
TOTAL EUR                    27.35
IVA incl. (21%)               4.75
--------------------------------------
VISA ****8830   Aut. 117204`,
  },
  {
    id: "E04",
    name: "E04_receipt_roba_gracia_02oct.txt",
    title: "Receipt Roba Gràcia 02 Oct",
    kind: "receipt",
    text: `          ROBA GRACIA
  Carrer Gran de Gracia 118, Barcelona
        NIF: B-66 019 334
======================================
TIQUET  RG 7781-1002
02-10-2026  14:05   CAIXA 1
======================================
Calces pack 3            1   14.90
Samarreta basica         2   19.90
Leggings negre           1   24.00
Mitjons pack 2           1    6.00
======================================
TOTAL               EUR  64.80
IVA 21% incl.            11.25
VISA ****8830   AUT 552019`,
  },
  {
    id: "E05",
    name: "E05_receipt_electrorambla_02oct.txt",
    title: "Receipt ElectroRambla 02 Oct",
    kind: "receipt",
    text: `***************************************
          ELECTRORAMBLA
     La Rambla 71, 08002 Barcelona
        NIF: B-08 774 120
***************************************
Doc: ER-2026-31877
02/10/2026                       16:47
---------------------------------------
Cargador USB-C 25W              22.99
---------------------------------------
TOTAL                     EUR   22.99
VISA ****8830           Aut. 300187
***************************************`,
  },
  {
    id: "E06",
    name: "E06_credit_card_statement_extract.pdf",
    title: "Credit card statement extract",
    kind: "document",
    text: `# HARBOUR BANK — Visa Debit

**Cardholder:** MS P RAMAN
**Card:** Visa ****8830
**Period:** 1 Oct 2026 – 10 Oct 2026

| Txn date | Description | Original amount | GBP debited |
|---|---|---|---|
| 02 Oct | FARMACIA DIAGONAL BARCELONA ES | EUR 27.35 | £23.46 |
| 02 Oct | ROBA GRACIA BARCELONA ES | EUR 64.80 | £55.58 |
| 02 Oct | ELECTRORAMBLA BARCELONA ES | EUR 22.99 | £19.72 |
| 04 Oct | SAGRADA FAMILIA TICKETS ES | EUR 33.00 | £28.31 |

*Harbour Bank is a fictional bank. Synthetic test document.*`,
  },
];

export const c004833: Claim = {
  id: "CLM-2026-004833",
  apiId: "clm_1QBa7mLk4833PrRmn",
  claimant: "Priya Raman",
  email: "priya.raman@example.com",
  policy: "LRK-TRV-26-0074410",
  product: "Travel · Single trip",
  cover: "Silver",
  wording: "TRV-2026 v1",
  heads: ["Delayed baggage"],
  destination: "Barcelona, ES",
  tripDates: "2–9 Oct 2026",
  lossDate: "Oct 2, 2026",
  reported: "Oct 11, 2026",
  status: "paid",
  claimed: 98.76,
  net: 98.76,
  route: "agent",
  tier: "T0",
  recommendation: "SETTLE",
  summary: "Bag delayed 22h 33m on outbound flight. Three essential purchases inside the window. Paid in full.",
  fraudScore: 0,
  fraudBand: "Green",
  documents: docs,
  runLength: s(97),

  findings: [
    {
      id: "F-01",
      side: "for",
      title: "Policy in force, notified in 2 days",
      detail: "Silver, TRV-2026 v1. Returned 9 Oct, claimed 11 Oct.",
      agent: "intake",
      clauses: ["SAP P2", "GC.1"],
      cites: [
        { doc: "CERT", quote: "2 October 2026 00:01 to 9 October 2026 23:59 (UK time)" },
        { doc: "CF", quote: "2026-10-11 19:02:41 UTC" },
      ],
    },
    {
      id: "F-02",
      side: "for",
      title: "Bag delayed 22h 33m on outbound flight",
      detail: "Arrival 09:42 on 2 Oct. Delivered 08:15 on 3 Oct.",
      agent: "baggage",
      lines: [1, 2, 3],
      clauses: ["E.1", "CHG 8.1.1"],
      cites: [
        { doc: "E01", quote: "09:42" },
        { doc: "E02", quote: "03 OCT 2026 08:15 (local)" },
      ],
    },
    {
      id: "F-03",
      side: "for",
      title: "All purchases essential and inside the window",
      detail: "Toiletries 13:18, clothing 14:05, charger 16:47 on 2 Oct.",
      agent: "baggage",
      lines: [1, 2, 3],
      impact: "£98.76",
      clauses: ["2.5", "CHG 8.1.2"],
      cites: [
        { doc: "E03", quote: "02/10/2026            13:18" },
        { doc: "E04", quote: "02-10-2026  14:05   CAIXA 1" },
        { doc: "E05", quote: "02/10/2026                       16:47" },
      ],
    },
    {
      id: "F-04",
      side: "for",
      title: "GBP debited matches every receipt",
      detail: "Three card lines on Visa ****8830. Paid at GBP debited.",
      agent: "baggage",
      clauses: ["GC.5", "CHG 7.1.1"],
      cites: [
        { doc: "E06", quote: "FARMACIA DIAGONAL BARCELONA ES" },
        { doc: "E06", quote: "ROBA GRACIA BARCELONA ES" },
        { doc: "E06", quote: "ELECTRORAMBLA BARCELONA ES" },
      ],
    },
    {
      id: "F-05",
      side: "for",
      title: "No fraud indicators",
      detail: "Score 0. Green.",
      agent: "consistency",
      clauses: ["FRD-03"],
      cites: [{ doc: "CF", quote: "71224508" }],
    },
  ],

  lines: [
    { line: 1, section: "E", description: "Toiletries, Farmàcia Diagonal", date: "2 Oct", claimed: "EUR 27.35", claimedGbp: 23.46, outcome: "PAY", payable: 23.46, clauses: ["E.1", "2.5"], evidence: ["E01", "E02", "E03", "E06"], reason: "Inside window. GBP debited." },
    { line: 2, section: "E", description: "Clothing, Roba Gràcia", date: "2 Oct", claimed: "EUR 64.80", claimedGbp: 55.58, outcome: "PAY", payable: 55.58, clauses: ["E.1", "2.5"], evidence: ["E04", "E06"], reason: "Basic clothing." },
    { line: 3, section: "E", description: "USB-C charger, ElectroRambla", date: "2 Oct", claimed: "EUR 22.99", claimedGbp: 19.72, outcome: "PAY", payable: 19.72, clauses: ["E.1", "2.5"], evidence: ["E05", "E06"], reason: "Charger listed as essential." },
  ],

  sections: [{ section: "E · Delayed baggage", eligible: 98.76, limit: "£300", excess: 0, net: 98.76 }],

  authority: [
    { id: "P1", rule: "Net ≤ £1,000", pass: true, note: "£98.76" },
    { id: "P2", rule: "Policy active, paid, in period", pass: true, note: "In period" },
    { id: "P3", rule: "Named insured, notified ≤ 31 days", pass: true, note: "2 days" },
    { id: "P4", rule: "Wording from Certificate", pass: true, note: "TRV-2026 v1" },
    { id: "P5", rule: "Mandatory evidence present", pass: true, note: "PIR, delivery, receipts" },
    { id: "P6", rule: "Fraud score < 40", pass: true, note: "0, Green" },
    { id: "P7", rule: "No in-patient, H or I", pass: true, note: "Section E only" },
    { id: "P8", rule: "Verified payee, unchanged 14 days", pass: true, note: "…4508 since 2025" },
    { id: "P9", rule: "Every line cites clause and doc", pass: true, note: "3 of 3" },
    { id: "P10", rule: "Partial declines meet §4", pass: true, note: "None" },
  ],

  fraud: [
    { id: "F1", label: "Policy bought ≤ 7 days before departure", weight: 20, triggered: false, note: "21 days" },
    { id: "F4", label: "Duplicate receipt", weight: 10, triggered: false, note: "None" },
    { id: "F7", label: "Receipts lack tax ID", weight: 10, triggered: false, note: "All have NIF" },
    { id: "F9", label: "Bank details differ from payee on file", weight: 25, triggered: false, note: "Match" },
    { id: "F10", label: "Claimed > receipts by 20%", weight: 10, triggered: false, note: "Exact" },
  ],

  payment: {
    id: "po_1QBa9xLk4833hJkL5mNp",
    amount: 98.76,
    status: "succeeded",
    payee: "Ms P Raman",
    payeeToken: "payee_tok_2b71d05c88",
    account: "•••• 4508",
    reference: "LARKSPUR CLM-2026-004833",
    idempotencyKey: "CLM-2026-004833-v1",
    created: "Oct 12, 2026, 07:14",
    approvedBy: "Agent (T0)",
  },

  logs: [
    { id: "evt_01", type: "payout.paid", detail: "£98.76 to •••• 4508", actor: "stripe", at: "Oct 12, 07:14" },
    { id: "evt_02", type: "payout.created", detail: "po_1QBa9xLk4833hJkL5mNp · idem CLM-2026-004833-v1", actor: "agent.payment", at: "Oct 12, 07:14" },
    { id: "evt_03", type: "authority.passed", detail: "T0 · P1–P10 pass", actor: "agent.decision", at: "Oct 12, 07:13" },
    { id: "evt_04", type: "evidence_pack.created", detail: "3 lines · 5 findings · 11 citations", actor: "agent.orchestrator", at: "Oct 12, 07:13" },
    { id: "evt_05", type: "triage.started", detail: "9 agents scheduled", actor: "agent.orchestrator", at: "Oct 12, 07:12" },
    { id: "evt_06", type: "claim.created", detail: "App · 6 attachments", actor: "claimant", at: "Oct 11, 19:02" },
  ],

  why: [
    {
      q: "Why did you pay £98.76?",
      a: "The bag arrived 22h 33m after the flight landed, over the 12 hour threshold in E.1. All three purchases are essential items under definition 2.5 and were made inside the delay window. Each is paid at the GBP amount debited on the card statement (GC.5). Net is under the £1,000 T0 limit and P1–P10 all pass.",
      cites: [
        { doc: "E01", quote: "09:42" },
        { doc: "E02", quote: "03 OCT 2026 08:15 (local)" },
        { doc: "E06", quote: "ROBA GRACIA BARCELONA ES" },
      ],
      clauses: ["E.1", "2.5", "GC.5", "SAP P1"],
    },
  ],

  agents: [
    {
      id: "orch",
      name: "Orchestrator",
      kind: "orchestrator",
      model: "claude-opus-5-5",
      start: 0,
      duration: s(97),
      tokensIn: 7240,
      tokensOut: 1120,
      docs: [],
      clauses: [],
      steps: [
        { t: s(0.2), type: "memory", label: "Loaded claim graph clm_1QBa7mLk4833PrRmn", detail: "8 documents · 3 claimed lines · 1 head of claim" },
        { t: s(0.8), type: "spawn", label: "Spawned Intake & coverage, Document router" },
        { t: s(9.6), type: "spawn", label: "Spawned 2 evidence extractors" },
        { t: s(31.0), type: "spawn", label: "Spawned Delayed baggage (E), Consistency & fraud" },
        { t: s(62.4), type: "spawn", label: "Spawned Settlement calculator" },
        { t: s(67.0), type: "spawn", label: "Spawned Decision & authority" },
        { t: s(85.2), type: "spawn", label: "Spawned Payment" },
        { t: s(96.8), type: "decision", label: "Run complete", detail: "Paid £98.76", result: "pass" },
      ],
      output: { evidence_pack: "ep_4833_v1", findings: 5, citations: 11, outcome: "SETTLE", net_gbp: 98.76 },
    },
    {
      id: "intake",
      name: "Intake & coverage",
      kind: "intake",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(0.9),
      duration: s(14),
      tokensIn: 6110,
      tokensOut: 540,
      docs: ["CF", "CERT"],
      clauses: ["§1", "GC.1"],
      steps: [
        { t: s(1.5), type: "read", label: "Read claim form", cite: { doc: "CF", quote: "LRK-TRV-26-0074410" } },
        { t: s(4.0), type: "read", label: "Read certificate", cite: { doc: "CERT", quote: "TRV-2026 v1" } },
        { t: s(8.2), type: "check", label: "Incident date inside period", clause: "SAP P2", result: "pass", cite: { doc: "CERT", quote: "2 October 2026 00:01 to 9 October 2026 23:59 (UK time)" } },
        { t: s(11.0), type: "check", label: "Notified 2 days after return", clause: "GC.1", result: "pass", cite: { doc: "CF", quote: "2026-10-11 19:02:41 UTC" } },
        { t: s(14.4), type: "finding", label: "Wrote F-01", finding: "F-01" },
      ],
      output: { wording: "TRV-2026 v1", cover_level: "SILVER", in_period: true, notified_days: 2 },
    },
    {
      id: "router",
      name: "Document router",
      kind: "router",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(1.0),
      duration: s(8.4),
      tokensIn: 5020,
      tokensOut: 310,
      docs: ["E06"],
      clauses: [],
      steps: [
        { t: s(1.6), type: "tool", label: "classify_documents(8)" },
        { t: s(6.0), type: "extract", label: "E06 line 4 not claimed, noise", cite: { doc: "E06", quote: "SAGRADA FAMILIA TICKETS ES" } },
        { t: s(9.2), type: "handoff", label: "Routing table returned", detail: "E → E01 E02 E03 E04 E05 E06" },
      ],
      output: { relevant: 7, noise: ["E06:line 4"] },
    },
    {
      id: "x-air",
      name: "Extractor · E01–E02 airline",
      kind: "extractor",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(9.8),
      duration: s(15),
      tokensIn: 2400,
      tokensOut: 260,
      docs: ["E01", "E02"],
      clauses: [],
      steps: [
        { t: s(10.4), type: "extract", label: "actual_arrival = 2026-10-02 09:42", cite: { doc: "E01", quote: "09:42" } },
        { t: s(17.9), type: "extract", label: "bag_returned = 2026-10-03 08:15", cite: { doc: "E02", quote: "03 OCT 2026 08:15 (local)" } },
        { t: s(24.5), type: "memory", label: "Wrote 2 facts to claim graph" },
      ],
      output: { actual_arrival: "2026-10-02T09:42", bag_returned: "2026-10-03T08:15", delay_hours: 22.55 },
    },
    {
      id: "x-rcpt",
      name: "Extractor · E03–E06 receipts",
      kind: "extractor",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(10.0),
      duration: s(20),
      tokensIn: 3310,
      tokensOut: 420,
      docs: ["E03", "E04", "E05", "E06"],
      clauses: [],
      steps: [
        { t: s(10.8), type: "extract", label: "E03 FD-0021-88412 · 02/10 13:18 · €27.35", cite: { doc: "E03", quote: "FACTURA SIMPLIFICADA  FD-0021-88412" } },
        { t: s(15.0), type: "extract", label: "E04 RG 7781-1002 · 02/10 14:05 · €64.80", cite: { doc: "E04", quote: "TIQUET  RG 7781-1002" } },
        { t: s(19.4), type: "extract", label: "E05 ER-2026-31877 · 02/10 16:47 · €22.99", cite: { doc: "E05", quote: "Doc: ER-2026-31877" } },
        { t: s(25.1), type: "extract", label: "E06 matched 3 card lines", cite: { doc: "E06", quote: "FARMACIA DIAGONAL BARCELONA ES" } },
        { t: s(29.6), type: "memory", label: "Wrote 3 receipts to claim graph" },
      ],
      output: { receipts: 3, card_lines_matched: 3 },
    },
    {
      id: "baggage",
      name: "Delayed baggage (E)",
      kind: "section",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(31.2),
      duration: s(29),
      tokensIn: 7930,
      tokensOut: 980,
      docs: ["E01", "E02", "E03", "E04", "E05", "E06"],
      clauses: ["E.1", "2.5", "CHG 8.1"],
      steps: [
        { t: s(32.0), type: "retrieve", label: "Retrieved Section E, def. 2.5, CHG 8.1", cite: { doc: "POL", quote: "If your baggage is delayed on your outbound journey for more than 12 hours" } },
        { t: s(36.3), type: "check", label: "Delay 22h 33m > 12h", clause: "E.1", result: "pass", cite: { doc: "E02", quote: "03 OCT 2026 08:15 (local)" } },
        { t: s(42.0), type: "check", label: "Line 1 13:18 inside window", result: "pass", cite: { doc: "E03", quote: "02/10/2026            13:18" } },
        { t: s(45.6), type: "check", label: "Line 2 14:05 inside window", result: "pass", cite: { doc: "E04", quote: "02-10-2026  14:05   CAIXA 1" } },
        { t: s(49.1), type: "check", label: "Line 3 16:47 inside window", result: "pass", cite: { doc: "E05", quote: "02/10/2026                       16:47" } },
        { t: s(53.8), type: "tool", label: "gbp_debited(E06, lines 1–3) → 98.76" },
        { t: s(58.0), type: "finding", label: "Wrote F-02, F-03, F-04", finding: "F-03" },
        { t: s(60.0), type: "handoff", label: "Section E: £98.76 eligible" },
      ],
      output: { section: "E", eligible_gbp: 98.76, declined_lines: [], limit_gbp: 300 },
    },
    {
      id: "consistency",
      name: "Consistency & fraud",
      kind: "consistency",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(31.6),
      duration: s(26),
      tokensIn: 6880,
      tokensOut: 610,
      docs: ["CF", "E03", "E04", "E05", "E06"],
      clauses: ["FRD-03"],
      steps: [
        { t: s(33.0), type: "memory", label: "Queried claim graph for shared receipt numbers" },
        { t: s(38.5), type: "check", label: "No duplicate receipts", clause: "F4", result: "pass" },
        { t: s(44.2), type: "check", label: "Claimed equals receipts", clause: "F10", result: "pass" },
        { t: s(50.0), type: "check", label: "Bank details match payee on file", clause: "F9", result: "pass", cite: { doc: "CF", quote: "71224508" } },
        { t: s(56.1), type: "decision", label: "Score 0 · Green", result: "pass" },
        { t: s(57.2), type: "finding", label: "Wrote F-05", finding: "F-05" },
      ],
      output: { score: 0, band: "Green", triggered: [] },
    },
    {
      id: "calc",
      name: "Settlement calculator",
      kind: "calculator",
      parent: "orch",
      model: "deterministic",
      start: s(62.5),
      duration: s(4),
      tokensIn: 0,
      tokensOut: 0,
      docs: [],
      clauses: ["CHG 7.5"],
      steps: [
        { t: s(63.0), type: "tool", label: "apply_limits(E: 98.76 ≤ 300)" },
        { t: s(66.2), type: "tool", label: "sum → £98.76" },
      ],
      output: { E: 98.76, net_gbp: 98.76 },
    },
    {
      id: "decision",
      name: "Decision & authority",
      kind: "decision",
      parent: "orch",
      model: "claude-opus-5-5",
      start: s(67.1),
      duration: s(18),
      tokensIn: 5120,
      tokensOut: 870,
      docs: ["SAP"],
      clauses: ["SAP-01 §3"],
      steps: [
        { t: s(67.8), type: "read", label: "Read Evidence Pack ep_4833_v1" },
        { t: s(71.0), type: "check", label: "P1 net £98.76 ≤ £1,000", clause: "P1", result: "pass", cite: { doc: "SAP", quote: "Net settlement amount ≤ £1,000." } },
        { t: s(76.4), type: "check", label: "P2–P10", result: "pass" },
        { t: s(81.9), type: "decision", label: "SETTLE £98.76 at T0", result: "pass" },
        { t: s(85.0), type: "handoff", label: "Payment instruction issued" },
      ],
      output: { decision: "SETTLE", tier: "T0", net_gbp: 98.76, human_required: false },
    },
    {
      id: "payment",
      name: "Payment",
      kind: "payment",
      parent: "orch",
      model: "stripe-api",
      start: s(85.3),
      duration: s(11),
      tokensIn: 0,
      tokensOut: 0,
      docs: [],
      clauses: ["SAP P8"],
      steps: [
        { t: s(86.0), type: "check", label: "Payee token resolves to •••• 4508", result: "pass" },
        { t: s(89.4), type: "tool", label: "POST /v1/payouts", detail: "amount=9876 currency=gbp idempotency_key=CLM-2026-004833-v1" },
        { t: s(92.0), type: "tool", label: "200 OK · po_1QBa9xLk4833hJkL5mNp" },
        { t: s(96.0), type: "decision", label: "payout.paid", result: "pass" },
      ],
      output: { id: "po_1QBa9xLk4833hJkL5mNp", amount: 9876, currency: "gbp", status: "paid", livemode: false },
    },
  ],
};
