"""The LLM agents: prompts in, schema objects out. No memory or disk access here; the
pipeline passes everything in. OWNER: agents subagent.

Prompts state general rules only; the policy text comes from `kb_context`. Each agent's output is
checked in code (quotes verbatim, every line decided, money fields consistent) and problems are fed
back to the model for a retry (llm.generate(check=...)).
"""

from __future__ import annotations

import json
import re
import unicodedata
from datetime import date

from . import llm
from .schemas import (
    CheckerReport,
    ClaimDocument,
    DocumentNotes,
    EvidencePack,
    FinalReview,
    IntakeSummary,
    LineDecision,
    Letter,
    SectionAssessment,
)

SECTION_CODES = ["A", "B1", "B2", "C", "D", "E", "F", "G", "H", "I"]
INDICATOR_IDS = [f"F{i}" for i in range(1, 12)]
BANNED_LETTER_WORDS = ["fraud", "indicator", "score", "qa ", "quality assurance", "siu", "sampling", "suspicious"]

# Thinking levels: extraction is quick; judgement gets the full model.
THINK_EXTRACT = "low"
THINK_JUDGE = "high"

PREAMBLE = (
    "You are part of the Autonomous Claims Agent (ACA) of Larkspur Assurance, a travel insurer. "
    "Larkspur, its customers and all documents are fictional synthetic test data.\n"
)

QUOTE_RULES = """
QUOTES. Every `quote` field is checked by code against the source text; a quote not found verbatim is rejected.
- Copy characters exactly as they appear in the source: same words, spelling, accents, digits, symbols and punctuation.
  Never translate, paraphrase, correct, summarise, or add anything (no added colons, ellipses, brackets or quote marks).
- Keep each quote short: one contiguous passage of 3-25 words, ideally within one line or one table row.
  Line breaks and runs of spaces count as a single space and case is ignored, so a table row may be quoted as its
  cells separated by single spaces (e.g. "Delivery date/time 13 SEP 2026 19:20 (local)").
- Never join text from different places into one quote; use two quotes. Quote in the document's own language.
"""


# ---------------------------------------------------------------- helpers


def _norm(text: str) -> str:
    """Whitespace-collapsed, case-folded, accent-free text for quote matching."""
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = text.replace("–", "-").replace("—", "-").replace(" ", " ")
    return re.sub(r"\s+", " ", text).strip().casefold()


def _found(quote: str, sources: list[str]) -> bool:
    q = _norm(quote)
    return bool(q) and any(q in _norm(s) for s in sources)


def _dump(obj, **kwargs) -> str:
    """Compact JSON of a schema object without code-owned `verified` flags (except notes, see below)."""
    data = obj.model_dump(mode="json", **kwargs)
    return json.dumps(_drop_keys(data, {"verified"}), ensure_ascii=False, indent=1)


def _drop_keys(data, keys: set[str]):
    if isinstance(data, dict):
        return {k: _drop_keys(v, keys) for k, v in data.items() if k not in keys}
    if isinstance(data, list):
        return [_drop_keys(v, keys) for v in data]
    return data


def _doc_block(doc: ClaimDocument) -> str:
    return (
        f'<document doc_id="{doc.doc_id}" filename="{doc.filename}" title="{doc.title}" '
        f'type_hint="{doc.doc_type_hint}" language="{doc.language}" date="{doc.document_date or ""}" '
        f'received_at="{doc.received_at}">\n{doc.text}\n</document>'
    )


def _lines_table(intake: IntakeSummary, head: str | None = None) -> str:
    rows = []
    for ln in intake.lines:
        if head and ln.head != head:
            continue
        rows.append(
            f"- line {ln.line} | head {ln.head} ({ln.head_name}) | {ln.description} | incident {ln.incident_date} | "
            f"claimed {ln.currency} {ln.amount:.2f} | receipt ref: {ln.receipt_ref or '-'}"
        )
    return "\n".join(rows)


def _intake_block(intake: IntakeSummary) -> str:
    evidence = "\n".join(f'- {e.doc_id}: "{e.quote}"' for e in intake.evidence)
    return (
        f"Claim {intake.claim_id} | policy {intake.policy_number} | policyholder {intake.policyholder}\n"
        f"Insured persons (Certificate): {', '.join(intake.insured_persons)}\n"
        f"Companions NOT insured: {', '.join(intake.companions_not_insured) or 'none'}\n"
        f"Governing wording: {intake.wording_ref} | cover level: {intake.cover_level} | "
        f"extensions: {', '.join(intake.extensions) or 'none'}\n"
        f"Period of insurance: {intake.period_start} to {intake.period_end} | returned home {intake.returned_home} | "
        f"notified {intake.notified_on} (within 31 days: {intake.notified_within_31_days})\n"
        f"Summary: {intake.summary}\n"
        f"Intake evidence quotes (quotable as evidence, doc_id: quote):\n{evidence}"
    )


def _notes_block(notes: list[DocumentNotes]) -> str:
    return "\n".join(
        f'<notes doc_id="{n.doc_id}">\n{json.dumps(n.model_dump(mode="json"), ensure_ascii=False)}\n</notes>'
        for n in notes
    )


def _quote_sources(notes: list[DocumentNotes], intake: IntakeSummary) -> dict[str, list[str]]:
    """Text a later agent may quote, per doc_id: the readers' (and intake's) verbatim quotes."""
    sources: dict[str, list[str]] = {}
    for n in notes:
        bucket = sources.setdefault(n.doc_id, [])
        bucket += [f.quote for f in n.facts] + [i.quote for i in n.items]
    for e in intake.evidence:
        sources.setdefault(e.doc_id, []).append(e.quote)
    return sources


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


_MONEY = re.compile(r"(?<![\d.,])(\d{1,3}(?:,\d{3})*|\d+)[.,](\d{2})(?![\d])")


def _amounts_in(text: str) -> list[float]:
    return [float(m.group(1).replace(",", "") + "." + m.group(2)) for m in _MONEY.finditer(text)]


def _line_problems(
    d: LineDecision,
    sources: dict[str, list[str]],
    gbp_debits: set[float],
) -> list[str]:
    """Code checks on one LineDecision (quotes, citations, money fields)."""
    p: list[str] = []
    tag = f"line {d.line}"
    if not d.clause_ids:
        p.append(f"{tag}: cite at least one clause ID.")
    if not d.evidence:
        p.append(f"{tag}: give at least one evidence quote.")
    for ref in d.evidence:
        if ref.doc_id not in sources:
            p.append(f'{tag}: evidence doc_id "{ref.doc_id}" has no notes; quote only documents in the notes/intake.')
        elif not _found(ref.quote, sources[ref.doc_id]):
            p.append(
                f'{tag}: quote "{ref.quote}" is not found in the {ref.doc_id} quotes; copy (part of) a quote field '
                "of that document exactly."
            )
    if d.outcome in ("PAY", "PAY_PARTIAL"):
        if d.basis == "NONE":
            p.append(f"{tag}: a paid line needs basis GBP_DEBITED, FX_REFERENCE or GBP_NATIVE.")
        if not d.eligible_amount or d.eligible_amount <= 0:
            p.append(f"{tag}: a paid line needs eligible_amount > 0 (original currency).")
        if d.basis == "GBP_DEBITED":
            if not d.gbp_debited or not d.receipt_total:
                p.append(f"{tag}: GBP_DEBITED needs gbp_debited and receipt_total.")
            elif gbp_debits and round(d.gbp_debited, 2) not in gbp_debits:
                p.append(
                    f"{tag}: gbp_debited {d.gbp_debited:.2f} is not a GBP amount debited on any statement line in the "
                    "notes; copy the statement's GBP figure for the whole transaction, or use FX_REFERENCE if none."
                )
            elif d.eligible_amount and d.eligible_amount > d.receipt_total + 0.005:
                p.append(f"{tag}: eligible_amount exceeds receipt_total.")
        if d.basis == "FX_REFERENCE" and not (d.fx_date and _parse_date(d.fx_date)):
            p.append(f"{tag}: FX_REFERENCE needs fx_date as YYYY-MM-DD (date the cost was incurred).")
        if d.eligible_amount and d.eligible_items:
            per_item = [_amounts_in(s) for s in d.eligible_items]
            if all(len(a) == 1 for a in per_item):
                total = round(sum(a[0] for a in per_item), 2)
                if abs(total - d.eligible_amount) > 0.011:
                    p.append(
                        f"{tag}: eligible_items add up to {total:.2f} but eligible_amount is {d.eligible_amount:.2f}."
                    )
    if d.outcome == "PEND" and not d.missing_evidence:
        p.append(f"{tag}: a PEND line must list exactly what evidence to request in missing_evidence.")
    return p


def _normalise_line(d: LineDecision, intake: IntakeSummary) -> None:
    claimed = next((ln for ln in intake.lines if ln.line == d.line), None)
    if claimed:
        d.head = claimed.head
        d.claimed_amount = claimed.amount
        d.claimed_currency = claimed.currency
    if d.outcome in ("DECLINE", "PEND", "REFER"):
        d.basis = "NONE"
        d.eligible_amount = 0.0
    if d.outcome != "PEND":
        d.missing_evidence = []


def _gbp_debits(notes: list[DocumentNotes]) -> set[float]:
    return {round(i.gbp_debited, 2) for n in notes for i in n.items if i.gbp_debited}


# ---------------------------------------------------------------- 1. intake

INTAKE_SYSTEM = (
    PREAMBLE
    + """You are the INTAKE agent. You receive the claim form submission (doc_id "00"), the policyholder's Certificate
of Insurance (doc_id "CERT") and the PolicyCore policy record extract (doc_id "ADMIN"). Produce an IntakeSummary.

1. The governing policy wording reference, the cover level and the optional extensions come ONLY from the Certificate
   (CHG-TRV 4.1-4.2). Copy the wording reference exactly as on the Certificate (e.g. "TRV-2026 v1") and the cover level
   as written (e.g. "Silver"). `extensions` lists only extensions shown as purchased: empty if none were purchased.
   Marketing material never forms part of the contract.
2. insured_persons: exactly the people listed as insured on the Certificate (full names, no titles).
   companions_not_insured: anyone the claim says travelled with the claimant or shared costs who is not on the Certificate.
3. Dates as YYYY-MM-DD. period_start/period_end: the period of insurance for the sections other than cancellation.
   returned_home: the return-to-UK date on the claim form. notified_on: the date the claim was submitted.
   notified_within_31_days: notified_on is no more than 31 days after returned_home (GC.1).
   incidents_within_period: every incident date is inside the period of insurance.
4. lines: one ClaimedLine per item claimed on the claim form, keeping its line number, amount, currency and receipt
   reference exactly. Never merge, drop, correct or de-duplicate lines, even if two look identical; later steps decide.
   incident_date: the incident date of that section of the claim (the event giving rise to it); mention the item's own
   purchase/service date in the description when it differs. head: the policy section code for the head of claim,
   using Larkspur's travel section codes:
     A Cancellation | B1 Curtailment | B2 Missed pre-booked excursions | C Emergency medical and associated expenses
     (treatment, medication, local travel to/from treatment, hospital benefit) | D Personal belongings and valuables
     (including gadgets) | E Delayed baggage | F Personal money and passport | G Travel delay and missed departure |
     H Personal liability | I Legal expenses
   head_name: that section's name from the list (e.g. "Delayed baggage").
5. summary: 2-3 plain sentences: who, where, when, what is claimed.
6. evidence: verbatim quotes (doc_id + quote) establishing each of: the wording reference, cover level and extensions
   (CERT); the insured persons (CERT); the period of insurance and the date of issue (CERT); policy status and premium
   payment (ADMIN); the submission date and trip dates (00); the bank details given on the claim form (00); the verified
   payee account on file (ADMIN); every prior claim in the claims history with its notified date (ADMIN), or that there
   is none. Later agents and checks rely on these quotes.
"""
    + QUOTE_RULES
)


async def run_intake(claim_form: ClaimDocument, certificate: ClaimDocument, policy_record: ClaimDocument) -> IntakeSummary:
    """Step 1. Claim summary, governing wording and cover level from the Certificate, insured persons, dates, claimed lines."""
    docs = {d.doc_id: d.text for d in (claim_form, certificate, policy_record)}
    prompt = (
        "\n\n".join(_doc_block(d) for d in (claim_form, certificate, policy_record))
        + "\n\nProduce the IntakeSummary for this claim."
    )

    def check(out: IntakeSummary) -> list[str]:
        p = []
        if not out.lines:
            p.append("lines is empty: list every item claimed on the claim form.")
        numbers = [ln.line for ln in out.lines]
        if len(numbers) != len(set(numbers)):
            p.append("line numbers must be unique, as on the claim form.")
        for ln in out.lines:
            if ln.head not in SECTION_CODES:
                p.append(f'line {ln.line}: head "{ln.head}" must be one of {SECTION_CODES}.')
        for e in out.evidence:
            if e.doc_id not in docs:
                p.append(f'evidence doc_id "{e.doc_id}" must be one of {list(docs)}.')
            elif not _found(e.quote, [docs[e.doc_id]]):
                p.append(f'evidence quote "{e.quote}" is not found verbatim in {e.doc_id}.')
        return p

    out = await llm.generate(INTAKE_SYSTEM, prompt, IntakeSummary, check=check, thinking=THINK_EXTRACT)
    # Date checks are arithmetic: code decides them when the dates parse.
    returned, notified = _parse_date(out.returned_home), _parse_date(out.notified_on)
    if returned and notified:
        out.notified_within_31_days = 0 <= (notified - returned).days <= 31
    start, end = _parse_date(out.period_start), _parse_date(out.period_end)
    incident_dates = [_parse_date(ln.incident_date) for ln in out.lines]
    if start and end and incident_dates and all(incident_dates):
        out.incidents_within_period = all(start <= d <= end for d in incident_dates)
    return out


# ---------------------------------------------------------------- 2. readers

READER_SYSTEM = (
    PREAMBLE
    + """You are a document READER. You read ONE document from a claim file and record what it shows as DocumentNotes.
Later agents decide the claim only from your notes and quotes; they never see the document. So record every fact a
claims handler could need, each with a verbatim quote. Do not decide coverage.

1. doc_type: one of the listed values. language: ISO 639-1 code(s) of the text, e.g. "pt", "en", "pt/en".
2. is_original: false if this document is a translation of another document (by anyone, especially a translation the
   claimant made or made with an app); then translation_of = the doc_id of the original only if the document itself
   identifies it, else null. A bilingual document issued by its own author is an original.
3. issuer; document_datetime as ISO 8601 ("2026-09-12T15:52", or just the date if no time is shown).
4. heads and supports_lines: the heads of claim (use the `head` codes of the claimed lines given) and the claimed line
   numbers this document is evidence for, directly or as corroboration: it proves or disproves a purchase, a time, a
   payment, an injury, medical advice, a booking, who travelled, a delay or delivery, a theft or its circumstances, a
   refusal or non-refundability, ownership/value, or the claimant's account of events. A document is IRRELEVANT
   (heads = [], supports_lines = []) when it records nothing about this claim's events, costs, items or bookings:
   e.g. general information leaflets, guides, maps, marketing, newsletters, notices, checklists, TV/library guides,
   generic service messages and out-of-office replies, even when they mention the same place, merchant, date or person.
   Also irrelevant: costs of the trip that no claimed line relates to. relevance: one sentence on why.
5. facts: every decision-relevant fact, one per fact: names (and who travelled / who is named on a booking), dates and
   times (purchase timestamps, arrival, delivery, incident, report, examination, restriction periods), receipt/invoice/
   booking/file numbers, amounts, payment method (card last 4 digits or cash), places and routes, what happened and how
   in the document's own words (circumstances matter: e.g. where property was, whether anyone watched it, distances,
   durations), diagnoses, restrictions and recommendations, cancellation/refund terms and refusals, issuer tax/
   registration numbers, whether a health card was used, and anything that conflicts with the claimed lines.
   label = short label; value = normalised value; quote = verbatim source text.
6. items: every itemised money line on a receipt, invoice, booking or statement, in order, with its amount in the
   document's own currency. Card/bank statements: every transaction line with description, original amount and
   currency (if no original amount is shown, the GBP amount with currency "GBP"), gbp_debited = the GBP amount debited
   on that line, and date = transaction date (YYYY-MM-DD). Claim forms: each claimed line. No money lines: items = [].
7. total, currency, payment_method: the document's total and how it was paid, when shown.
8. summary: 1-3 neutral sentences on what the document is and shows; say when it is the claimant's own account.

Never infer facts the document does not state. Quote only from this document.
"""
    + QUOTE_RULES
)


async def run_reader(doc: ClaimDocument, intake: IntakeSummary) -> DocumentNotes:
    """Step 2. One document: type, original vs translation, heads it is evidence for, facts and items with verbatim quotes."""
    heads = sorted({ln.head for ln in intake.lines})
    line_numbers = {ln.line for ln in intake.lines}
    prompt = (
        f"CLAIM CONTEXT\n{_intake_block(intake)}\n\nCLAIMED LINES (head codes: {', '.join(heads)})\n"
        f"{_lines_table(intake)}\n\nDOCUMENT TO READ\n{_doc_block(doc)}\n\n"
        f'Return the DocumentNotes for doc_id "{doc.doc_id}".'
    )

    def check(out: DocumentNotes) -> list[str]:
        p = []
        for f in out.facts:
            if not _found(f.quote, [doc.text]):
                p.append(f'fact "{f.label}": quote "{f.quote}" is not found verbatim in the document.')
        for i in out.items:
            if not _found(i.quote, [doc.text]):
                p.append(f'item "{i.description}": quote "{i.quote}" is not found verbatim in the document.')
        return p

    out = await llm.generate(READER_SYSTEM, prompt, DocumentNotes, check=check, thinking=THINK_EXTRACT)
    out.doc_id = doc.doc_id
    mapped = []
    for h in out.heads:
        h = h.strip().upper()
        if h not in heads:  # e.g. "C3" -> "C"
            h = next((k for k in sorted(heads, key=len, reverse=True) if h.startswith(k)), "")
        if h and h not in mapped:
            mapped.append(h)
    out.heads = mapped
    out.supports_lines = sorted({n for n in out.supports_lines if n in line_numbers})
    if not out.heads:
        out.supports_lines = []
    return out


# ---------------------------------------------------------------- 3. section agents

SECTION_SYSTEM = (
    PREAMBLE
    + """You are the SECTION ASSESSOR for one head of claim. Decide every claimed line of that head, line by line,
strictly under the governing policy wording and the company rules given (COMPANY RULES), using only the evidence in the
reader notes and the intake. Produce one SectionAssessment. Code does all currency conversion and GBP arithmetic.

HOW TO DECIDE
1. Wording and cover: use only the wording reference, cover level and extensions from the Certificate (intake), and that
   cover level's limits and excess. Marketing material is never contractual: never use it to grant or deny cover.
2. Line by line (CHG 2.4): each line gets its own outcome; a declined item never causes an unrelated item to be declined.
   For each line check: the insuring clause covers the event; the section's conditions are met; no exclusion OF THIS
   SECTION (or a general exclusion/condition) applies; the item itself is eligible; the amount is proven by a receipt,
   invoice or statement. Exclusions written for another section never apply to this one.
3. Evidence hierarchy (CHG 5): independent official records (police, carrier, medical) > independent commercial records
   (receipts, statements, bookings, operator correspondence) > the claimant's statement > the claim form. An original-
   language document prevails over a translation; contemporaneous accounts beat later recollections. Take times and
   facts from the strongest source (e.g. the carrier's written delivery time, not the claimant's recollection).
4. Never infer facts not in evidence (CHG 2.5). Where wording is genuinely ambiguous, read it in the customer's favour
   (CHG 2.3); clear definitions apply as written. Do not decline an item that reasonably fits a cover definition.
5. Duplicates (CHG 7.4): one receipt (merchant, receipt number, date, amount) is paid once. If two claimed lines use the
   same receipt, decide the first on its merits and DECLINE the later one(s) as duplicates.
6. Only costs of people named on the Certificate are payable (1.3). A booking for several people that is not itemised
   per person: the insured person's share is the total divided equally by the number of people (CHG 7.3.2).
7. Outcomes (CHG 9):
   PAY - the whole line is eligible.
   PAY_PARTIAL - part is eligible (ineligible items removed from the receipt, or only the insured person's share).
   DECLINE - not covered: cite the clause IDs (primary ground first; include every independent ground that applies,
     with the definitions they rely on) and quote the evidence that establishes the facts. Set objective_exclusion to
     the matching SAP-01 Appendix B ref (e.g. "OE-1") when one matches (absence of cover under the Certificate, such as
     an extension not purchased, has its own ref); if several match, the primary one.
   PEND - ONLY when the line would otherwise be paid (in full or part) but mandatory evidence for the section
     (CHG 6) is missing from the file. missing_evidence lists exactly which documents to request and what they must
     show. Never PEND a line that is declined on other grounds, or for evidence that is not mandatory.
   REFER - only when the line cannot be decided within these rules (a decline needing judgement that matches no
     Objective Exclusion or absence of cover, or evidence conflicts the hierarchy cannot resolve). Say why in reason.
8. Every line: at least one clause ID (policy clauses like "E.1", "2.5", "C1.2", "B2.3(b)"; guideline rules like
   "CHG 7.1.1"; Appendix B refs go in objective_exclusion) and at least one evidence quote. For paid lines quote the
   cost (receipt line/total and the statement line when used) and the facts that meet the conditions (timing,
   medical advice, etc.). For declines quote the facts that establish the exclusion, from the original-language document.

MONEY FIELDS (copy figures from the evidence; never convert currency or compute GBP yourself)
- receipt_total: total of the whole receipt/invoice/booking/transaction, in its original currency.
- eligible_amount: the eligible part, same currency: = receipt_total if all eligible; the sum of the eligible items'
  amounts if only some are; the insured person's share of a shared booking. 0 for DECLINE/PEND/REFER.
- basis: GBP_DEBITED when a card/bank statement line in the notes shows the GBP debited for this transaction: set
  gbp_debited to the GBP debited for the WHOLE transaction as shown on the statement (CHG 7.1.1, 7.2.2).
  FX_REFERENCE when no statement line exists (e.g. paid in cash): fx_date = the date the cost was incurred (YYYY-MM-DD),
  gbp_debited null (CHG 7.1.2). GBP_NATIVE when the cost was in GBP. NONE for DECLINE, PEND and REFER.
  Example: a pharmacy receipt totalling EUR 42.15 with EUR 29.25 eligible, debited as £36.15 on the card statement ->
  basis GBP_DEBITED, receipt_total 42.15, eligible_amount 29.25, gbp_debited 36.15.
- eligible_items / excluded_items: each item with its own amount, e.g. "Diclofenac gel 10mg/g 100g - EUR 9.85" (one
  amount per entry). For a shared booking: the insured person's share as eligible and the others' shares as excluded.
- sub_limit: the code of the sub-limit within the section the line counts toward (e.g. "C3" for local travel to and
  from treatment), else null.

SECTION FIELDS
- section_limit_gbp: the section limit for the cover level (Table of Benefits). sub_limits: sub-limits within the
  section relevant to the claimed lines (code + GBP limit), else [].
- excess_gbp: the section's excess for the cover level (Table of Benefits; 0 if nil); code applies it once per section.
  excess_waived: true only if the evidence shows the wording's waiver condition is actually met; excess_reason: why it
  applies, is nil or is waived (clause + evidence).
- clause_ids: the main clauses used. notes: anything a reviewer should know (inconsistencies, recovery opportunities).
- reason (per line): plain English a customer understands, with the facts and the rule, e.g. "Bought on 14 Sep at
  11:37, after your bag was returned on 13 Sep at 19:20, so it is not covered (E.4.1)." Never mention fraud.

EVIDENCE QUOTES: each EvidenceRef = doc_id + a quote copied exactly from a `quote` field in that document's reader
notes (or an intake evidence quote for CERT, ADMIN or 00). You may use a contiguous part of such a quote but never
edit, translate, join or paraphrase it. Code rejects quotes not found. Prefer the original-language document's quotes.
"""
)


async def run_section(
    head: str,
    head_name: str,
    intake: IntakeSummary,
    notes: list[DocumentNotes],
    kb_context: str,
) -> SectionAssessment:
    """Step 3. Decide every claimed line for one head of claim, citing clauses and quotes. PEND lines list what's missing."""
    expected = sorted(ln.line for ln in intake.lines if ln.head == head)
    sources = _quote_sources(notes, intake)
    debits = _gbp_debits(notes)
    prompt = (
        f"HEAD OF CLAIM: {head} - {head_name}\n\n"
        f"COMPANY RULES (governing wording and guidelines):\n<company_rules>\n{kb_context}\n</company_rules>\n\n"
        f"INTAKE\n{_intake_block(intake)}\n\n"
        f"ALL CLAIMED LINES (for duplicate checks)\n{_lines_table(intake)}\n\n"
        f"LINES TO DECIDE (head {head}): {', '.join(map(str, expected))}\n\n"
        f"READER NOTES ({len(notes)} documents)\n{_notes_block(notes)}\n\n"
        f'Decide every line listed. Return one SectionAssessment with head "{head}" and exactly one LineDecision per '
        "line, in line order."
    )

    def check(out: SectionAssessment) -> list[str]:
        p = []
        got = [d.line for d in out.lines]
        missing = [n for n in expected if n not in got]
        extra = [n for n in got if n not in expected]
        if missing:
            p.append(f"missing decisions for lines {missing}: decide every line of head {head}.")
        if extra:
            p.append(f"lines {extra} are not head {head}: remove them.")
        if len(got) != len(set(got)):
            p.append("each line must be decided exactly once.")
        for d in out.lines:
            _normalise_line(d, intake)
            p += _line_problems(d, sources, debits)
        return p

    out = await llm.generate(SECTION_SYSTEM, prompt, SectionAssessment, check=check, thinking=THINK_JUDGE)
    out.head = head
    out.head_name = out.head_name or head_name
    for d in out.lines:
        _normalise_line(d, intake)
    out.lines.sort(key=lambda d: d.line)
    return out


# ---------------------------------------------------------------- 4. checker

CHECKER_SYSTEM = (
    PREAMBLE
    + """You are the CHECKER. Section assessors have decided each head of claim separately; you look across the whole
claim and run the fraud-indicator screen (FRD-03 in the company rules). Produce a CheckerReport.

1. cross_checks: everything linking or conflicting across lines, documents and sections:
   DUPLICATE - the same receipt or cost claimed more than once (same merchant, number, date, amount), within or across
     sections.
   CONTRADICTION - material differences between documents, especially between the claimant's own accounts (claim form,
     statement, claimant-made translations) and independent evidence (police, carrier, medical, merchants, statements),
     or between a translation and its original. Say what each document says (doc IDs) and whether it matters.
   UNINSURED_PERSON - costs relating to people not named on the Certificate.
   OTHER - anything else a reviewer must know (e.g. a recovery opportunity, marketing material cited by the claimant).
   For each: the lines and doc_ids involved, and the effect (e.g. "line 5 declined as duplicate", "no effect on payment").
2. indicators: one entry for EVERY FRD-03 indicator, F1 to F11 in order, triggered or not. weight = that indicator's
   FRD-03 weight. evidence = the facts (doc IDs, dates, amounts) showing why it is or is not triggered.
   Apply FRD-03's definitions and notes exactly:
   - Each indicator counts once per claim; it counts even when the related line is declined on coverage grounds and
     even if the claimant explained it.
   - F2 needs a MATERIAL inconsistency (one that matters to a decision, e.g. whether property was unattended, when an
     item was bought, who travelled) between the claimant's accounts and independent evidence. A claimant translation
     that omits or softens a material fact of the original counts. Minor wording differences do not.
   - F6 counts only claims notified in the 24 months before this claim's notification date (policy record claims
     history and any prior decisions given).
   - F7 targets receipts that look informal or unverifiable: handwritten, no merchant tax ID, or a suspiciously round
     total for several items without a credible itemised breakdown. A printed itemised receipt with a merchant tax ID
     whose items add up to its total does not trigger F7; bookings and statements are not receipts.
   - F9 compares the claim form's bank details with the verified payee account on file (masked digits that agree match).
   - F10 compares, per section, the amounts claimed with the receipts after removing duplicates.
   - If the facts an indicator needs are not in the file, it is not triggered; say what was checked.
   Indicators never decline anything.
3. line_overrides: normally EMPTY. Only when a section decision is clearly wrong under the rules (e.g. the same receipt
   paid in two sections, an uninsured person's cost paid, an amount contradicting the evidence, a decline for a reason
   that does not apply), give a complete corrected LineDecision for that line, following the same rules as the section
   assessors (money fields, clause IDs, verbatim quotes copied from the notes). Never override because of indicators.
4. notes: a short summary for the reviewer.
"""
)


async def run_checker(
    intake: IntakeSummary,
    notes: list[DocumentNotes],
    sections: list[SectionAssessment],
    kb_context: str,
    claims_history: str,
) -> CheckerReport:
    """Step 4. Cross-section checks (duplicates, contradictions, uninsured people) and every FRD-03 indicator."""
    sources = _quote_sources(notes, intake)
    debits = _gbp_debits(notes)
    line_numbers = {ln.line for ln in intake.lines}
    relevant = [n for n in notes if n.heads] or notes
    irrelevant = [f"{n.doc_id} ({n.doc_type}): {n.relevance}" for n in notes if not n.heads]
    prompt = (
        f"COMPANY RULES:\n<company_rules>\n{kb_context}\n</company_rules>\n\n"
        f"PRIOR DECISIONS FOR THIS POLICYHOLDER (from memory):\n{claims_history or 'none recorded'}\n\n"
        f"INTAKE\n{_intake_block(intake)}\n\nALL CLAIMED LINES\n{_lines_table(intake)}\n\n"
        f"SECTION ASSESSMENTS\n" + "\n".join(_dump(s) for s in sections) + "\n\n"
        f"READER NOTES (relevant documents)\n{_notes_block(relevant)}\n\n"
        f"DOCUMENTS FOUND IRRELEVANT\n" + ("\n".join(irrelevant) or "none") + "\n\n"
        "Return the CheckerReport."
    )

    def check(out: CheckerReport) -> list[str]:
        p = []
        for ind in out.indicators:
            ind.id = re.sub(r"^F0*(\d+)$", r"F\1", ind.id.strip().upper())
        ids = [i.id for i in out.indicators]
        missing = [i for i in INDICATOR_IDS if i not in ids]
        if missing:
            p.append(f"indicators missing {missing}: consider every FRD-03 indicator F1-F11.")
        if len(ids) != len(set(ids)):
            p.append("each indicator must appear exactly once.")
        for d in out.line_overrides:
            if d.line not in line_numbers:
                p.append(f"override for unknown line {d.line}.")
                continue
            _normalise_line(d, intake)
            p += [f"override {m}" for m in _line_problems(d, sources, debits)]
        return p

    out = await llm.generate(CHECKER_SYSTEM, prompt, CheckerReport, check=check, thinking=THINK_JUDGE)
    out.indicators.sort(key=lambda i: INDICATOR_IDS.index(i.id) if i.id in INDICATOR_IDS else 99)
    for d in out.line_overrides:
        _normalise_line(d, intake)
    return out


# ---------------------------------------------------------------- 5. final review

FINAL_SYSTEM = (
    PREAMBLE
    + """You are the FINAL REVIEWER. You see only the Evidence Pack (the decision record) and the company rules. Before
any money moves you check the recommended decision independently. Produce a FinalReview.

- verdict: AGREE unless there is a MATERIAL problem; then REFER. Material means it would change a line outcome or an
  amount, or a SAP-01 precondition fails on the pack's own facts: e.g. a covered item declined; an ineligible item or an
  uninsured person's cost paid; a wrong limit, sub-limit, excess or currency basis; an arithmetic error in the
  settlement; a paid or declined line without a clause ID and evidence; a PEND line; a decline outside SAP-01 Section 4.
- concerns: everything you noticed. material = true ONLY for problems of that kind. Style, extra or alternative clauses,
  wording, and alternative grounds that reach the same result are not material. Never REFER for non-material concerns.
- Fraud indicators: the score sets the band. Green (0-24) proceed; Amber (25-39) proceed and flag for post-payment QA
  sampling, which is NOT a reason to refer; Red (40+) REFER.
- preconditions: one CheckResult per SAP-01 precondition P1..P10 (id "P1".."P10"), passed true/false, with detail.
  Facts the pack does not show that code enforces at the payment gate (payee account match and change date, payment
  caps, kill switch) are passed=true with detail "Not shown in the pack; enforced by the payment gate".
- summary: 2-4 sentences: the recommended outcome, the net amount, and why you agree or refer.
"""
)


async def run_final(pack_markdown: str, kb_context: str) -> FinalReview:
    """Step 5. Sees only the Evidence Pack + rules. AGREE or REFER; refer only for material problems."""
    prompt = (
        f"COMPANY RULES:\n<company_rules>\n{kb_context}\n</company_rules>\n\n"
        f"EVIDENCE PACK:\n<evidence_pack>\n{pack_markdown}\n</evidence_pack>\n\nReturn the FinalReview."
    )

    def check(out: FinalReview) -> list[str]:
        ids = {c.id.strip().upper() for c in out.preconditions}
        missing = [f"P{i}" for i in range(1, 11) if f"P{i}" not in ids]
        return [f"preconditions missing {missing}: give one CheckResult for each of P1-P10."] if missing else []

    out = await llm.generate(FINAL_SYSTEM, prompt, FinalReview, check=check, thinking=THINK_JUDGE)
    # A REFER must rest on a material concern; an AGREE must not ignore one.
    if out.verdict == "AGREE" and any(c.material for c in out.concerns):
        out.verdict = "REFER"
    return out


# ---------------------------------------------------------------- 6. letters

LETTER_SYSTEM = (
    PREAMBLE
    + """You write customer decision letters for Larkspur Assurance, following the Customer Decision Letter Standards
(LTR-02) in the company rules. Write the letter body in Markdown, addressed to the policyholder by name and signed
"Larkspur Travel Claims". It must contain, in a sensible order:
1. The claim ID and policy number.
2. A plain-English summary of the decision.
3. The placeholder {{ITEM_TABLE}} on its own line where the itemised table goes. Code replaces it with a table of every
   item claimed (claimed, outcome, amount allowed, reason and clause) and the section totals. Do not write your own table.
4. Each excess deducted: the section and the amount.
5. The currency conversion basis: the amount debited on the card statement, or the reference rate and date.
6. For each item declined or paid in part because of the facts, the evidence relied on (quoted or fairly summarised)
   and an invitation to send further information if the customer believes the facts are wrong.
7. The payment: amount, date, reference and the last four digits of the account paid, exactly as in the decision
   summary. If no payment was made, say what happens next.
8. Complaints and Financial Ombudsman Service rights (policy Section 15).
Tone: plain English; explain, don't just cite ("Your phone was not covered because ... (D.4.4)"). Never use the word
"fraud", never imply dishonesty, never mention scores, indicators, checks for quality assurance, sampling, referral
teams or internal investigations. Use only the figures given; every figure must match the data exactly so the customer
can reproduce it. subject: short, with the claim ID.
"""
)


def _money(value: float) -> str:
    return f"£{value:,.2f}"


def _item_table(pack: EvidencePack) -> str:
    money = {m.line: m for m in pack.settlement.lines}
    claimed = {ln.line: ln for ln in pack.intake.lines}
    label = {"PAY": "Paid in full", "PAY_PARTIAL": "Paid in part", "DECLINE": "Not paid", "PEND": "Pending",
             "REFER": "Under review"}
    rows = ["| Line | Item | Claimed | Outcome | Amount allowed | Why |", "|---|---|---|---|---|---|"]
    for d in pack.final_lines:
        c = claimed.get(d.line)
        item = (c.description if c else d.head).replace("|", "/")
        m = money.get(d.line)
        allowed = _money(m.eligible_gbp) if m else _money(0)
        why = d.reason.replace("|", "/").replace("\n", " ")
        clauses = ", ".join(d.clause_ids)
        if m and d.outcome in ("PAY", "PAY_PARTIAL") and m.calculation:
            why = f"{why} ({m.calculation})" if d.outcome == "PAY_PARTIAL" else f"{m.calculation}"
        rows.append(
            f"| {d.line} | {item} | {d.claimed_currency} {d.claimed_amount:,.2f} | {label.get(d.outcome, d.outcome)} | "
            f"{allowed} | {why} ({clauses}) |"
        )
    sec = ["| Section | Eligible | After limits | Excess | Net payable |", "|---|---|---|---|---|"]
    names = {s.head: s.head_name for s in pack.sections}
    for s in pack.settlement.sections:
        sec.append(
            f"| {s.head} {names.get(s.head, '')} | {_money(s.eligible_gbp)} | {_money(s.after_limits_gbp)} | "
            f"{_money(s.excess_gbp)} | {_money(s.net_gbp)} |"
        )
    sec.append(f"| **Total** | | | | **{_money(pack.settlement.net_total_gbp)}** |")
    return "\n".join(rows) + "\n\n" + "\n".join(sec)


def _letter_problems(letter: Letter, need_placeholder: bool) -> list[str]:
    p = []
    body = letter.body_markdown.lower()
    if need_placeholder and "{{item_table}}" not in body:
        p.append("include the placeholder {{ITEM_TABLE}} on its own line where the item table goes.")
    for word in BANNED_LETTER_WORDS:
        if word in body.replace("{{item_table}}", ""):
            p.append(f'remove "{word.strip()}": letters must not mention it (LTR-02 section 2).')
    if "ombudsman" not in body:
        p.append("include the complaints procedure and Financial Ombudsman Service rights.")
    return p


async def write_decision_letter(pack: EvidencePack, decision_summary: str, kb_context: str) -> Letter:
    """Step 6. Customer letter per LTR-02 (never mentions fraud or QA flags)."""
    lines = []
    claimed = {ln.line: ln for ln in pack.intake.lines}
    money = {m.line: m for m in pack.settlement.lines}
    for d in pack.final_lines:
        c = claimed.get(d.line)
        m = money.get(d.line)
        quotes = "; ".join(f'{e.doc_id}: "{e.quote}"' for e in d.evidence[:3])
        lines.append(
            f"- line {d.line} ({d.head}) {c.description if c else ''}: claimed {d.claimed_currency} "
            f"{d.claimed_amount:.2f}; outcome {d.outcome}; allowed {_money(m.eligible_gbp) if m else '£0.00'}"
            f"{' (' + m.calculation + ')' if m and m.calculation else ''}; clauses {', '.join(d.clause_ids)}; "
            f"reason: {d.reason}; evidence: {quotes}"
        )
    sections = "\n".join(
        f"- section {s.head}: eligible {_money(s.eligible_gbp)}, after limits {_money(s.after_limits_gbp)}, "
        f"excess {_money(s.excess_gbp)}, net {_money(s.net_gbp)} ({s.calculation})"
        for s in pack.settlement.sections
    )
    prompt = (
        f"COMPANY RULES:\n<company_rules>\n{kb_context}\n</company_rules>\n\n"
        f"Claim {pack.claim_id} | policy {pack.intake.policy_number} | policyholder {pack.intake.policyholder}\n\n"
        f"DECISION SUMMARY (payment facts to use exactly):\n{decision_summary}\n\n"
        f"LINE DECISIONS:\n" + "\n".join(lines) + "\n\n"
        f"SECTION SETTLEMENT:\n{sections}\nNet total: {_money(pack.settlement.net_total_gbp)}\n\n"
        "Write the decision letter."
    )
    out = await llm.generate(
        LETTER_SYSTEM, prompt, Letter, check=lambda x: _letter_problems(x, True), thinking=THINK_EXTRACT
    )
    table = _item_table(pack)
    if "{{ITEM_TABLE}}" in out.body_markdown:
        out.body_markdown = out.body_markdown.replace("{{ITEM_TABLE}}", table)
    else:
        out.body_markdown = out.body_markdown.rstrip() + "\n\n" + table + "\n"
    return out


EVIDENCE_REQUEST_SYSTEM = (
    PREAMBLE
    + """You write a short email from Larkspur Travel Claims asking the policyholder for the evidence still needed to
finish assessing their claim. Ask for exactly the items listed: no more, no fewer. For each, say briefly what it must
show and why the policy needs it. Explain how to send it (reply to this email with the documents attached), that the
rest of the claim will be completed once it arrives, and who to contact with questions. Plain English, friendly, no
jargon. Never mention fraud, scores, indicators or internal checks. Include the claim ID and policy number in the
subject and body. body_markdown is the email body in Markdown, signed "Larkspur Travel Claims".
"""
)


async def write_evidence_request(intake: IntakeSummary, missing: list[str], kb_context: str) -> Letter:
    """Waiting step. Email asking the claimant for exactly the missing evidence."""
    seen, items = set(), []
    for m in missing:
        key = _norm(m)
        if key and key not in seen:
            seen.add(key)
            items.append(m.strip())
    prompt = (
        f"COMPANY RULES:\n<company_rules>\n{kb_context}\n</company_rules>\n\n"
        f"Claim {intake.claim_id} | policy {intake.policy_number} | policyholder {intake.policyholder}\n"
        f"Claim summary: {intake.summary}\n\nEVIDENCE TO REQUEST:\n" + "\n".join(f"- {m}" for m in items)
        + "\n\nWrite the email."
    )

    def check(x: Letter) -> list[str]:
        body = x.body_markdown.lower()
        return [f'remove "{w.strip()}".' for w in BANNED_LETTER_WORDS if w in body]

    return await llm.generate(EVIDENCE_REQUEST_SYSTEM, prompt, Letter, check=check, thinking=THINK_EXTRACT)
