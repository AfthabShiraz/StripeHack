import type { Agent, Claim, Episode, TraceStep } from "../../types";
import { DOCS_004817 } from "../generated-docs";

const s = (sec: number) => Math.round(sec * 1000);

/** Index of the episode triggered from the demo (the original police report arriving). */
export const LIVE_EPISODE = 6;

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";

function agent(
  id: string,
  name: string,
  kind: Agent["kind"],
  start: number,
  duration: number,
  model: string,
  docs: string[],
  clauses: string[],
  steps: TraceStep[],
  output: Record<string, unknown>,
  tokens: [number, number] = [0, 0],
): Agent {
  return { id, name, kind, parent: kind === "orchestrator" ? undefined : "orch", model, start: s(start), duration: s(duration), tokensIn: tokens[0], tokensOut: tokens[1], docs, clauses, steps, output };
}

const st = (t: number, type: TraceStep["type"], label: string, extra: Partial<TraceStep> = {}): TraceStep => ({ t: s(t), type, label, ...extra });

const CUSTOMER = "Eleanor Whitcombe <eleanor.whitcombe@example.com>";
const CLAIMS = "Strype Claims <claims@strype-assurance.example>";

/* The live run, triggered when the original police report arrives. */
const LIVE_AGENTS: Agent[] = [
  agent("orch", "Orchestrator", "orchestrator", 0, 48, OPUS, [], ["SAP-01 §3"], [
    st(0.2, "memory", "Woke on inbound email from customer", { detail: "1 attachment · matches open request R1" }),
    st(0.6, "spawn", "Spawned Document router"),
    st(3.9, "spawn", "Spawned Evidence reader · E12"),
    st(15.6, "handoff", "Received 2 verbatim quotes from Evidence reader", { detail: "Quotes only. The orchestrator does not read the raw document." }),
    st(16.0, "memory", "cognee.search(claim=CLM-2026-004817, open_blockers)", { detail: "1 blocker: fraud screen F2, F3 need the original police report (CHG 5.2)" }),
    st(16.4, "spawn", "Spawned Personal belongings (D), Consistency & fraud"),
    st(29.8, "memory", "cognee.search(claim=CLM-2026-004817, undecided_lines)", { detail: "0 undecided · 12 of 12 lines decided" }),
    st(30.2, "decision", "Is the evidence enough to pay?", { detail: "Every line decided. Fraud screen complete at 30, under the 40 limit. No blockers left.", result: "pass" }),
    st(30.4, "spawn", "Spawned Settlement calculator, Decision & authority"),
    st(40.1, "spawn", "Spawned Payment"),
    st(45.9, "spawn", "Spawned Customer emails"),
    st(47.8, "decision", "Run complete", { detail: "Paid £390.20 · Amber QA flag", result: "pass" }),
  ], { evidence_pack: "ep_4817_v7", outcome: "SETTLE_PARTIAL", net_gbp: 390.2, blockers: 0 }, [9840, 1620]),

  agent("router", "Document router", "router", 0.7, 3.1, HAIKU, ["E12"], [], [
    st(0.9, "tool", "classify_documents(1)"),
    st(2.6, "extract", "E12 police report, Portuguese original, PSP Carcavelos", { cite: { doc: "E12", quote: "AUTO DE DENÚNCIA" } }),
    st(3.6, "handoff", "Fulfils request R1 · route to D and fraud"),
  ], { document: "E12", type: "police_report", language: "pt", fulfils: "R1" }, [2210, 140]),

  agent("reader", "Evidence reader · E12", "extractor", 4.0, 11.5, HAIKU, ["E12"], [], [
    st(4.4, "read", "Read E12 in the original Portuguese", { cite: { doc: "E12", quote: "Esquadra de Carcavelos" } }),
    st(7.2, "extract", "Quote: how the bag was left", { detail: "Copied character for character. Not translated, not summarised.", cite: { doc: "E12", quote: "deixou o seu saco de praia sobre a toalha, na areia, sem vigilância, enquanto nadava no mar" } }),
    st(9.6, "extract", "Quote: distance from the bag", { detail: "Copied character for character.", cite: { doc: "E12", quote: "a uma distância aproximada de 40 (quarenta) metros" } }),
    st(11.8, "extract", "Report made 15/09 16:45, incident 15:30–15:50", { cite: { doc: "E12", quote: "15/09/2026, 16:45" } }),
    st(13.4, "check", "Quotes match source spans exactly", { detail: "sha256 of each quote equals the source text at its offset", result: "pass" }),
    st(14.9, "memory", "Wrote 4 facts and 2 quotes to Cognee graph", { detail: "Edges: E12 → line 7, E12 ↔ E13 (conflict)" }),
    st(15.4, "handoff", "Quotes sent to orchestrator"),
  ], { quotes: 2, facts: 4, reported_within_24h: true, unattended: true, distance_m: 40 }, [3680, 410]),

  agent("belongings", "Personal belongings (D)", "section", 16.5, 9.5, SONNET, ["E12", "CERT"], ["D.4.4", "D.4.5", "2.12"], [
    st(16.9, "retrieve", "Retrieved D.4.5 and definition 2.12", { cite: { doc: "POL", quote: "Property left on a beach, at a poolside or in a public place while you are swimming, sleeping or otherwise away from it is unattended, regardless of distance." } }),
    st(20.1, "check", "Bag left unattended while swimming", { clause: "D.4.5", result: "fail", cite: { doc: "E12", quote: "deixou o seu saco de praia sobre a toalha, na areia, sem vigilância, enquanto nadava no mar" } }),
    st(23.0, "check", "Line 7 already declined under D.4.4. Second ground recorded.", { result: "info" }),
    st(24.6, "finding", "Wrote A-02", { finding: "A-02" }),
    st(25.8, "handoff", "Section D unchanged: £0.00"),
  ], { section: "D", grounds: ["D.4.4", "D.4.5"], change_gbp: 0 }, [5120, 690]),

  agent("consistency", "Consistency & fraud", "consistency", 16.7, 13, SONNET, ["E12", "E13", "CF"], ["FRD-03", "CHG 5.2"], [
    st(17.2, "memory", "cognee.search(conflicts_with=E12)", { detail: "E13 claimant translation, CF line 7 summary" }),
    st(19.8, "check", "Translation omits 'sem vigilância' and '40 metros'", { clause: "F2", result: "fail", cite: { doc: "E13", quote: "That she had her beach bag on the towel on the sand while she was swimming nearby in the sea with her partner for about 20 minutes." } }),
    st(23.4, "check", "Theft reported same day, 16:45", { clause: "F3", result: "pass", cite: { doc: "E12", quote: "15/09/2026, 16:45" } }),
    st(26.6, "decision", "Score 30 · Amber · under the 40 limit", { result: "warn" }),
    st(28.4, "finding", "Wrote R-01, F-08", { finding: "R-01" }),
    st(29.5, "handoff", "Fraud screen complete"),
  ], { score: 30, band: "Amber", triggered: ["F2", "F4", "F5"], complete: true }, [6840, 520]),

  agent("calc", "Settlement calculator", "calculator", 30.5, 2.3, "deterministic", [], ["CHG 7.5"], [
    st(30.8, "tool", "recompute(E, C, B2, D) → £390.20"),
    st(32.5, "handoff", "No change since 9 Oct"),
  ], { net_gbp: 390.2, changed: false }),

  agent("decision", "Decision & authority", "decision", 32.9, 7.0, OPUS, ["SAP"], ["SAP-01 §3", "SAP-01 §4"], [
    st(33.3, "read", "Read Evidence Pack ep_4817_v7", { detail: "Pack only. No raw documents." }),
    st(34.6, "check", "P1 net £390.20 ≤ £1,000", { clause: "P1", result: "pass", cite: { doc: "SAP", quote: "Net settlement amount ≤ £1,000." } }),
    st(36.0, "check", "P6 fraud score 30 < 40, QA flag", { clause: "P6", result: "pass", cite: { doc: "SAP", quote: "Fraud indicator score < 40 (FRD-03). Scores 25–39 may proceed but must be flagged for post-payment QA sampling." } }),
    st(37.4, "check", "P2–P5, P7–P10", { result: "pass" }),
    st(39.2, "decision", "SETTLE_PARTIAL £390.20 at T0, no person needed", { result: "pass" }),
  ], { decision: "SETTLE_PARTIAL", tier: "T0", net_gbp: 390.2, human_required: false, qa_sample: true }, [7310, 980]),

  agent("payment", "Payment", "payment", 40.2, 5.5, "stripe-api", ["ADM"], ["SAP P8"], [
    st(40.6, "check", "Payee token resolves to •••• 3092", { result: "pass", cite: { doc: "ADM", quote: "\"payee_token\": \"payee_tok_8f3c2a91e4\"" } }),
    st(42.0, "tool", "POST /v1/transfers", { detail: "amount=39020 currency=gbp destination=acct_1Q8vWhtcmb3092 idempotency_key=CLM-2026-004817-v1" }),
    st(43.6, "tool", "200 OK · tr_1QDx7rLk4817aBcD2eFg"),
    st(45.4, "decision", "transfer.paid", { result: "pass" }),
  ], { id: "tr_1QDx7rLk4817aBcD2eFg", object: "transfer", amount: 39020, currency: "gbp", livemode: false }),

  agent("comms", "Customer emails", "comms", 46.0, 1.8, SONNET, ["LTR"], ["LTR-02"], [
    st(46.3, "tool", "draft_letter(LTR-02)", { detail: "Explains each deduction. No mention of fraud score." }),
    st(47.6, "tool", "send_email(to=customer, subject=Your claim has been settled)"),
  ], { sent: "M9" }, [2410, 610]),
];

/* Episodes 0–5: two weeks of evidence arriving in pieces. */
const EPISODES: Episode[] = [
  {
    id: "ep0",
    at: "Oct 1, 08:47",
    trigger: "opened",
    label: "Claim opened · web form",
    docs: ["CF", "ST", "CERT", "ADM", "E04", "E06", "E07", "E13", "E14"],
    runLength: s(96),
    facts: 41,
    summary: "Read 9 documents. Phone declined, no Gadget extension. Duplicate receipt removed. Emailed the customer for 4 missing items.",
    stance: { reject: 0.2, partial: 0.5, full: 0.3, low: 0, high: 547.81, note: "Phone declined. Bag return time, medical and cruise evidence missing.", blocker: "4 items requested" },
    agents: [
      agent("orch", "Orchestrator", "orchestrator", 0, 96, OPUS, [], [], [
        st(0.2, "memory", "Created claim graph in Cognee", { detail: "Dataset clm_1Q8vR2Lk4817WhtCmb" }),
        st(0.8, "spawn", "Spawned Intake & coverage, Document router"),
        st(12.0, "spawn", "Spawned 2 evidence readers"),
        st(40.0, "spawn", "Spawned Delayed baggage (E), Personal belongings (D), Consistency & fraud"),
        st(82.5, "decision", "Can it decide yet?", { detail: "No. Lines 1–4, 6 and 8–12 have missing mandatory evidence (CHG §6).", result: "warn" }),
        st(83.0, "spawn", "Spawned Customer emails"),
        st(95.6, "decision", "Waiting on customer", { result: "info" }),
      ], { decided_lines: [5, 7], pending_lines: 10, requests: ["R1", "R2", "R3", "R4"] }, [11200, 1440]),
      agent("e0-intake", "Intake & coverage", "intake", 1, 22, SONNET, ["CF", "CERT", "ADM", "BRO"], ["GC.1", "CHG §4"], [
        st(1.6, "read", "Read claim form", { cite: { doc: "CF", quote: "STR-TRV-26-0071934" } }),
        st(4.2, "extract", "Wording TRV-2026 v1, Silver, no extensions", { cite: { doc: "CERT", quote: "Gadget extension: NOT purchased" } }),
        st(8.8, "check", "Incident dates inside period", { clause: "SAP P2", result: "pass", cite: { doc: "CERT", quote: "12 September 2026 00:01 to 19 September 2026 23:59 (UK time), or on return home if earlier" } }),
        st(11.5, "check", "Notified 12 days after return", { clause: "GC.1", result: "pass", cite: { doc: "CF", quote: "2026-10-01 08:47:19 UTC" } }),
        st(15.0, "check", "Payee matches verified account", { clause: "SAP P8", result: "pass", cite: { doc: "ADM", quote: "\"payee_token\": \"payee_tok_8f3c2a91e4\"" } }),
        st(18.2, "check", "Brochure not contractual", { clause: "CHG 4.3", result: "info", cite: { doc: "BRO", quote: "This brochure does not form part of your insurance contract." } }),
        st(21.6, "finding", "Wrote F-01, F-02, F-07, R-03", { finding: "F-01" }),
      ], { wording: "TRV-2026 v1", cover_level: "SILVER", insured: ["Eleanor Whitcombe"] }, [14200, 980]),
      agent("e0-router", "Document router", "router", 1.2, 10, HAIKU, [], [], [
        st(1.8, "tool", "classify_documents(9)"),
        st(10.6, "handoff", "E → E04 E06 E07 · D → E13 E14"),
      ], { relevant: 9 }, [8800, 300]),
      agent("e0-rcpt", "Evidence reader · E04, E06–E07", "extractor", 12.2, 20, HAIKU, ["E04", "E06", "E07"], [], [
        st(12.8, "extract", "actual_arrival = 12/09 13:06", { cite: { doc: "E04", quote: "13:06" } }),
        st(19.0, "extract", "E06 FE-2026-118734 · 15:52 · €38.40", { cite: { doc: "E06", quote: "FATURA-RECIBO  FE-2026-118734" } }),
        st(25.4, "extract", "E07 LTM 0045-221907 · 16:41 · €86.50", { cite: { doc: "E07", quote: "12-09-2026  16:41" } }),
        st(31.6, "memory", "Wrote 9 facts to Cognee graph"),
      ], { facts: 9 }, [3900, 520]),
      agent("e0-theft", "Evidence reader · E13–E14", "extractor", 12.4, 24, HAIKU, ["E13", "E14"], [], [
        st(13.0, "read", "E13 is the claimant's own translation", { cite: { doc: "E13", quote: "Translated by Eleanor Whitcombe using a translation app" }, result: "warn" }),
        st(22.0, "extract", "E14 iPhone bought 02/11/2024 · £699", { cite: { doc: "E14", quote: "02/11/2024 14:18" } }),
        st(35.8, "memory", "Wrote 6 facts to Cognee graph", { detail: "Flag: no original police report on file" }),
      ], { original_report: false }, [3100, 410]),
      agent("e0-baggage", "Delayed baggage (E)", "section", 40.2, 26, SONNET, ["E04", "E06", "E07"], ["E.1", "CHG 8.1.1", "CHG §6"], [
        st(41.0, "retrieve", "Retrieved Section E and CHG 8.1", { cite: { doc: "CHG", quote: "Compute the delay as actual arrival time (from the carrier/PIR) to baggage return time" } }),
        st(49.6, "check", "Bag return time not on file", { clause: "CHG 8.1.1", result: "warn", detail: "Cannot set the delay window. Lines 1–4 and 6 pending." }),
        st(65.0, "handoff", "Needs carrier delivery confirmation"),
      ], { pending_lines: [1, 2, 3, 4, 6], needs: "R2" }, [6200, 640]),
      agent("e0-belongings", "Personal belongings (D)", "section", 40.4, 22, SONNET, ["CERT", "E13", "E14"], ["D.4.4", "CHG 5.2"], [
        st(41.2, "check", "Gadget extension on Certificate", { clause: "D.4.4", result: "fail", cite: { doc: "CERT", quote: "Gadget extension: NOT purchased" } }),
        st(50.6, "check", "Original police report needed for the fraud screen", { clause: "CHG 5.2", result: "warn", cite: { doc: "CHG", quote: "Claimant-supplied translations are for convenience only." } }),
        st(60.4, "finding", "Wrote A-01", { finding: "A-01" }),
        st(61.8, "handoff", "Line 7 declined. Original report requested for F2, F3."),
      ], { declined_lines: [7], needs: "R1" }, [5900, 720]),
      agent("e0-consistency", "Consistency & fraud", "consistency", 40.6, 40, SONNET, ["CF", "E06"], ["FRD-03", "CHG 7.4"], [
        st(42.0, "memory", "cognee.search(shared receipt numbers)"),
        st(48.8, "check", "FE-2026-118734 on lines 1 and 5", { clause: "F4", result: "fail", cite: { doc: "CF", quote: "Pharmacy items - shampoo, toothbrush etc" } }),
        st(58.0, "check", "Gadget over £500", { clause: "F5", result: "warn", cite: { doc: "CF", quote: "Apple iPhone 15 128GB (replacement cost)" } }),
        st(70.4, "check", "F2, F3 cannot be scored without the original police report", { result: "warn" }),
        st(78.2, "finding", "Wrote A-04", { finding: "A-04" }),
        st(80.0, "handoff", "Fraud screen incomplete · 15 so far"),
      ], { score_so_far: 15, incomplete: ["F2", "F3"] }, [7700, 600]),
      agent("e0-comms", "Customer emails", "comms", 83.2, 12, SONNET, [], ["CHG §6"], [
        st(83.6, "memory", "cognee.search(missing mandatory evidence)", { detail: "4 items across D, E, C, B2" }),
        st(88.0, "tool", "draft_email(requests=R1, R2, R3, R4)", { detail: "Plain English. One line per item. No clause numbers." }),
        st(94.8, "tool", "send_email(to=customer)", { result: "pass" }),
      ], { sent: "M0", requests: ["R1", "R2", "R3", "R4"] }, [2900, 520]),
    ],
  },
  {
    id: "ep1",
    at: "Oct 2, 19:10",
    trigger: "evidence",
    label: "Customer replied · 6 attachments",
    docs: ["E05", "E01", "E02", "E08", "E09", "E10"],
    runLength: s(62),
    facts: 23,
    summary: "Bag delivered 13 Sep 19:20. Four purchases inside the window, jacket after it. Asked for a card statement.",
    stance: { reject: 0.12, partial: 0.66, full: 0.22, low: 205.14, high: 452.95, note: "Delayed baggage decided at £205.14. Medical and cruise evidence missing.", blocker: "3 items outstanding" },
    agents: [
      agent("orch", "Orchestrator", "orchestrator", 0, 62, OPUS, [], [], [
        st(0.2, "memory", "Woke on inbound email · 6 attachments", { detail: "Fulfils R2" }),
        st(0.7, "spawn", "Spawned Document router, 2 evidence readers"),
        st(24.0, "spawn", "Spawned Delayed baggage (E)"),
        st(52.2, "decision", "Can it decide yet?", { detail: "No. Medical, cruise and police report still missing.", result: "warn" }),
        st(52.6, "spawn", "Spawned Customer emails"),
        st(61.6, "decision", "Waiting on customer", { result: "info" }),
      ], { decided_lines: [1, 2, 3, 4, 5, 6, 7] }, [8400, 900]),
      agent("e1-router", "Document router", "router", 0.8, 5, HAIKU, [], [], [st(1.2, "tool", "classify_documents(6)"), st(5.4, "handoff", "E → E05 E08 E09 E10 · noise → E01 E02")], { relevant: 4, noise: ["E01", "E02"] }, [4100, 160]),
      agent("e1-air", "Evidence reader · E05", "extractor", 6.0, 12, HAIKU, ["E05"], [], [
        st(6.6, "extract", "bag_returned = 13/09 19:20", { cite: { doc: "E05", quote: "13 SEP 2026 19:20 (local)" } }),
        st(17.4, "memory", "Wrote 3 facts to Cognee graph"),
      ], { bag_returned: "2026-09-13T19:20" }, [1800, 220]),
      agent("e1-rcpt", "Evidence reader · E08–E10", "extractor", 6.2, 17, HAIKU, ["E08", "E09", "E10"], [], [
        st(7.0, "extract", "E08 · 13/09 10:58 · €84.90", { cite: { doc: "E08", quote: "Data: 13.09.2026  10:58" } }),
        st(11.8, "extract", "E09 · 13/09 12:26 · €29.99", { cite: { doc: "E09", quote: "13/09/2026                        12:26" } }),
        st(16.2, "extract", "E10 · 14/09 11:37 · €139.00", { cite: { doc: "E10", quote: "14/09/2026     11:37" } }),
        st(22.6, "memory", "Wrote 11 facts to Cognee graph"),
      ], { receipts: 3 }, [2600, 380]),
      agent("e1-baggage", "Delayed baggage (E)", "section", 24.2, 27, SONNET, ["E04", "E05", "E06", "E07", "E08", "E09", "E10"], ["E.1", "E.4.1", "2.5"], [
        st(25.0, "check", "Delay 30h 14m > 12h", { clause: "E.1", result: "pass", cite: { doc: "E05", quote: "13 SEP 2026 19:20 (local)" } }),
        st(31.2, "check", "Lines 1–4 inside the window", { result: "pass", cite: { doc: "E08", quote: "Data: 13.09.2026  10:58" } }),
        st(37.6, "check", "Line 6 bought after bag returned", { clause: "E.4.1", result: "fail", cite: { doc: "E10", quote: "14/09/2026     11:37" } }),
        st(42.0, "check", "Carrier offers interim expenses", { clause: "GC.4", result: "info", cite: { doc: "E04", quote: "You may submit reasonable interim expenses to Solent Airways Customer Relations within 21 days of receiving your bag." } }),
        st(48.8, "finding", "Wrote F-03, F-04, A-03, R-02", { finding: "F-04" }),
        st(50.8, "handoff", "Section E £205.14"),
      ], { section: "E", eligible_gbp: 205.14, declined_lines: [6] }, [7300, 1100]),
      agent("e1-comms", "Customer emails", "comms", 52.8, 8.5, SONNET, [], ["CHG 7.1.1"], [
        st(53.2, "tool", "draft_email(ack=6, requests=R5, still_open=R1, R3, R4)"),
        st(61.0, "tool", "send_email(to=customer)", { result: "pass" }),
      ], { sent: "M2", requests: ["R5"] }, [2100, 430]),
    ],
  },
  {
    id: "ep2",
    at: "Oct 5, 12:31",
    trigger: "evidence",
    label: "Customer replied · 4 attachments",
    docs: ["E15", "E16", "E17", "E18"],
    runLength: s(55),
    facts: 19,
    summary: "Ankle sprain certified. Clinic, gel, support and taxis covered. Sunscreen removed. £100 excess applies.",
    stance: { reject: 0.1, partial: 0.72, full: 0.18, low: 338.51, high: 441.89, note: "Medical decided at £133.37. Cruise evidence and police report missing.", blocker: "3 items outstanding" },
    agents: [
      agent("orch", "Orchestrator", "orchestrator", 0, 55, OPUS, [], [], [
        st(0.2, "memory", "Woke on inbound email · 4 attachments", { detail: "Fulfils R3" }),
        st(0.6, "spawn", "Spawned Document router, Evidence reader"),
        st(20.0, "spawn", "Spawned Medical (C)"),
        st(54.4, "decision", "Can it decide yet?", { detail: "No. Cruise evidence and police report missing.", result: "warn" }),
      ], { decided_lines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }, [6900, 700]),
      agent("e2-router", "Document router", "router", 0.7, 4, HAIKU, [], [], [st(1.0, "tool", "classify_documents(4)"), st(4.4, "handoff", "C → E15 E16 E17 E18")], { relevant: 4 }, [2700, 120]),
      agent("e2-med", "Evidence reader · E15–E18", "extractor", 5.0, 14, HAIKU, ["E15", "E16", "E17", "E18"], [], [
        st(5.6, "extract", "E15 private patient · €185.00", { cite: { doc: "E15", quote: "REGIME:   PARTICULAR (cartao GHIC/CESD nao apresentado)" } }),
        st(9.4, "extract", "E16 Grade I sprain · 72h restriction", { cite: { doc: "E16", quote: "Grade I lateral ankle sprain, right (S93.4)." } }),
        st(13.0, "extract", "E17 gel, support, sunscreen", { cite: { doc: "E17", quote: "Protetor solar FPS50 spray  1  12.90 23%" } }),
        st(18.4, "memory", "Wrote 12 facts to Cognee graph"),
      ], { facts: 12 }, [4100, 520]),
      agent("e2-medical", "Medical (C)", "section", 20.2, 33, SONNET, ["E15", "E16", "E17", "E18", "FX"], ["C1", "C3", "C5", "C6", "C7.2"], [
        st(21.0, "check", "Gel and support recommended by doctor", { clause: "C1.2", result: "pass", cite: { doc: "E16", quote: "Topical anti-inflammatory (diclofenac gel) and an elastic ankle support recommended" } }),
        st(28.6, "check", "Sunscreen excluded", { clause: "C7.2", result: "fail", cite: { doc: "E17", quote: "Protetor solar FPS50 spray  1  12.90 23%" } }),
        st(36.0, "tool", "fx_ref(2026-09-16) → 0.8540 for cash taxis", { cite: { doc: "FX", quote: "2026-09-16,EUR,0.8540" } }),
        st(42.4, "check", "GHIC not used, excess not waived", { clause: "C6", result: "info", cite: { doc: "E15", quote: "REGIME:   PARTICULAR (cartao GHIC/CESD nao apresentado)" } }),
        st(50.6, "finding", "Wrote F-05, A-05", { finding: "F-05" }),
        st(52.8, "handoff", "Section C £133.37"),
      ], { section: "C", eligible_gbp: 233.37, excess_gbp: 100, net_gbp: 133.37 }, [8600, 1200]),
    ],
  },
  {
    id: "ep3",
    at: "Oct 7, 21:02",
    trigger: "evidence",
    label: "Customer replied · 5 attachments",
    docs: ["E19", "E20", "E03", "E11", "E23"],
    runLength: s(70),
    facts: 14,
    summary: "Cruise booked before injury, refusal in writing. Only Eleanor's half covered. Every line now decided. Payment held for the police report.",
    stance: { reject: 0.12, partial: 0.88, full: 0, low: 390.2, high: 390.2, note: "Every line decided: £390.20. Payment held until the fraud screen is complete.", blocker: "Original police report" },
    agents: [
      agent("orch", "Orchestrator", "orchestrator", 0, 70, OPUS, [], [], [
        st(0.2, "memory", "Woke on inbound email · 5 attachments", { detail: "Fulfils R4" }),
        st(0.6, "spawn", "Spawned Document router, Evidence reader"),
        st(18.5, "spawn", "Spawned Missed excursion (B2)"),
        st(42.0, "spawn", "Spawned Settlement calculator, Decision & authority"),
        st(58.4, "decision", "Is the evidence enough to pay?", { detail: "No. All 12 lines decided, but P6 cannot pass: F2 and F3 need the original police report.", result: "fail" }),
        st(58.8, "spawn", "Spawned Customer emails"),
        st(69.6, "decision", "Holding £390.20", { result: "warn" }),
      ], { decided_lines: 12, net_gbp: 390.2, blocked_by: "P6" }, [9100, 1300]),
      agent("e3-router", "Document router", "router", 0.7, 5, HAIKU, [], [], [st(1.1, "tool", "classify_documents(5)"), st(5.4, "handoff", "B2 → E19 E20 · noise → E03 E11 E23", { cite: { doc: "E11", quote: "TOTAL" } })], { relevant: 2, noise: ["E03", "E11", "E23"] }, [3300, 160]),
      agent("e3-exc", "Evidence reader · E19–E20", "extractor", 5.8, 12, HAIKU, ["E19", "E20"], [], [
        st(6.4, "extract", "Booked 28 Aug · 2 adults · €120", { cite: { doc: "E19", quote: "2 × €60.00 = €120.00" } }),
        st(11.2, "extract", "Operator refused refund in writing", { cite: { doc: "E20", quote: "the full amount of €120.00 is non-refundable" } }),
        st(17.4, "memory", "Wrote 7 facts to Cognee graph"),
      ], { facts: 7 }, [2400, 300]),
      agent("e3-excursion", "Missed excursion (B2)", "section", 18.7, 22, SONNET, ["E16", "E19", "E20", "CERT"], ["B2.1", "B2.2", "B2.3", "1.3"], [
        st(19.4, "check", "Booked before injury", { clause: "B2.3(c)", result: "pass", cite: { doc: "E19", quote: "Fri, 28 Aug 2026 20:14" } }),
        st(25.6, "check", "Restriction covers 17 Sep 18:30", { clause: "B2.2", result: "pass", cite: { doc: "E16", quote: "until 19/09/2026, 13:20" } }),
        st(31.0, "check", "Companion not insured", { clause: "B2.3(b)", result: "fail", cite: { doc: "CERT", quote: "Only the persons listed above are insured." } }),
        st(38.4, "finding", "Wrote F-06, A-06", { finding: "F-06" }),
        st(40.4, "handoff", "Section B2 £51.69"),
      ], { section: "B2", eligible_gbp: 51.69 }, [5600, 800]),
      agent("e3-calc", "Settlement calculator", "calculator", 42.2, 3, "deterministic", [], ["CHG 7.5"], [st(42.6, "tool", "sum(E 205.14, C 133.37, B2 51.69, D 0) → £390.20")], { net_gbp: 390.2 }),
      agent("e3-decision", "Decision & authority", "decision", 45.4, 12.5, OPUS, ["SAP"], ["SAP-01 §3"], [
        st(46.0, "check", "P1 net £390.20 ≤ £1,000", { clause: "P1", result: "pass" }),
        st(50.4, "check", "P6 fraud screen incomplete", { clause: "P6", result: "fail", detail: "F2 and F3 depend on the original police report (CHG 5.2)" }),
        st(57.2, "decision", "HOLD · do not pay yet", { result: "warn" }),
      ], { decision: "HOLD", reason: "P6 incomplete" }, [4800, 700]),
      agent("e3-comms", "Customer emails", "comms", 59.0, 10.5, SONNET, [], ["CHG 5.2"], [
        st(59.4, "tool", "draft_email(ack=5, still_open=R1, R5)"),
        st(69.2, "tool", "send_email(to=customer)", { result: "pass" }),
      ], { sent: "M5" }, [2000, 410]),
    ],
  },
  {
    id: "ep4",
    at: "Oct 9, 08:12",
    trigger: "evidence",
    label: "Customer replied · 2 attachments",
    docs: ["E21", "E22"],
    runLength: s(38),
    facts: 16,
    summary: "Card statement confirms the pounds charged. Hotel log confirms the bag delivery. Still holding for the police report.",
    stance: { reject: 0.1, partial: 0.9, full: 0, low: 390.2, high: 390.2, note: "£390.20 confirmed against the card statement. Payment held.", blocker: "Original police report" },
    agents: [
      agent("orch", "Orchestrator", "orchestrator", 0, 38, OPUS, [], [], [
        st(0.2, "memory", "Woke on inbound email · 2 attachments", { detail: "Fulfils R5" }),
        st(0.6, "spawn", "Spawned Document router, Evidence reader"),
        st(22.0, "spawn", "Spawned Settlement calculator"),
        st(37.4, "decision", "Is the evidence enough to pay?", { detail: "No. P6 still blocked by the missing police report.", result: "fail" }),
      ], { net_gbp: 390.2, blocked_by: "P6" }, [5200, 600]),
      agent("e4-router", "Document router", "router", 0.7, 4, HAIKU, [], [], [st(1.0, "tool", "classify_documents(2)"), st(4.4, "handoff", "statement → E21 · E → E22")], { relevant: 2 }, [2100, 100]),
      agent("e4-card", "Evidence reader · E21–E22", "extractor", 5.0, 16, HAIKU, ["E21", "E22"], [], [
        st(5.6, "extract", "Matched 8 card lines to receipts", { cite: { doc: "E21", quote: "FARMACIA ESTRELA LISBOA PT" } }),
        st(12.2, "extract", "Hotel log: bag delivered 13/09 19:20", { cite: { doc: "E22", quote: "Front desk log 13/09 19:20 - luggage delivered by airline" } }),
        st(20.4, "memory", "Wrote 16 facts to Cognee graph"),
      ], { card_lines_matched: 8 }, [3600, 420]),
      agent("e4-calc", "Settlement calculator", "calculator", 22.2, 14, "deterministic", ["E21"], ["CHG 7.1.1"], [
        st(22.6, "tool", "gbp_debited(lines 1–4, 8–9, 12)"),
        st(35.8, "tool", "sum → £390.20 · unchanged"),
      ], { net_gbp: 390.2 }),
    ],
  },
  {
    id: "ep5",
    at: "Oct 12, 09:00",
    trigger: "schedule",
    label: "Scheduled check",
    docs: [],
    runLength: s(9),
    facts: 0,
    summary: "Police report still outstanding after 11 days. Sent a reminder.",
    stance: { reject: 0.1, partial: 0.9, full: 0, low: 390.2, high: 390.2, note: "Unchanged. Reminder sent for the police report.", blocker: "Original police report" },
    agents: [
      agent("orch", "Orchestrator", "orchestrator", 0, 9, OPUS, [], [], [
        st(0.2, "memory", "cognee.search(open_requests, age > 7 days)", { detail: "R1 open 11 days" }),
        st(0.8, "spawn", "Spawned Customer emails"),
        st(8.6, "decision", "Waiting on customer", { result: "info" }),
      ], { open_requests: ["R1"] }, [1800, 200]),
      agent("e5-comms", "Customer emails", "comms", 1.0, 7.5, SONNET, [], ["CHG 5.2"], [
        st(1.4, "tool", "draft_email(reminder=R1)"),
        st(8.2, "tool", "send_email(to=customer)", { result: "pass" }),
      ], { sent: "M7" }, [1500, 320]),
    ],
  },
  {
    id: "ep6",
    at: "Oct 15, now",
    trigger: "evidence",
    label: "Customer replied · 1 attachment",
    docs: ["E12", "EM"],
    runLength: s(48),
    facts: 6,
    summary: "Original police report read. Fraud screen complete at 30, under 40. Paid £390.20 without a person.",
    stance: { reject: 0, partial: 1, full: 0, low: 390.2, high: 390.2, note: "Decided: partial payment of £390.20. Paid." },
    agents: LIVE_AGENTS,
  },
];

export const c004817: Claim = {
  id: "CLM-2026-004817",
  apiId: "clm_1Q8vR2Lk4817WhtCmb",
  claimant: "Eleanor Whitcombe",
  email: "eleanor.whitcombe@example.com",
  policy: "STR-TRV-26-0071934",
  product: "Travel · Single trip",
  cover: "Silver",
  wording: "TRV-2026 v1",
  heads: ["Delayed baggage", "Personal belongings", "Medical", "Missed excursion"],
  destination: "Lisbon, PT",
  tripDates: "12–19 Sep 2026",
  lossDate: "Sep 12, 2026",
  reported: "Oct 1, 2026",
  status: "paid",
  claimed: 1380.0,
  net: 390.2,
  route: "agent",
  tier: "T0",
  recommendation: "SETTLE_PARTIAL",
  summary:
    "Four heads of claim. Delayed baggage, medical and excursion paid in part. Phone declined: no Gadget extension and left unattended. Jacket bought after bag returned. Duplicate pharmacy receipt removed. Companion's excursion share removed.",
  fraudScore: 30,
  fraudBand: "Amber",
  documents: [
    ...DOCS_004817,
    {
      id: "EM",
      name: "reply_15oct_police_report.eml",
      title: "Customer email 15 Oct",
      kind: "email",
      text: `**From:** ${CUSTOMER}
**To:** ${CLAIMS}
**Date:** Thu, 15 Oct 2026
**Subject:** RE: Reminder: original police report

Hello,

Sorry for the delay. The police station in Carcavelos posted the original report to me. Please find attached a scan of it (E12).

Also, I've just noticed I may have put the pharmacy receipt from the first day in twice on the form — sorry if so, I was going through a big pile of receipts!

Thanks,
Eleanor`,
    },
  ],
  runLength: s(48),
  agents: LIVE_AGENTS,
  episodes: EPISODES,

  requests: [
    { id: "R1", item: "Original police report, in Portuguese", reason: "The customer's own translation can't be used alone. Needed to finish the fraud screen.", clause: "CHG 5.2", requested: 0, chased: [1, 3, 5], received: 6, docs: ["E12"] },
    { id: "R2", item: "Airline confirmation of when the bag was delivered", reason: "Sets the delay window for the baggage receipts.", clause: "CHG 8.1.1", requested: 0, chased: [], received: 1, docs: ["E05"] },
    { id: "R3", item: "Medical certificate and clinic invoice", reason: "Mandatory for medical costs.", clause: "CHG §6", requested: 0, chased: [1], received: 2, docs: ["E15", "E16", "E17", "E18"] },
    { id: "R4", item: "Cruise booking and the operator's refusal to refund", reason: "Mandatory for a missed excursion.", clause: "B2.3(d)", requested: 0, chased: [1], received: 3, docs: ["E19", "E20"] },
    { id: "R5", item: "Card statement showing amounts in pounds", reason: "Pays the pounds actually charged, not a converted estimate.", clause: "CHG 7.1.1", requested: 1, chased: [3], received: 4, docs: ["E21"] },
  ],

  emails: [
    {
      id: "M0",
      episode: 0,
      direction: "out",
      from: CLAIMS,
      to: CUSTOMER,
      at: "Oct 1, 08:49",
      subject: "Your claim CLM-2026-004817: documents we need",
      auto: true,
      requests: ["R1", "R2", "R3", "R4"],
      body: `Dear Ms Whitcombe,

Thank you for your claim. We've started reviewing it. To finish, we need:

1. The original police report from Carcavelos, in Portuguese. We have your translation, but we need the report as the police issued it.
2. The airline's confirmation of when your bag was delivered to the hotel.
3. The medical certificate and the clinic invoice from Sintra.
4. Your cruise booking and the operator's email refusing a refund.

You can reply to this email with the documents attached.

Strype Travel Claims`,
    },
    {
      id: "M1",
      episode: 1,
      direction: "in",
      from: CUSTOMER,
      to: CLAIMS,
      at: "Oct 2, 19:10",
      subject: "RE: Your claim CLM-2026-004817: documents we need",
      auto: false,
      attachments: ["E05", "E01", "E02", "E08", "E09", "E10"],
      body: `Hi,

Attached is the airline's email about my bag, plus the rest of my receipts and my flight details. I'll find the medical things and the cruise emails.

Eleanor`,
    },
    {
      id: "M2",
      episode: 1,
      direction: "out",
      from: CLAIMS,
      to: CUSTOMER,
      at: "Oct 2, 19:12",
      subject: "RE: Your claim CLM-2026-004817: documents we need",
      auto: true,
      requests: ["R5"],
      body: `Dear Ms Whitcombe,

Thank you, we've received 6 documents. The baggage part of your claim is now assessed.

We still need:

1. The original police report, in Portuguese.
2. The medical certificate and clinic invoice.
3. The cruise booking and the operator's refusal.
4. New: a card statement showing the amounts taken in pounds, so we can pay what you were actually charged.

Strype Travel Claims`,
    },
    {
      id: "M3",
      episode: 2,
      direction: "in",
      from: CUSTOMER,
      to: CLAIMS,
      at: "Oct 5, 12:31",
      subject: "Medical documents",
      auto: false,
      attachments: ["E15", "E16", "E17", "E18"],
      body: `Hello,

Here are the clinic invoice, the doctor's certificate, the pharmacy receipt and the taxi receipts.

Eleanor`,
    },
    {
      id: "M4",
      episode: 3,
      direction: "in",
      from: CUSTOMER,
      to: CLAIMS,
      at: "Oct 7, 21:02",
      subject: "Cruise",
      auto: false,
      attachments: ["E19", "E20", "E03", "E11", "E23"],
      body: `Hi, here's the cruise booking and their reply. I've added a few other things from the trip in case they help.

Eleanor`,
    },
    {
      id: "M5",
      episode: 3,
      direction: "out",
      from: CLAIMS,
      to: CUSTOMER,
      at: "Oct 7, 21:04",
      subject: "Your claim CLM-2026-004817: two things left",
      auto: true,
      requests: ["R1", "R5"],
      body: `Dear Ms Whitcombe,

Thank you. We have now assessed every item on your claim.

Before we can pay, we need two more things:

1. The original police report, in Portuguese.
2. A card statement showing the amounts taken in pounds.

Strype Travel Claims`,
    },
    {
      id: "M6",
      episode: 4,
      direction: "in",
      from: CUSTOMER,
      to: CLAIMS,
      at: "Oct 9, 08:12",
      subject: "Statement",
      auto: false,
      attachments: ["E21", "E22"],
      body: `Statement attached, and the hotel invoice. I've written to the police station for the original report.

Eleanor`,
    },
    {
      id: "M7",
      episode: 5,
      direction: "out",
      from: CLAIMS,
      to: CUSTOMER,
      at: "Oct 12, 09:00",
      subject: "Reminder: original police report",
      auto: true,
      requests: ["R1"],
      body: `Dear Ms Whitcombe,

We're ready to settle your claim. The only thing we still need is the original police report from Carcavelos, in Portuguese.

As soon as it arrives we'll finish your claim.

Strype Travel Claims`,
    },
    {
      id: "M8",
      episode: 6,
      t: 0,
      direction: "in",
      from: CUSTOMER,
      to: CLAIMS,
      at: "Oct 15, now",
      subject: "RE: Reminder: original police report",
      auto: false,
      attachments: ["E12"],
      body: `Hello,

Sorry for the delay. The police station in Carcavelos posted the original report to me. Please find attached a scan of it.

Also, I've just noticed I may have put the pharmacy receipt from the first day in twice on the form — sorry if so!

Thanks,
Eleanor`,
    },
    {
      id: "M9",
      episode: 6,
      t: s(47.6),
      direction: "out",
      from: CLAIMS,
      to: CUSTOMER,
      at: "Oct 15, now",
      subject: "Your claim has been settled: £390.20",
      auto: true,
      body: `Dear Ms Whitcombe,

We've settled your claim and paid £390.20 to your account ending 3092. It should arrive within 2 working days.

What we paid
• Delayed baggage: £205.14 for toiletries, clothes, swimwear, sandals, charger and adaptor.
• Medical: £133.37. That's £233.37 of costs less the £100 excess.
• Sunset cruise: £51.69, your half of the booking.

What we couldn't pay
• Phone: your policy doesn't include the Gadget extension, and the police report says the bag was left on the beach while you were swimming.
• Linen jacket: bought after your bag was returned.
• Second pharmacy line: the same receipt as the first.
• Sunscreen on the Sintra pharmacy receipt: not a medical item.
• Tom's half of the cruise: he isn't named on the policy.

If you have more information about the phone, reply to this email and we'll look again.

Strype Travel Claims`,
    },
  ],

  findings: [
    {
      id: "F-01",
      episode: 0,
      side: "for",
      title: "Policy in force on every incident date",
      detail: "Status ACTIVE, premium paid 20 Aug. Incidents on 12, 15, 16 and 17 Sep fall inside the period of insurance.",
      agent: "e0-intake",
      clauses: ["SAP P2", "CHG §4"],
      cites: [
        { doc: "CERT", quote: "12 September 2026 00:01 to 19 September 2026 23:59 (UK time), or on return home if earlier" },
        { doc: "ADM", quote: "\"status\": \"ACTIVE\"" },
      ],
    },
    {
      id: "F-02",
      episode: 0,
      side: "for",
      title: "Notified 12 days after return",
      detail: "Returned 19 Sep, claim submitted 1 Oct. Inside the 31 day window.",
      agent: "e0-intake",
      clauses: ["GC.1"],
      cites: [
        { doc: "CF", quote: "2026-10-01 08:47:19 UTC" },
        { doc: "POL", quote: "You must notify us of any claim within 31 days of returning home" },
      ],
    },
    {
      id: "F-07",
      episode: 0,
      side: "for",
      title: "Payee matches verified account on file",
      detail: "Account ending 3092 matches payee token verified 11 May 2024. Unchanged since.",
      agent: "e0-intake",
      clauses: ["SAP P8"],
      cites: [
        { doc: "ADM", quote: "\"payee_token\": \"payee_tok_8f3c2a91e4\"" },
        { doc: "CF", quote: "53813092" },
      ],
    },
    {
      id: "A-01",
      episode: 0,
      side: "against",
      title: "Phone: Gadget extension not purchased",
      detail: "iPhone 15 is a gadget. The Certificate shows no Gadget extension, so it has no cover under D.1.",
      agent: "e0-belongings",
      lines: [7],
      impact: "−£649.00",
      clauses: ["D.4.4", "OE-3"],
      cites: [
        { doc: "CERT", quote: "Gadget extension: NOT purchased" },
        { doc: "POL", quote: "unless the optional Gadget extension (D.6) is shown on your Certificate" },
      ],
    },
    {
      id: "A-04",
      episode: 0,
      side: "against",
      title: "Duplicate pharmacy receipt",
      detail: "Line 5 uses receipt FE-2026-118734, already claimed on line 1.",
      agent: "e0-consistency",
      lines: [5],
      impact: "−£32.86",
      clauses: ["CHG 7.4", "OE-8"],
      cites: [
        { doc: "CF", quote: "Pharmacy items - shampoo, toothbrush etc" },
        { doc: "E06", quote: "FATURA-RECIBO  FE-2026-118734" },
      ],
    },
    {
      id: "R-03",
      episode: 0,
      side: "flag",
      title: "Brochure promises not applied",
      detail: "Brochure says phones are protected and bag delay pays up to £400. Not contractual. Wording TRV-2026 v1 used.",
      agent: "e0-intake",
      clauses: ["CHG 4.3"],
      cites: [
        { doc: "BRO", quote: "Your phone and gadgets protected wherever you go." },
        { doc: "BRO", quote: "This brochure does not form part of your insurance contract." },
      ],
    },
    {
      id: "F-03",
      episode: 1,
      side: "for",
      title: "Bag delayed 30h 14m on outbound flight",
      detail: "Arrival 13:06 on 12 Sep. Bag delivered to hotel 19:20 on 13 Sep. Over the 12 hour threshold.",
      agent: "e1-baggage",
      lines: [1, 2, 3, 4],
      clauses: ["E.1", "CHG 8.1.1"],
      cites: [
        { doc: "E04", quote: "13:06" },
        { doc: "E05", quote: "13 SEP 2026 19:20 (local)" },
      ],
    },
    {
      id: "F-04",
      episode: 1,
      side: "for",
      title: "Essentials bought inside the delay window",
      detail: "Toiletries, basic clothing, swimwear, sandals, charger and adaptor. All timestamped between 13:06 on 12 Sep and 19:20 on 13 Sep.",
      agent: "e1-baggage",
      lines: [1, 2, 3, 4],
      impact: "£205.14",
      clauses: ["E.1", "2.5", "CHG 8.1.2", "CHG 8.1.3"],
      cites: [
        { doc: "E06", quote: "Hora: 15:52" },
        { doc: "E07", quote: "12-09-2026  16:41" },
        { doc: "E08", quote: "Data: 13.09.2026  10:58" },
        { doc: "E09", quote: "13/09/2026                        12:26" },
        { doc: "POL", quote: "replacement clothing, toiletries, prescribed or over-the-counter medication, and phone or device chargers and travel adaptors" },
      ],
    },
    {
      id: "A-03",
      episode: 1,
      side: "against",
      title: "Jacket bought after bag was returned",
      detail: "Receipt 14 Sep 11:37. Bag delivered 13 Sep 19:20. Also a handmade fashion item, not essential.",
      agent: "e1-baggage",
      lines: [6],
      impact: "−£119.06",
      clauses: ["E.4.1", "E.4.2", "OE-1"],
      cites: [
        { doc: "E10", quote: "14/09/2026     11:37" },
        { doc: "E05", quote: "13 SEP 2026 19:20 (local)" },
        { doc: "E10", quote: "handmade in Portugal since 1998" },
      ],
    },
    {
      id: "R-02",
      episode: 1,
      side: "flag",
      title: "Possible recovery from the airline",
      detail: "Solent Airways accepts interim expense claims within 21 days. £205.14 may be recoverable.",
      agent: "e1-baggage",
      clauses: ["GC.4"],
      cites: [{ doc: "E04", quote: "You may submit reasonable interim expenses to Solent Airways Customer Relations within 21 days of receiving your bag." }],
    },
    {
      id: "F-05",
      episode: 2,
      side: "for",
      title: "Injury certified by a registered clinic",
      detail: "Grade I ankle sprain diagnosed on 16 Sep. Private patient, GHIC not used, so the £100 excess applies.",
      agent: "e2-medical",
      lines: [8, 9, 10, 11],
      impact: "£133.37",
      clauses: ["C1.1", "C1.2", "C3", "C5", "C6"],
      cites: [
        { doc: "E16", quote: "Grade I lateral ankle sprain, right (S93.4)." },
        { doc: "E15", quote: "REGIME:   PARTICULAR (cartao GHIC/CESD nao apresentado)" },
        { doc: "E16", quote: "Topical anti-inflammatory (diclofenac gel) and an elastic ankle support recommended" },
      ],
    },
    {
      id: "A-05",
      episode: 2,
      side: "against",
      title: "Sunscreen on the medical pharmacy receipt",
      detail: "€12.90 sunscreen removed from the Sintra receipt. Gel and ankle support kept and pro-rated.",
      agent: "e2-medical",
      lines: [9],
      impact: "−£11.06",
      clauses: ["C7.2", "CHG 7.2.2", "OE-6"],
      cites: [
        { doc: "E17", quote: "Protetor solar FPS50 spray  1  12.90 23%" },
        { doc: "POL", quote: "non-medical items bought at a pharmacy, including but not limited to sunscreen" },
      ],
    },
    {
      id: "F-06",
      episode: 3,
      side: "for",
      title: "Excursion booked before injury, non-refundable in writing",
      detail: "Booked 28 Aug. Certificate restriction runs to 19 Sep 13:20 and covers the 17 Sep 18:30 sailing.",
      agent: "e3-excursion",
      lines: [12],
      impact: "£51.69",
      clauses: ["B2.1", "B2.2", "B2.3(d)"],
      cites: [
        { doc: "E19", quote: "Fri, 28 Aug 2026 20:14" },
        { doc: "E20", quote: "the full amount of €120.00 is non-refundable" },
        { doc: "E16", quote: "avoid prolonged walking, standing and uneven surfaces for 72 hours" },
      ],
    },
    {
      id: "A-06",
      episode: 3,
      side: "against",
      title: "Companion's share of the cruise",
      detail: "Booking is for 2 adults. Tom Ashdown is not named on the Certificate. Only Eleanor's half is payable.",
      agent: "e3-excursion",
      lines: [12],
      impact: "−£51.69",
      clauses: ["B2.3(b)", "1.3", "OE-7"],
      cites: [
        { doc: "E19", quote: "2 × €60.00 = €120.00" },
        { doc: "CERT", quote: "Only the persons listed above are insured." },
      ],
    },
    {
      id: "A-02",
      episode: LIVE_EPISODE,
      side: "against",
      title: "Phone: left unattended on the beach",
      detail: "Original police report records the bag left unattended about 40 metres away while swimming. Policy treats this as unattended regardless of distance.",
      agent: "belongings",
      lines: [7],
      clauses: ["D.4.5", "2.12", "OE-4"],
      cites: [
        { doc: "E12", quote: "deixou o seu saco de praia sobre a toalha, na areia, sem vigilância, enquanto nadava no mar" },
        { doc: "E12", quote: "a uma distância aproximada de 40 (quarenta) metros" },
        { doc: "POL", quote: "Property left on a beach, at a poolside or in a public place while you are swimming, sleeping or otherwise away from it is unattended, regardless of distance." },
      ],
    },
    {
      id: "R-01",
      episode: LIVE_EPISODE,
      side: "flag",
      title: "Customer's translation drops key words",
      detail: "Own translation omits 'sem vigilância' and '40 metros'. Claim form says 'while I was nearby'. FRD F2, +15.",
      agent: "consistency",
      lines: [7],
      clauses: ["FRD F2", "CHG 5.2"],
      cites: [
        { doc: "E13", quote: "That she had her beach bag on the towel on the sand while she was swimming nearby in the sea with her partner for about 20 minutes." },
        { doc: "CF", quote: "My phone was stolen from my beach bag at Praia de Carcavelos while I was nearby." },
      ],
    },
    {
      id: "F-08",
      episode: LIVE_EPISODE,
      side: "for",
      title: "Fraud screen complete: 30, under the 40 limit",
      detail: "Theft reported the same day. Score 30 Amber: pay and sample for QA.",
      agent: "consistency",
      clauses: ["SAP P6", "FRD-03"],
      cites: [
        { doc: "E12", quote: "15/09/2026, 16:45" },
        { doc: "SAP", quote: "Fraud indicator score < 40 (FRD-03). Scores 25–39 may proceed but must be flagged for post-payment QA sampling." },
      ],
    },
  ],

  lines: [
    { line: 1, section: "E", description: "Toiletries, Farmácia Estrela", date: "12 Sep", claimed: "EUR 38.40", claimedGbp: 32.86, outcome: "PAY", payable: 32.86, clauses: ["E.1", "2.5"], evidence: ["E04", "E05", "E06", "E21"], reason: "Inside delay window. GBP debited used." },
    { line: 2, section: "E", description: "Clothes, Loja Tejo Moda", date: "12 Sep", claimed: "EUR 86.50", claimedGbp: 74.02, outcome: "PAY", payable: 74.02, clauses: ["E.1", "2.5"], evidence: ["E07", "E21"], reason: "Basic clothing inside window." },
    { line: 3, section: "E", description: "Swimsuit and sandals, Cais Beachwear", date: "13 Sep", claimed: "EUR 84.90", claimedGbp: 72.61, outcome: "PAY", payable: 72.61, clauses: ["E.1", "CHG 8.1.3"], evidence: ["E08", "E21"], reason: "Swimwear essential on coastal trip." },
    { line: 4, section: "E", description: "Charger and adaptor, TecnoBaixa", date: "13 Sep", claimed: "EUR 29.99", claimedGbp: 25.65, outcome: "PAY", payable: 25.65, clauses: ["E.1", "2.5"], evidence: ["E09", "E21"], reason: "Chargers and adaptors listed as essential." },
    { line: 5, section: "E", description: "Pharmacy items (same receipt as line 1)", date: "12 Sep", claimed: "EUR 38.40", claimedGbp: 32.86, outcome: "DECLINE", payable: 0, clauses: ["CHG 7.4", "OE-8"], evidence: ["E06", "CF"], reason: "Duplicate of FE-2026-118734." },
    { line: 6, section: "E", description: "Linen jacket, Alfama Linen Co.", date: "14 Sep", claimed: "EUR 139.00", claimedGbp: 119.06, outcome: "DECLINE", payable: 0, clauses: ["E.4.1", "E.4.2"], evidence: ["E10", "E05", "E22"], reason: "Bought after bag returned." },
    { line: 7, section: "D", description: "iPhone 15 128GB", date: "15 Sep", claimed: "GBP 649.00", claimedGbp: 649.0, outcome: "DECLINE", payable: 0, clauses: ["D.4.4", "D.4.5", "2.12"], evidence: ["CERT", "E12"], reason: "No Gadget extension. Left unattended." },
    { line: 8, section: "C", description: "Clinic consultation, X-ray, bandage", date: "16 Sep", claimed: "EUR 185.00", claimedGbp: 158.66, outcome: "PAY", payable: 158.66, clauses: ["C1.1", "GC.5"], evidence: ["E15", "E16", "E21"], reason: "Emergency treatment. GBP debited." },
    { line: 9, section: "C", description: "Pharmacy, Farmácia Central de Sintra", date: "16 Sep", claimed: "EUR 42.15", claimedGbp: 36.15, outcome: "PAY_PARTIAL", payable: 25.09, clauses: ["C1.2", "C7.2", "CHG 7.2.2"], evidence: ["E16", "E17", "E21"], reason: "Sunscreen removed. £36.15 × 29.25/42.15." },
    { line: 10, section: "C", description: "Taxi, Pena to clinic (cash)", date: "16 Sep", claimed: "EUR 16.80", claimedGbp: 14.35, outcome: "PAY", payable: 14.35, clauses: ["C3", "CHG 7.1.2"], evidence: ["E18", "FX"], reason: "Cash. FX-REF 0.8540." },
    { line: 11, section: "C", description: "Taxi, clinic to hotel (cash)", date: "16 Sep", claimed: "EUR 41.30", claimedGbp: 35.27, outcome: "PAY", payable: 35.27, clauses: ["C3", "CHG 7.1.2"], evidence: ["E18", "FX"], reason: "Cash. FX-REF 0.8540." },
    { line: 12, section: "B2", description: "Tagus sunset cruise, 2 adults", date: "17 Sep", claimed: "EUR 120.00", claimedGbp: 103.38, outcome: "PAY_PARTIAL", payable: 51.69, clauses: ["B2.1", "B2.3(b)", "1.3"], evidence: ["E16", "E19", "E20", "E21"], reason: "Insured's half only." },
  ],

  sections: [
    { section: "E · Delayed baggage", eligible: 205.14, limit: "£300", excess: 0, net: 205.14 },
    { section: "C · Medical", eligible: 233.37, limit: "C3 £100", excess: 100, net: 133.37 },
    { section: "B2 · Missed excursion", eligible: 51.69, limit: "£250", excess: 0, net: 51.69 },
    { section: "D · Personal belongings", eligible: 0, limit: "£300 / article", excess: 0, net: 0 },
  ],

  authority: [
    { id: "P1", rule: "Net ≤ £1,000", pass: true, note: "£390.20" },
    { id: "P2", rule: "Policy active, paid, in period", pass: true, note: "All incident dates in period" },
    { id: "P3", rule: "Named insured, notified ≤ 31 days", pass: true, note: "12 days" },
    { id: "P4", rule: "Wording from Certificate", pass: true, note: "TRV-2026 v1" },
    { id: "P5", rule: "Mandatory evidence present", pass: true, note: "All paid lines" },
    { id: "P6", rule: "Fraud score < 40", pass: true, note: "30, Amber, QA flag", pending: "Needs the original police report" },
    { id: "P7", rule: "No in-patient, H or I", pass: true, note: "Out-patient only" },
    { id: "P8", rule: "Verified payee, unchanged 14 days", pass: true, note: "…3092 since 2024" },
    { id: "P9", rule: "Every line cites clause and doc", pass: true, note: "12 of 12" },
    { id: "P10", rule: "Partial declines meet §4", pass: true, note: "All Objective Exclusions" },
  ],

  fraud: [
    { id: "F1", label: "Policy bought ≤ 7 days before departure", weight: 20, triggered: false, note: "23 days" },
    { id: "F2", label: "Account differs from independent evidence", weight: 15, triggered: true, note: "Translation vs PSP original", pending: "Needs the original police report" },
    { id: "F3", label: "Theft reported > 24h after discovery", weight: 15, triggered: false, note: "Same day, 16:45", pending: "Needs the original police report" },
    { id: "F4", label: "Duplicate receipt", weight: 10, triggered: true, note: "FE-2026-118734 twice" },
    { id: "F5", label: "Single gadget > £500", weight: 5, triggered: true, note: "iPhone £649" },
    { id: "F6", label: "2+ claims in 24 months", weight: 15, triggered: false, note: "Last claim May 2024" },
    { id: "F7", label: "Receipts lack tax ID", weight: 10, triggered: false, note: "All have NIF" },
    { id: "F8", label: "Proof of ownership after incident", weight: 30, triggered: false, note: "Nov 2024" },
    { id: "F9", label: "Bank details differ from payee on file", weight: 25, triggered: false, note: "Match" },
    { id: "F10", label: "Claimed > receipts by 20%", weight: 10, triggered: false, note: "Match" },
    { id: "F11", label: "Unverifiable medical provider", weight: 20, triggered: false, note: "ERS E-128844" },
  ],

  payment: {
    id: "tr_1QDx7rLk4817aBcD2eFg",
    amount: 390.2,
    status: "succeeded",
    payee: "Ms E Whitcombe",
    payeeToken: "payee_tok_8f3c2a91e4",
    account: "•••• 3092",
    reference: "STRYPE CLM-2026-004817",
    idempotencyKey: "CLM-2026-004817-v1",
    created: "Oct 15, now",
    approvedBy: "Agent (T0)",
  },

  logs: [
    { id: "evt_l3", episode: 6, type: "transfer.paid", detail: "£390.20 to •••• 3092", actor: "stripe", at: "Oct 15, now" },
    { id: "evt_l2", episode: 6, type: "transfer.created", detail: "tr_1QDx7rLk4817aBcD2eFg · idem CLM-2026-004817-v1", actor: "agent.payment", at: "Oct 15, now" },
    { id: "evt_l1", episode: 6, type: "authority.passed", detail: "T0 · P1–P10 pass", actor: "agent.decision", at: "Oct 15, now" },
    { id: "evt_l0", episode: 6, type: "evidence.received", detail: "E12 original police report", actor: "customer", at: "Oct 15, now" },
    { id: "evt_12", episode: 5, type: "email.sent", detail: "Reminder: original police report", actor: "agent.comms", at: "Oct 12, 09:00" },
    { id: "evt_11", episode: 4, type: "payment.held", detail: "P6 fraud screen incomplete", actor: "agent.orchestrator", at: "Oct 9, 08:13" },
    { id: "evt_10", episode: 4, type: "evidence.received", detail: "E21, E22", actor: "customer", at: "Oct 9, 08:12" },
    { id: "evt_09", episode: 3, type: "email.sent", detail: "2 items requested", actor: "agent.comms", at: "Oct 7, 21:04" },
    { id: "evt_08", episode: 3, type: "payment.held", detail: "P6 fraud screen incomplete", actor: "agent.decision", at: "Oct 7, 21:03" },
    { id: "evt_07", episode: 3, type: "evidence.received", detail: "E19, E20, E03, E11, E23", actor: "customer", at: "Oct 7, 21:02" },
    { id: "evt_06", episode: 2, type: "evidence.received", detail: "E15–E18", actor: "customer", at: "Oct 5, 12:31" },
    { id: "evt_05", episode: 1, type: "email.sent", detail: "1 new item requested", actor: "agent.comms", at: "Oct 2, 19:12" },
    { id: "evt_04", episode: 1, type: "evidence.received", detail: "E05, E01, E02, E08–E10", actor: "customer", at: "Oct 2, 19:10" },
    { id: "evt_03", episode: 0, type: "email.sent", detail: "4 items requested", actor: "agent.comms", at: "Oct 1, 08:49" },
    { id: "evt_02", episode: 0, type: "triage.completed", detail: "9 agents · 2 lines decided", actor: "agent.orchestrator", at: "Oct 1, 08:49" },
    { id: "evt_01", episode: 0, type: "claim.created", detail: "Web form · 7 attachments", actor: "customer", at: "Oct 1, 08:47" },
  ],

  why: [
    {
      q: "Why did you pay £390.20?",
      a: "Three sections pay. Delayed baggage £205.14 under E.1: the bag arrived 30h 14m late and four receipts fall inside that window. Medical £133.37 under C1 and C3: £233.37 eligible less the £100 excess, which is not waived because GHIC was not used (C6). Missed excursion £51.69 under B2.1: Eleanor's half of the non-refundable cruise. Net is under the £1,000 T0 limit and P1–P10 all pass, so the agent paid without a person.",
      cites: [
        { doc: "E05", quote: "13 SEP 2026 19:20 (local)" },
        { doc: "E15", quote: "REGIME:   PARTICULAR (cartao GHIC/CESD nao apresentado)" },
        { doc: "E20", quote: "the full amount of €120.00 is non-refundable" },
        { doc: "SAP", quote: "Net settlement amount ≤ £1,000." },
      ],
      clauses: ["E.1", "C1", "C3", "C5", "C6", "B2.1", "SAP P1"],
    },
    {
      q: "Why wait for the police report?",
      a: "Every line was decided by 7 Oct, but the fraud screen wasn't complete. Indicators F2 and F3 are checked against the police report, and the guidelines say a customer's own translation is for convenience only. Without the original, P6 could not pass, so the agent held the payment and kept asking. When the original arrived the score came to 30, under the 40 limit, and it paid.",
      cites: [
        { doc: "CHG", quote: "Claimant-supplied translations are for convenience only." },
        { doc: "SAP", quote: "Fraud indicator score < 40 (FRD-03). Scores 25–39 may proceed but must be flagged for post-payment QA sampling." },
      ],
      clauses: ["CHG 5.2", "SAP P6", "FRD-03"],
    },
    {
      q: "Why was the phone declined?",
      a: "Two independent grounds. The Certificate shows the Gadget extension was not purchased, so a phone has no cover under D.1 (D.4.4). The original police report records the bag left 'sem vigilância' about 40 metres away while swimming, which is unattended under definition 2.12 (D.4.5). The customer's own translation omits both phrases, so the original was used.",
      cites: [
        { doc: "CERT", quote: "Gadget extension: NOT purchased" },
        { doc: "E12", quote: "deixou o seu saco de praia sobre a toalha, na areia, sem vigilância, enquanto nadava no mar" },
      ],
      clauses: ["D.4.4", "D.4.5", "2.12"],
    },
    {
      q: "Why only half the cruise?",
      a: "The booking is for 2 adults at €60 each. Only Eleanor is named on the Certificate. B2.3(b) and 1.3 exclude the share of anyone not named, even if the insured paid. £103.38 debited ÷ 2 = £51.69.",
      cites: [
        { doc: "E19", quote: "2 × €60.00 = €120.00" },
        { doc: "CERT", quote: "Only the persons listed above are insured." },
      ],
      clauses: ["B2.3(b)", "1.3"],
    },
  ],
};
