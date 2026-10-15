import type { Claim, RawDoc } from "../../types";

const s = (sec: number) => Math.round(sec * 1000);

const docs: RawDoc[] = [
  {
    id: "CF",
    name: "00_claim_form.pdf",
    title: "Claim form",
    kind: "form",
    text: `# STRYPE ASSURANCE — ONLINE CLAIM FORM

**Claim reference:** CLM-2026-004861
**Submitted:** 2026-10-15 08:51:12 UTC · Channel: app
**Policy number:** STR-TRV-26-0075127

## 1. Claimant

| Field | Detail |
|---|---|
| Name | Marcus Bell |
| Email | marcus.bell@example.com |
| Phone | +44 7700 900582 |

## 2. Trip

| Field | Detail |
|---|---|
| Destination | Vienna, Austria |
| Departed UK | 2026-10-10 |
| Returned UK | 2026-10-14 |
| Travelling with | Alone |

## 3. What you are claiming for

### Medical expenses — incident date 2026-10-11

I slipped getting off a tram at Schwedenplatz and broke my left wrist. I went to A&E, had it set and put in a cast, and went back two days later for a check. I also took taxis and bought painkillers and a sling.

| Line | Description | Date | Amount | Receipt |
|---|---|---|---|---|
| 1 | Hospital A&E, X-ray, reduction and cast (Klinik Donaustadt) | 2026-10-11 | EUR 1,230.00 | KD-AMB-2026-77410 |
| 2 | Fracture clinic follow-up (Klinik Donaustadt) | 2026-10-13 | EUR 210.00 | KD-AMB-2026-78022 |
| 3 | Painkillers and arm sling (Apotheke am Schwedenplatz) | 2026-10-11 | EUR 38.60 | AS-114-0921 |
| 4 | Taxi to hospital | 2026-10-11 | EUR 24.50 | Taxi 1 |
| 5 | Taxi to fracture clinic and back | 2026-10-13 | EUR 19.80 | Taxi 2 |
| 6 | Taxi to airport | 2026-10-14 | EUR 48.00 | Taxi 3 |

## 4. Other information

**Total claimed (estimate):** GBP 1,343.12
**Other insurance:** No
**GHIC used:** No

## 5. Payment details

| Field | Detail |
|---|---|
| Account name | Mr M Bell |
| Sort code | 60-83-71 |
| Account number | 20581136 |

## 6. Declaration

I declare that the information I have given is true and complete to the best of my knowledge.

Signed: Marcus Bell · 2026-10-15 08:50:58 UTC`,
  },
  {
    id: "CERT",
    name: "STR-TRV-26-0075127_certificate.pdf",
    title: "Certificate of insurance",
    kind: "policy",
    text: `# STRYPE ASSURANCE LTD — CERTIFICATE OF INSURANCE

**Travel Insurance — Single Trip**

| Field | Value |
|---|---|
| Policy number | STR-TRV-26-0075127 |
| Policyholder | Mr Marcus Bell |
| Date of issue | 30 September 2026 |
| Cover level | **Gold** |
| Destination area | Area 1 — Europe (declared destination: Austria) |
| Trip dates | 10 October 2026 to 14 October 2026 (inclusive) |
| Period of insurance — all other sections | 10 October 2026 00:01 to 14 October 2026 23:59 (UK time) |
| Policy wording reference | **TRV-2026 v1** |
| Optional extensions purchased | **None** |
| Premium | £24.60 — paid 30/09/2026 |

## Insured persons

| # | Name | Date of birth | Relationship |
|---|---|---|---|
| 1 | Marcus Bell | 08/11/1987 | Policyholder |

## Medical declaration

No conditions declared.

## Excesses applicable (Gold)

Emergency medical £50 · Personal belongings £50 · Delayed baggage nil

*Strype Assurance Ltd is a fictional company. All persons and details in this document are fictitious.*`,
  },
  {
    id: "E01",
    name: "E01_hospital_invoices.pdf",
    title: "Hospital invoices",
    kind: "document",
    text: `# KLINIK DONAUSTADT — UNFALLAMBULANZ

Langobardenstraße 122, 1220 Wien · UID ATU 000 41 772

## RECHNUNG / INVOICE  KD-AMB-2026-77410

**Patient:** BELL, Marcus · 08.11.1987 · UK passport
**Datum / Date:** 11.10.2026 · 15:02
**Status:** Privatpatient (no EHIC/GHIC presented)

| Code | Leistung / Service | EUR |
|---|---|---|
| AMB-01 | Notfallambulanz Erstversorgung / A&E assessment | 290.00 |
| RX-HG2 | Röntgen Handgelenk links, 2 Ebenen / X-ray left wrist | 180.00 |
| REP-07 | Geschlossene Reposition distaler Radius / Closed reduction | 520.00 |
| GIPS-2 | Unterarmgips / Forearm cast | 240.00 |
| | **Total** | **1,230.00** |

Bezahlt / Paid: Mastercard ****6620 · 11.10.2026

---

## RECHNUNG / INVOICE  KD-AMB-2026-78022

**Datum / Date:** 13.10.2026 · 10:40

| Code | Leistung / Service | EUR |
|---|---|---|
| KON-FU | Kontrolle Fraktur, Röntgen / Fracture clinic check with X-ray | 210.00 |
| | **Total** | **210.00** |

Bezahlt / Paid: Mastercard ****6620 · 13.10.2026

*Synthetic test document.*`,
  },
  {
    id: "E02",
    name: "E02_medical_report.pdf",
    title: "Medical report",
    kind: "document",
    text: `# KLINIK DONAUSTADT — ARZTBRIEF / MEDICAL REPORT

**Patient:** Marcus BELL · 08.11.1987
**Date:** 11.10.2026

**History:** Fall from tram step at approx. 13:40 today, landed on outstretched left hand.

**Findings:** Swelling and deformity of the left wrist. X-ray: displaced distal radius fracture (Colles type), no intra-articular extension.

**Diagnosis:** Distal radius fracture, left (S52.5).

**Treatment:** Closed reduction under haematoma block. Below-elbow cast applied. Analgesia and sling advised. Out-patient. Not admitted.

**Follow-up:** Check X-ray in fracture clinic in 48 hours to confirm position is held. Fit to fly in cast on 14.10.2026.

Dr. Lena Hofer, Unfallchirurgie

*Synthetic test document.*`,
  },
  {
    id: "E03",
    name: "E03_receipt_apotheke_11oct.txt",
    title: "Receipt Apotheke am Schwedenplatz 11 Oct",
    kind: "receipt",
    text: `   APOTHEKE AM SCHWEDENPLATZ
   Franz-Josefs-Kai 21, 1010 Wien
        UID ATU 000 88 104
-------------------------------------
Beleg Nr. AS-114-0921
11.10.2026                    16:31
-------------------------------------
Ibuprofen 400mg 20 Stk    1   6.90
Paracetamol 500mg 20 Stk  1   3.70
Armschlinge Universal     1  28.00
-------------------------------------
SUMME EUR                    38.60
-------------------------------------
Mastercard ****6620`,
  },
  {
    id: "E04",
    name: "E04_taxi_receipts.txt",
    title: "Taxi receipts",
    kind: "receipt",
    text: `### TAXI 1 ###
TAXI 40100 WIEN
11.10.2026  14:02 - 14:26
Schwedenplatz -> Klinik Donaustadt
EUR 24.50   Mastercard ****6620

### TAXI 2 ###
TAXI 40100 WIEN
13.10.2026  10:05 - 11:20 (wait)
Hotel Josefstadt -> Klinik Donaustadt -> Hotel
EUR 19.80   Mastercard ****6620

### TAXI 3 ###
TAXI 31300 WIEN
14.10.2026  06:10 - 06:44
Hotel Josefstadt -> Flughafen Wien (VIE)
EUR 48.00   Mastercard ****6620`,
  },
  {
    id: "E05",
    name: "E05_card_statement_extract.pdf",
    title: "Card statement extract",
    kind: "document",
    text: `# NORTHGATE BANK — Mastercard

**Cardholder:** MR M BELL
**Card:** Mastercard ****6620

| Txn date | Description | Original amount | GBP debited |
|---|---|---|---|
| 11 Oct | TAXI 40100 WIEN AT | EUR 24.50 | £20.95 |
| 11 Oct | KLINIK DONAUSTADT WIEN AT | EUR 1,230.00 | £1,051.65 |
| 11 Oct | APOTHEKE AM SCHWEDENPLATZ AT | EUR 38.60 | £33.00 |
| 13 Oct | TAXI 40100 WIEN AT | EUR 19.80 | £16.93 |
| 13 Oct | KLINIK DONAUSTADT WIEN AT | EUR 210.00 | £179.55 |
| 14 Oct | TAXI 31300 WIEN AT | EUR 48.00 | £41.04 |

*Northgate Bank is a fictional bank. Synthetic test document.*`,
  },
];

export const c004861: Claim = {
  id: "CLM-2026-004861",
  apiId: "clm_1QCn4wLk4861MrBll",
  claimant: "Marcus Bell",
  email: "marcus.bell@example.com",
  policy: "STR-TRV-26-0075127",
  product: "Travel · Single trip",
  cover: "Gold",
  wording: "TRV-2026 v1",
  heads: ["Medical"],
  destination: "Vienna, AT",
  tripDates: "10–14 Oct 2026",
  lossDate: "Oct 11, 2026",
  reported: "Oct 15, 2026",
  status: "needs_review",
  claimed: 1343.12,
  net: 1252.08,
  route: "human",
  tier: "T1",
  recommendation: "SETTLE_PARTIAL",
  summary:
    "Wrist fracture in Vienna, out-patient. Treatment, pharmacy and taxis to and from hospital are covered. Airport taxi is not local travel to treatment. Net £1,252.08 is over the £1,000 agent limit, so a T1 handler approves payment.",
  fraudScore: 0,
  fraudBand: "Green",
  documents: docs,
  runLength: s(84),

  findings: [
    {
      id: "F-01",
      side: "for",
      title: "Policy in force, notified next day",
      detail: "Gold, TRV-2026 v1. Injury 11 Oct inside period.",
      agent: "intake",
      clauses: ["SAP P2", "GC.1"],
      cites: [
        { doc: "CERT", quote: "10 October 2026 00:01 to 14 October 2026 23:59 (UK time)" },
        { doc: "CF", quote: "2026-10-15 08:51:12 UTC" },
      ],
    },
    {
      id: "F-02",
      side: "for",
      title: "Fracture diagnosed and treated as out-patient",
      detail: "Distal radius fracture. Reduced and cast. Not admitted.",
      agent: "medical",
      lines: [1],
      clauses: ["C1.1"],
      cites: [
        { doc: "E02", quote: "Distal radius fracture, left (S52.5)." },
        { doc: "E02", quote: "Out-patient. Not admitted." },
      ],
    },
    {
      id: "F-03",
      side: "for",
      title: "Follow-up could not wait until return",
      detail: "Doctor ordered a check X-ray at 48 hours to confirm position. Return was day 3.",
      agent: "medical",
      lines: [2],
      clauses: ["C1.1", "C7.3"],
      cites: [{ doc: "E02", quote: "Check X-ray in fracture clinic in 48 hours to confirm position is held." }],
    },
    {
      id: "F-04",
      side: "for",
      title: "Pharmacy items all medical",
      detail: "Painkillers and sling, both advised by the doctor.",
      agent: "medical",
      lines: [3],
      clauses: ["C1.2"],
      cites: [
        { doc: "E02", quote: "Analgesia and sling advised." },
        { doc: "E03", quote: "Armschlinge Universal     1  28.00" },
      ],
    },
    {
      id: "F-05",
      side: "for",
      title: "Taxis to and from treatment",
      detail: "£37.88 total, under the £150 Gold C3 sub-limit.",
      agent: "medical",
      lines: [4, 5],
      impact: "£37.88",
      clauses: ["C3"],
      cites: [
        { doc: "E04", quote: "Schwedenplatz -> Klinik Donaustadt" },
        { doc: "E04", quote: "Hotel Josefstadt -> Klinik Donaustadt -> Hotel" },
      ],
    },
    {
      id: "A-01",
      side: "against",
      title: "Airport taxi is not travel to treatment",
      detail: "C3 covers travel to and from the place of treatment only.",
      agent: "medical",
      lines: [6],
      impact: "−£41.04",
      clauses: ["C3"],
      cites: [
        { doc: "E04", quote: "Hotel Josefstadt -> Flughafen Wien (VIE)" },
        { doc: "POL", quote: "Reasonable taxi or public transport costs to and from the place of treatment" },
      ],
    },
    {
      id: "A-02",
      side: "against",
      title: "Medical excess applies",
      detail: "Private patient, GHIC not used. £50 Gold excess not waived.",
      agent: "medical",
      impact: "−£50.00",
      clauses: ["C5", "C6"],
      cites: [{ doc: "E01", quote: "Privatpatient (no EHIC/GHIC presented)" }],
    },
    {
      id: "R-01",
      side: "flag",
      title: "Net over agent limit",
      detail: "£1,252.08 is above £1,000. Agent cannot pay. Needs T1 approval.",
      agent: "decision",
      clauses: ["SAP P1"],
      cites: [{ doc: "SAP", quote: "Net settlement amount ≤ £1,000." }],
    },
  ],

  lines: [
    { line: 1, section: "C", description: "A&E, X-ray, reduction, cast", date: "11 Oct", claimed: "EUR 1,230.00", claimedGbp: 1051.65, outcome: "PAY", payable: 1051.65, clauses: ["C1.1", "GC.5"], evidence: ["E01", "E02", "E05"], reason: "Emergency treatment. GBP debited." },
    { line: 2, section: "C", description: "Fracture clinic follow-up", date: "13 Oct", claimed: "EUR 210.00", claimedGbp: 179.55, outcome: "PAY", payable: 179.55, clauses: ["C1.1", "C7.3"], evidence: ["E01", "E02", "E05"], reason: "Ordered at 48h. Could not wait." },
    { line: 3, section: "C", description: "Painkillers and sling", date: "11 Oct", claimed: "EUR 38.60", claimedGbp: 33.0, outcome: "PAY", payable: 33.0, clauses: ["C1.2"], evidence: ["E02", "E03", "E05"], reason: "Advised by doctor." },
    { line: 4, section: "C", description: "Taxi to hospital", date: "11 Oct", claimed: "EUR 24.50", claimedGbp: 20.95, outcome: "PAY", payable: 20.95, clauses: ["C3"], evidence: ["E04", "E05"], reason: "To treatment." },
    { line: 5, section: "C", description: "Taxi to fracture clinic and back", date: "13 Oct", claimed: "EUR 19.80", claimedGbp: 16.93, outcome: "PAY", payable: 16.93, clauses: ["C3"], evidence: ["E04", "E05"], reason: "To and from treatment." },
    { line: 6, section: "C", description: "Taxi to airport", date: "14 Oct", claimed: "EUR 48.00", claimedGbp: 41.04, outcome: "DECLINE", payable: 0, clauses: ["C3"], evidence: ["E04"], reason: "Not travel to treatment." },
  ],

  sections: [{ section: "C · Medical", eligible: 1302.08, limit: "C3 £150", excess: 50, net: 1252.08 }],

  authority: [
    { id: "P1", rule: "Net ≤ £1,000", pass: false, note: "£1,252.08" },
    { id: "P2", rule: "Policy active, paid, in period", pass: true, note: "In period" },
    { id: "P3", rule: "Named insured, notified ≤ 31 days", pass: true, note: "1 day" },
    { id: "P4", rule: "Wording from Certificate", pass: true, note: "TRV-2026 v1" },
    { id: "P5", rule: "Mandatory evidence present", pass: true, note: "Invoices, report, receipts" },
    { id: "P6", rule: "Fraud score < 40", pass: true, note: "0, Green" },
    { id: "P7", rule: "No in-patient, H or I", pass: true, note: "Not admitted" },
    { id: "P8", rule: "Verified payee, unchanged 14 days", pass: true, note: "…1136" },
    { id: "P9", rule: "Every line cites clause and doc", pass: true, note: "6 of 6" },
    { id: "P10", rule: "Partial declines meet §4", pass: true, note: "Line 6 objective" },
  ],

  fraud: [
    { id: "F1", label: "Policy bought ≤ 7 days before departure", weight: 20, triggered: false, note: "10 days" },
    { id: "F4", label: "Duplicate receipt", weight: 10, triggered: false, note: "None" },
    { id: "F9", label: "Bank details differ from payee on file", weight: 25, triggered: false, note: "Match" },
    { id: "F10", label: "Claimed > receipts by 20%", weight: 10, triggered: false, note: "Exact" },
    { id: "F11", label: "Unverifiable medical provider", weight: 20, triggered: false, note: "UID ATU 000 41 772" },
  ],

  payment: {
    id: "",
    amount: 1252.08,
    status: "not_created",
    payee: "Mr M Bell",
    payeeToken: "payee_tok_9d4e17b3a0",
    account: "•••• 1136",
    reference: "STRYPE CLM-2026-004861",
    idempotencyKey: "CLM-2026-004861-v1",
    approvedBy: "",
  },

  logs: [
    { id: "evt_05", type: "claim.referred", detail: "T1 · net £1,252.08 over T0 limit", actor: "agent.decision", at: "Oct 15, 08:54" },
    { id: "evt_04", type: "evidence_pack.created", detail: "6 lines · 8 findings · 13 citations", actor: "agent.orchestrator", at: "Oct 15, 08:54" },
    { id: "evt_03", type: "triage.started", detail: "9 agents scheduled", actor: "agent.orchestrator", at: "Oct 15, 08:52" },
    { id: "evt_02", type: "document.received", detail: "6 attachments", actor: "claimant", at: "Oct 15, 08:51" },
    { id: "evt_01", type: "claim.created", detail: "App", actor: "claimant", at: "Oct 15, 08:51" },
  ],

  why: [
    {
      q: "Why £1,252.08?",
      a: "Hospital, follow-up, pharmacy and two taxis to and from treatment are covered under C1 and C3, all at the GBP amount debited: £1,302.08. The airport taxi is not travel to treatment, so it is removed. The £50 Gold medical excess applies because GHIC was not used.",
      cites: [
        { doc: "E05", quote: "KLINIK DONAUSTADT WIEN AT" },
        { doc: "E04", quote: "Hotel Josefstadt -> Flughafen Wien (VIE)" },
        { doc: "E01", quote: "Privatpatient (no EHIC/GHIC presented)" },
      ],
      clauses: ["C1.1", "C1.2", "C3", "C5", "C6"],
    },
    {
      q: "Why does a person need to approve this?",
      a: "Net is £1,252.08. The agent may settle up to £1,000 net per claim (SAP-01 P1). Everything else passes, so a T1 handler can approve with one click.",
      cites: [{ doc: "SAP", quote: "Net settlement amount ≤ £1,000." }],
      clauses: ["SAP P1"],
    },
  ],

  agents: [
    {
      id: "orch",
      name: "Orchestrator",
      kind: "orchestrator",
      model: "claude-opus-5-5",
      start: 0,
      duration: s(84),
      tokensIn: 8120,
      tokensOut: 1390,
      docs: [],
      clauses: [],
      steps: [
        { t: s(0.3), type: "memory", label: "Loaded claim graph clm_1QCn4wLk4861MrBll", detail: "8 documents · 6 claimed lines · 1 head of claim" },
        { t: s(0.9), type: "spawn", label: "Spawned Intake & coverage, Document router" },
        { t: s(8.4), type: "spawn", label: "Spawned 3 evidence extractors" },
        { t: s(31.0), type: "spawn", label: "Spawned Medical (C), Consistency & fraud" },
        { t: s(62.2), type: "spawn", label: "Spawned Settlement calculator" },
        { t: s(66.5), type: "spawn", label: "Spawned Decision & authority" },
        { t: s(83.6), type: "decision", label: "Referred to T1", detail: "Recommend pay £1,252.08", result: "warn" },
      ],
      output: { evidence_pack: "ep_4861_v1", findings: 8, citations: 13, outcome: "REFER", recommendation: "SETTLE_PARTIAL", net_gbp: 1252.08 },
    },
    {
      id: "intake",
      name: "Intake & coverage",
      kind: "intake",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(1.0),
      duration: s(12),
      tokensIn: 5980,
      tokensOut: 520,
      docs: ["CF", "CERT"],
      clauses: ["§1", "GC.1"],
      steps: [
        { t: s(1.6), type: "read", label: "Read claim form", cite: { doc: "CF", quote: "STR-TRV-26-0075127" } },
        { t: s(3.9), type: "read", label: "Read certificate", cite: { doc: "CERT", quote: "TRV-2026 v1" } },
        { t: s(7.4), type: "check", label: "Incident 11 Oct inside period", clause: "SAP P2", result: "pass", cite: { doc: "CERT", quote: "10 October 2026 00:01 to 14 October 2026 23:59 (UK time)" } },
        { t: s(10.2), type: "check", label: "Notified 1 day after return", clause: "GC.1", result: "pass", cite: { doc: "CF", quote: "2026-10-15 08:51:12 UTC" } },
        { t: s(12.6), type: "finding", label: "Wrote F-01", finding: "F-01" },
      ],
      output: { wording: "TRV-2026 v1", cover_level: "GOLD", in_period: true, notified_days: 1 },
    },
    {
      id: "router",
      name: "Document router",
      kind: "router",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(1.1),
      duration: s(6.8),
      tokensIn: 4400,
      tokensOut: 240,
      docs: [],
      clauses: [],
      steps: [
        { t: s(1.7), type: "tool", label: "classify_documents(8)" },
        { t: s(7.6), type: "handoff", label: "Routing table returned", detail: "C → E01 E02 E03 E04 E05" },
      ],
      output: { relevant: 8, noise: [] },
    },
    {
      id: "x-hosp",
      name: "Extractor · E01–E02 hospital",
      kind: "extractor",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(8.6),
      duration: s(21),
      tokensIn: 3820,
      tokensOut: 470,
      docs: ["E01", "E02"],
      clauses: [],
      steps: [
        { t: s(9.3), type: "extract", label: "E01 invoice 77410 · €1,230.00 · private", cite: { doc: "E01", quote: "Privatpatient (no EHIC/GHIC presented)" } },
        { t: s(15.0), type: "extract", label: "E01 invoice 78022 · €210.00", cite: { doc: "E01", quote: "RECHNUNG / INVOICE  KD-AMB-2026-78022" } },
        { t: s(21.8), type: "extract", label: "E02 diagnosis, out-patient, 48h check", cite: { doc: "E02", quote: "Distal radius fracture, left (S52.5)." } },
        { t: s(29.2), type: "memory", label: "Wrote 7 facts to claim graph" },
      ],
      output: { invoices: 2, admitted: false, ghic_used: false },
    },
    {
      id: "x-rcpt",
      name: "Extractor · E03–E04 receipts",
      kind: "extractor",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(8.8),
      duration: s(17),
      tokensIn: 2210,
      tokensOut: 360,
      docs: ["E03", "E04"],
      clauses: [],
      steps: [
        { t: s(9.6), type: "extract", label: "E03 pharmacy €38.60 · 3 items", cite: { doc: "E03", quote: "Beleg Nr. AS-114-0921" } },
        { t: s(16.1), type: "extract", label: "E04 three taxi trips", cite: { doc: "E04", quote: "Schwedenplatz -> Klinik Donaustadt" } },
        { t: s(25.4), type: "memory", label: "Wrote 4 receipts to claim graph" },
      ],
      output: { receipts: 4 },
    },
    {
      id: "x-card",
      name: "Extractor · E05 card",
      kind: "extractor",
      parent: "orch",
      model: "claude-haiku-5-5",
      start: s(9.0),
      duration: s(13),
      tokensIn: 1630,
      tokensOut: 290,
      docs: ["E05"],
      clauses: [],
      steps: [
        { t: s(9.8), type: "extract", label: "Matched 6 card lines", cite: { doc: "E05", quote: "KLINIK DONAUSTADT WIEN AT" } },
        { t: s(21.6), type: "memory", label: "Wrote GBP debited for 6 transactions" },
      ],
      output: { card_lines_matched: 6 },
    },
    {
      id: "medical",
      name: "Medical (C)",
      kind: "section",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(31.2),
      duration: s(30),
      tokensIn: 9640,
      tokensOut: 1490,
      docs: ["E01", "E02", "E03", "E04", "E05"],
      clauses: ["C1", "C3", "C5", "C6", "C7.3"],
      steps: [
        { t: s(32.0), type: "retrieve", label: "Retrieved Section C, CHG 8.3", cite: { doc: "POL", quote: "emergency medical, surgical and hospital treatment and ambulance charges" } },
        { t: s(35.6), type: "check", label: "A&E and cast £1,051.65", clause: "C1.1", result: "pass", cite: { doc: "E02", quote: "Distal radius fracture, left (S52.5)." } },
        { t: s(39.9), type: "check", label: "Follow-up ordered at 48h", clause: "C7.3", result: "pass", cite: { doc: "E02", quote: "Check X-ray in fracture clinic in 48 hours to confirm position is held." } },
        { t: s(43.2), type: "check", label: "Pharmacy all medical", clause: "C1.2", result: "pass", cite: { doc: "E03", quote: "Armschlinge Universal     1  28.00" } },
        { t: s(46.8), type: "check", label: "Taxis 1 and 2 to treatment", clause: "C3", result: "pass", cite: { doc: "E04", quote: "Hotel Josefstadt -> Klinik Donaustadt -> Hotel" } },
        { t: s(50.1), type: "check", label: "Taxi 3 to airport", clause: "C3", result: "fail", cite: { doc: "E04", quote: "Hotel Josefstadt -> Flughafen Wien (VIE)" } },
        { t: s(53.5), type: "check", label: "GHIC not used, £50 excess applies", clause: "C6", result: "info", cite: { doc: "E01", quote: "Privatpatient (no EHIC/GHIC presented)" } },
        { t: s(57.0), type: "finding", label: "Wrote F-02 to F-05, A-01, A-02", finding: "F-02" },
        { t: s(61.0), type: "handoff", label: "Section C: £1,302.08 eligible, £50 excess" },
      ],
      output: { section: "C", eligible_gbp: 1302.08, excess_gbp: 50, net_gbp: 1252.08, declined_lines: [6] },
    },
    {
      id: "consistency",
      name: "Consistency & fraud",
      kind: "consistency",
      parent: "orch",
      model: "claude-sonnet-5-5",
      start: s(31.6),
      duration: s(24),
      tokensIn: 6010,
      tokensOut: 480,
      docs: ["CF", "E01", "E05"],
      clauses: ["FRD-03"],
      steps: [
        { t: s(33.0), type: "check", label: "Invoices match card lines", clause: "F10", result: "pass", cite: { doc: "E05", quote: "KLINIK DONAUSTADT WIEN AT" } },
        { t: s(40.8), type: "check", label: "Provider registered", clause: "F11", result: "pass", cite: { doc: "E01", quote: "Langobardenstraße 122, 1220 Wien · UID ATU 000 41 772" } },
        { t: s(48.0), type: "check", label: "Bank details match payee on file", clause: "F9", result: "pass", cite: { doc: "CF", quote: "20581136" } },
        { t: s(55.0), type: "decision", label: "Score 0 · Green", result: "pass" },
      ],
      output: { score: 0, band: "Green", triggered: [] },
    },
    {
      id: "calc",
      name: "Settlement calculator",
      kind: "calculator",
      parent: "orch",
      model: "deterministic",
      start: s(62.4),
      duration: s(4),
      tokensIn: 0,
      tokensOut: 0,
      docs: [],
      clauses: ["CHG 7.5", "C5"],
      steps: [
        { t: s(63.0), type: "tool", label: "apply_limits(C3: 37.88 ≤ 150)" },
        { t: s(64.6), type: "tool", label: "apply_excess(C: 1,302.08 − 50.00)" },
        { t: s(66.0), type: "tool", label: "sum → £1,252.08" },
      ],
      output: { C: 1252.08, net_gbp: 1252.08 },
    },
    {
      id: "decision",
      name: "Decision & authority",
      kind: "decision",
      parent: "orch",
      model: "claude-opus-5-5",
      start: s(66.6),
      duration: s(17),
      tokensIn: 5640,
      tokensOut: 990,
      docs: ["SAP"],
      clauses: ["SAP-01 §3"],
      steps: [
        { t: s(67.3), type: "read", label: "Read Evidence Pack ep_4861_v1" },
        { t: s(71.0), type: "check", label: "P1 net £1,252.08 > £1,000", clause: "P1", result: "fail", cite: { doc: "SAP", quote: "Net settlement amount ≤ £1,000." } },
        { t: s(75.4), type: "check", label: "P2–P10", result: "pass" },
        { t: s(79.8), type: "decision", label: "REFER to T1 · recommend pay £1,252.08", result: "warn" },
        { t: s(81.9), type: "finding", label: "Wrote R-01", finding: "R-01" },
        { t: s(83.4), type: "handoff", label: "Placed in review queue" },
      ],
      output: { decision: "REFER", tier: "T1", recommendation: "SETTLE_PARTIAL", net_gbp: 1252.08, human_required: true },
    },
  ],
};
