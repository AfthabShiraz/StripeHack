"""Evidence Pack assembly (CHG-TRV §10). OWNER: pipeline subagent.

The pack is built by code from the agents' structured output, so every statement in it can be
traced: factual statements cite a document ID (with its manifest file), coverage statements cite a
clause ID, and every quote shows whether code found it verbatim in the cited document (✓/✗).
"""

from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime

from . import config, documents
from .schemas import (
    CheckerReport,
    DocumentNotes,
    EvidencePack,
    EvidenceRef,
    FinalReview,
    GateResult,
    IntakeSummary,
    LineDecision,
    SectionAssessment,
    Settlement,
)

PAID_OUTCOMES = {"PAY", "PAY_PARTIAL"}

# SAP-01 §3 preconditions for autonomous settlement (ACA, Tier T0)
PRECONDITIONS = [
    ("P1", "Net settlement amount ≤ £1,000."),
    ("P2", "Policy ACTIVE and premium paid; every incident date within the period of insurance."),
    ("P3", "Claimant is a named insured on the Certificate; notified within 31 days of return (GC.1)."),
    ("P4", "Governing wording reference and cover level taken from the Certificate."),
    ("P5", "Every PAY / PAY_PARTIAL line has all mandatory evidence (CHG-TRV §6); no line in PEND."),
    ("P6", "Fraud indicator score < 40 (FRD-03); 25–39 proceeds with a post-payment QA flag."),
    ("P7", "No Section C in-patient treatment, repatriation, or Section H / I claim."),
    ("P8", "Payee is the policyholder; bank account matches the verified payee account, unchanged for 14 days."),
    ("P9", "Every line outcome cites at least one clause ID and one evidence document ID."),
    ("P10", "Any partial decline satisfies SAP-01 Section 4."),
]


# ---------------------------------------------------------------- overrides


def apply_overrides(sections: list[SectionAssessment], checker: CheckerReport) -> list[LineDecision]:
    """All line decisions in line order, with the checker's overrides replacing section decisions."""
    by_line: dict[int, LineDecision] = {}
    for section in sections:
        for decision in section.lines:
            by_line.setdefault(decision.line, decision)
    for override in checker.line_overrides:
        by_line[override.line] = override
    return [by_line[n] for n in sorted(by_line)]


# ---------------------------------------------------------------- formatting helpers


def gbp(amount: float | None) -> str:
    if amount is None:
        return "—"
    sign = "-" if amount < 0 else ""
    return f"{sign}£{abs(amount):,.2f}"


def _money(amount: float | None, currency: str | None) -> str:
    if amount is None:
        return "—"
    if (currency or "").upper() == "GBP":
        return gbp(amount)
    return f"{(currency or '').upper()} {amount:,.2f}".strip()


def _cell(text: object) -> str:
    """Safe inside a markdown table cell."""
    return re.sub(r"\s+", " ", str(text if text is not None else "")).replace("|", "\\|").strip()


def _one_line(text: object) -> str:
    return re.sub(r"\s+", " ", str(text if text is not None else "")).strip()


def _join(items, empty: str = "—") -> str:
    items = [str(i) for i in items if str(i).strip()]
    return ", ".join(items) if items else empty


def _tick(passed: bool | None) -> str:
    return "pending" if passed is None else ("✓" if passed else "✗")


def parse_date(value: str | None) -> date | None:
    """Tolerant date parser for LLM-normalised dates (ISO first, then dd/mm/yyyy)."""
    if not value:
        return None
    value = value.strip()
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", value)
    if m:
        try:
            return date(int(m[1]), int(m[2]), int(m[3]))
        except ValueError:
            return None
    m = re.match(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", value)
    if m:
        try:
            return date(int(m[3]), int(m[2]), int(m[1]))
        except ValueError:
            return None
    for fmt in ("%d %B %Y", "%d %b %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    return None


def _doc_meta(claim_id: str) -> dict[str, dict]:
    """doc_id -> manifest entry (path, filename, title) for the claim and company documents."""
    meta: dict[str, dict] = {}
    try:
        for entry in documents.company_manifest():
            meta[entry["doc_id"]] = entry
    except Exception:
        pass
    try:
        for entry in documents.claim_manifest(claim_id):
            meta[entry["doc_id"]] = entry
    except Exception:
        pass
    return meta


def _policy_record(policy_number: str) -> dict:
    try:
        return documents.load_policy_record(policy_number)
    except Exception:
        return {}


def _evidence_line(ref: EvidenceRef, meta: dict[str, dict]) -> str:
    entry = meta.get(ref.doc_id)
    where = f" (`{entry['filename']}`)" if entry and entry.get("filename") else ""
    line = f"  - {'✓' if ref.verified else '✗'} **{ref.doc_id}**{where}: “{_one_line(ref.quote)}”"
    return line if ref.verified else line + " — *not found verbatim in the document*"


def _cited_docs(final_lines: list[LineDecision], checker: CheckerReport) -> set[str]:
    cited = {ref.doc_id for d in final_lines for ref in d.evidence}
    cited |= {doc for check in checker.cross_checks for doc in check.doc_ids}
    for indicator in checker.indicators:
        if indicator.triggered:
            cited |= set(re.findall(r"\b(?:E\d{2}[ab]?|M0\d|0[01]|CERT|ADMIN)\b", indicator.evidence))
    return cited


# ---------------------------------------------------------------- code-side authority checks


def _code_preconditions(
    intake: IntakeSummary, final_lines: list[LineDecision], settlement: Settlement
) -> dict[str, tuple[bool, str]]:
    """The SAP-01 preconditions code can check from the pack alone. P7 and P8 are left to the final
    review and the payments guardrails (payee/bank checks run against the policy record at payment)."""
    out: dict[str, tuple[bool, str]] = {}
    net = settlement.net_total_gbp
    out["P1"] = (net <= config.ACA_CLAIM_LIMIT_GBP, f"net {gbp(net)} vs ACA limit {gbp(config.ACA_CLAIM_LIMIT_GBP)}")

    record = _policy_record(intake.policy_number)
    if record:
        active = record.get("status") == "ACTIVE" and (record.get("premium") or {}).get("status") == "PAID"
        out["P2"] = (
            active and intake.incidents_within_period,
            f"status {record.get('status')}, premium {(record.get('premium') or {}).get('status')} (ADMIN); "
            f"incidents within period: {'yes' if intake.incidents_within_period else 'NO'} (CERT)",
        )
        wording_ok = (record.get("wording_reference") or "").strip().lower() == intake.wording_ref.strip().lower()
        level_ok = (record.get("cover_level") or "").strip().lower() == intake.cover_level.strip().lower()
        out["P4"] = (
            wording_ok and level_ok,
            f"{intake.wording_ref} / {intake.cover_level} from CERT; ADMIN shows "
            f"{record.get('wording_reference')} / {record.get('cover_level')}",
        )
    named = intake.policyholder.strip().lower() in {p.strip().lower() for p in intake.insured_persons}
    out["P3"] = (
        named and intake.notified_within_31_days,
        f"{intake.policyholder} {'is' if named else 'is NOT'} named on CERT; notified {intake.notified_on}, "
        f"returned {intake.returned_home} ({'within' if intake.notified_within_31_days else 'OUTSIDE'} 31 days, GC.1)",
    )
    pending = [d.line for d in final_lines if d.outcome in ("PEND", "REFER")]
    out["P5"] = (not pending, "no line in PEND or REFER" if not pending else f"lines {pending} in PEND/REFER")
    out["P6"] = (
        settlement.fraud_score < config.FRAUD_RED_THRESHOLD,
        f"score {settlement.fraud_score} ({settlement.fraud_band})",
    )
    weak = [d.line for d in final_lines if not d.clause_ids or not any(r.verified for r in d.evidence)]
    out["P9"] = (
        not weak,
        "every line cites a clause and a verified quote" if not weak else f"lines {weak} lack a clause or a verified quote",
    )
    declines = [d for d in final_lines if d.outcome == "DECLINE"]
    partial_ok = all(d.objective_exclusion for d in declines) and any(d.outcome in PAID_OUTCOMES for d in final_lines)
    out["P10"] = (
        partial_ok,
        f"{len(declines)} declined line(s), each on an Objective Exclusion (SAP-01 App. B); at least one line paid"
        if partial_ok
        else "a declined line has no Objective Exclusion, or no line is paid (SAP-01 4.1-4.2)",
    )
    return out


def _recommendation(final_lines: list[LineDecision], settlement: Settlement, already_paid_gbp: float) -> tuple[str, list[str]]:
    reasons = []
    open_lines = [d.line for d in final_lines if d.outcome in ("PEND", "REFER")]
    if open_lines:
        reasons.append(f"lines {open_lines} are PEND/REFER (SAP-01 P5)")
    if settlement.fraud_score >= config.FRAUD_RED_THRESHOLD:
        reasons.append(f"fraud score {settlement.fraud_score} is Red (SAP-01 P6, FRD-03)")
    if settlement.net_total_gbp > config.ACA_CLAIM_LIMIT_GBP:
        reasons.append(f"net {gbp(settlement.net_total_gbp)} exceeds the £1,000 ACA authority (SAP-01 P1)")
    if not any(d.outcome in PAID_OUTCOMES for d in final_lines):
        reasons.append("no line is payable: a full decline must be referred (SAP-01 4.2)")
    if settlement.net_total_gbp < already_paid_gbp:
        reasons.append(f"new net is below the {gbp(already_paid_gbp)} already paid; recovery needs a person (SAP-01 5.8)")
    return ("REFER" if reasons else "SETTLE"), reasons


# ---------------------------------------------------------------- the pack


def build_pack(
    claim_id: str,
    version: int,
    intake: IntakeSummary,
    notes: list[DocumentNotes],
    sections: list[SectionAssessment],
    checker: CheckerReport,
    final_lines: list[LineDecision],
    settlement: Settlement,
    *,
    final: FinalReview | None = None,
    gate: GateResult | None = None,
    already_paid_gbp: float = 0.0,
) -> EvidencePack:
    """Structured pack plus markdown in the CHG-TRV §10 layout: claim summary, coverage, document index,
    line findings (quotes + clauses + calculation), fraud screen, settlement, authority (filled later), decision.

    `final` and `gate` fill the authority check once they exist; before that it shows "pending"."""
    meta = _doc_meta(claim_id)
    record = _policy_record(intake.policy_number)
    claimed = {line.line: line for line in intake.lines}
    money_by_line = {m.line: m for m in settlement.lines}
    money_by_head = {m.head: m for m in settlement.sections}
    section_by_line = {d.line: d for s in sections for d in s.lines}
    head_names = {s.head: s.head_name for s in sections}
    for line in intake.lines:
        head_names.setdefault(line.head, line.head_name)
    cited = _cited_docs(final_lines, checker)

    md: list[str] = []
    add = md.append
    add(f"# Evidence Pack — {claim_id} (decision v{version})")
    add("")
    add(
        "Assembled by code from the Larkspur claims agents' findings, in the CHG-TRV §10 layout. Every factual "
        "statement cites a document ID (files listed in §3); every coverage statement cites a clause ID. "
        "✓ = quote found verbatim in the cited document by code; ✗ = not found."
    )

    # 1. Claim summary
    add("")
    add("## 1. Claim summary")
    add("")
    add("| Field | Value | Source |")
    add("|---|---|---|")
    add(f"| Claim ID | {claim_id} | 00 |")
    add(f"| Policy number | {_cell(intake.policy_number)} | CERT, ADMIN |")
    add(f"| Claimant / policyholder | {_cell(intake.policyholder)} | 00, CERT |")
    add(f"| Insured persons | {_cell(_join(intake.insured_persons))} | CERT |")
    add(f"| Travelling companions not insured | {_cell(_join(intake.companions_not_insured, 'none'))} | 00, CERT |")
    add(f"| Period of insurance | {_cell(intake.period_start)} to {_cell(intake.period_end)} | CERT |")
    add(f"| Returned home | {_cell(intake.returned_home)} | 00 |")
    add(f"| Claim notified | {_cell(intake.notified_on)} | 00 |")
    total_by_cur: dict[str, float] = {}
    for line in intake.lines:
        total_by_cur[line.currency.upper()] = total_by_cur.get(line.currency.upper(), 0.0) + line.amount
    claimed_text = " + ".join(_money(v, k) for k, v in total_by_cur.items())
    heads_text = _join(f"{h} {n}" for h, n in head_names.items())
    add(f"| Claimed | {len(intake.lines)} lines, {claimed_text}, across {_cell(heads_text)} | 00 |")
    add("")
    add(f"**Summary (00, 01):** {_one_line(intake.summary)}")
    if intake.evidence:
        add("")
        add("Intake evidence:")
        for ref in intake.evidence:
            add(_evidence_line(ref, meta))

    # 2. Coverage verification
    add("")
    add("## 2. Coverage verification")
    add("")
    add(f"- **Governing wording:** {intake.wording_ref}, taken from the Certificate (CERT; CHG-TRV 4.1; SAP-01 P4).")
    add(f"- **Cover level:** {intake.cover_level} (CERT; wording 1.2; CHG-TRV 4.2).")
    add(f"- **Extensions:** {_join(intake.extensions, 'none purchased')} (CERT; CHG-TRV 4.2).")
    add(f"- **Insured persons:** {_join(intake.insured_persons)}; cover applies only to them (CERT; wording 1.3).")
    if record:
        premium = record.get("premium") or {}
        add(
            f"- **Policy status:** {record.get('status')}, premium {premium.get('status')}"
            f"{' on ' + premium['paid_on'] if premium.get('paid_on') else ''} (ADMIN; SAP-01 P2)."
        )
    start, end = parse_date(intake.period_start), parse_date(intake.period_end)
    add(
        f"- **Incidents within the period of insurance** {intake.period_start} – {intake.period_end}: "
        f"{'yes' if intake.incidents_within_period else 'NO'} (CERT; wording 2.7; SAP-01 P2)."
    )
    add("")
    add("| Line | Head | Incident date | In period | Source |")
    add("|---|---|---|---|---|")
    for line in intake.lines:
        when = parse_date(line.incident_date)
        inside = "—" if not (when and start and end) else ("✓" if start <= when <= end else "✗")
        add(f"| {line.line} | {line.head} | {_cell(line.incident_date or '—')} | {inside} | 00 |")
    returned, notified = parse_date(intake.returned_home), parse_date(intake.notified_on)
    days = f" ({(notified - returned).days} days after return)" if returned and notified else ""
    add("")
    add(
        f"- **Notification:** notified {intake.notified_on}, returned {intake.returned_home}{days}: "
        f"{'within' if intake.notified_within_31_days else 'NOT within'} 31 days (00; GC.1; SAP-01 P3)."
    )

    # 3. Document index
    add("")
    add("## 3. Document index")
    add("")
    relied = sum(1 for n in notes if n.doc_id in cited)
    irrelevant = sum(1 for n in notes if not n.heads)
    add(f"{len(notes)} documents received: {relied} relied on, {irrelevant} irrelevant, {len(notes) - relied - irrelevant} considered but not relied on.")
    add("")
    add("| Doc | File | Type | Heads | Lines | Status | Reason |")
    add("|---|---|---|---|---|---|---|")
    for n in notes:
        entry = meta.get(n.doc_id) or {}
        kind = n.doc_type + ("" if n.is_original else f" (translation of {n.translation_of or '?'})")
        if not n.heads:
            status = "Irrelevant"
        elif n.doc_id in cited:
            status = "Relied on"
        elif not n.is_original and n.translation_of and n.translation_of in cited:
            status = f"Disregarded: the original {n.translation_of} is relied on (CHG-TRV §5)"
        else:
            status = "Considered, not relied on"
        add(
            f"| {n.doc_id} | `{_cell(entry.get('path', ''))}` | {_cell(kind)} | {_cell(_join(n.heads))} | "
            f"{_cell(_join(n.supports_lines))} | {_cell(status)} | {_cell(n.relevance)} |"
        )

    # 4. Line-item findings
    add("")
    add("## 4. Line-item findings")
    for d in final_lines:
        c = claimed.get(d.line)
        lm = money_by_line.get(d.line)
        original = section_by_line.get(d.line)
        overridden = original is not None and original != d
        add("")
        title = c.description if c else ""
        add(f"### Line {d.line} — {d.head} {head_names.get(d.head, '')}: {_one_line(title)}")
        add("")
        claimed_bits = [_money(d.claimed_amount, d.claimed_currency)]
        if c and c.incident_date:
            claimed_bits.append(f"incident {c.incident_date}")
        if c and c.receipt_ref:
            claimed_bits.append(f"receipt {c.receipt_ref}")
        add(f"- **Claimed:** {', '.join(claimed_bits)} (00)")
        eligible = gbp(lm.eligible_gbp) if lm else "—"
        add(f"- **Outcome:** **{d.outcome}** — eligible **{eligible}**" + (" *(checker override)*" if overridden else ""))
        if lm:
            add(f"- **Calculation:** {_one_line(lm.calculation)} (basis {d.basis}; CHG-TRV §7)")
        if d.eligible_items:
            add(f"- **Eligible items:** {_one_line(_join(d.eligible_items))}")
        if d.excluded_items:
            add(f"- **Excluded items:** {_one_line(_join(d.excluded_items))}")
        if d.sub_limit:
            add(f"- **Counts toward sub-limit:** {d.sub_limit}")
        add(f"- **Clauses:** {_join(d.clause_ids, 'none cited')}")
        if d.objective_exclusion:
            add(f"- **Objective Exclusion:** {d.objective_exclusion} (SAP-01 Appendix B)")
        add(f"- **Reason:** {_one_line(d.reason)}")
        if d.evidence:
            ok = sum(1 for r in d.evidence if r.verified)
            add(f"- **Evidence** ({ok}/{len(d.evidence)} quotes verified):")
            for ref in d.evidence:
                add(_evidence_line(ref, meta))
        else:
            add("- **Evidence:** none cited")
        if d.missing_evidence:
            add(f"- **Missing evidence (PEND):** {_one_line(_join(d.missing_evidence))}")
        if overridden and original is not None:
            add(f"- *Section agent had {original.outcome}: {_one_line(original.reason)}*")

    # 5. Consistency & fraud screen
    add("")
    add("## 5. Consistency & fraud screen")
    add("")
    if checker.cross_checks:
        add("| Kind | Lines | Documents | Finding | Effect |")
        add("|---|---|---|---|---|")
        for check in checker.cross_checks:
            add(
                f"| {check.kind} | {_cell(_join(check.lines))} | {_cell(_join(check.doc_ids))} | "
                f"{_cell(check.description)} | {_cell(check.effect)} |"
            )
    else:
        add("No cross-document contradictions, duplicates or uninsured-person costs found.")
    add("")
    add("| Indicator | Name | Triggered | Weight | Evidence |")
    add("|---|---|---|---|---|")
    for ind in checker.indicators:
        add(
            f"| {ind.id} | {_cell(ind.name)} | {'**yes**' if ind.triggered else 'no'} | "
            f"{ind.weight if ind.triggered else '—'} | {_cell(ind.evidence)} |"
        )
    triggered = [i.id for i in checker.indicators if i.triggered]
    band_note = {
        "GREEN": "below 25: proceed",
        "AMBER": "25–39: may proceed, flag for post-payment QA sampling",
        "RED": "40 or more: refer to SIU, no autonomous payment",
    }.get(settlement.fraud_band, "")
    add("")
    add(
        f"**Total score: {settlement.fraud_score} — {settlement.fraud_band}** ({band_note}; FRD-03, SAP-01 P6). "
        f"Triggered: {_join(triggered, 'none')}."
    )
    if checker.notes:
        add("")
        add(f"Checker notes: {_one_line(checker.notes)}")

    # 6. Settlement calculation
    add("")
    add("## 6. Settlement calculation")
    add("")
    add("| Section | Eligible | After limits | Excess | Net | Calculation |")
    add("|---|---|---|---|---|---|")
    for sm in settlement.sections:
        add(
            f"| {sm.head} {_cell(head_names.get(sm.head, ''))} | {gbp(sm.eligible_gbp)} | {gbp(sm.after_limits_gbp)} | "
            f"{gbp(sm.excess_gbp)} | **{gbp(sm.net_gbp)}** | {_cell(sm.calculation)} |"
        )
    add(f"| **Total** | | | | **{gbp(settlement.net_total_gbp)}** | |")
    add("")
    for s in sections:
        subs = _join(f"{x.code} {gbp(x.limit_gbp)}" for x in s.sub_limits)
        excess = "waived" if s.excess_waived else gbp(s.excess_gbp)
        add(
            f"- **{s.head} {s.head_name}:** section limit {gbp(s.section_limit_gbp)}; sub-limits {subs}; "
            f"excess {excess} ({_one_line(s.excess_reason)}); clauses {_join(s.clause_ids)}."
        )
    add("")
    add(f"**Overall net payable: {gbp(settlement.net_total_gbp)}** (GC.5: paid in GBP).")
    if already_paid_gbp:
        add(
            f"Already paid under earlier decisions: {gbp(already_paid_gbp)}; this decision pays the difference, "
            f"{gbp(round(settlement.net_total_gbp - already_paid_gbp, 2))} (SAP-01 5.2)."
        )

    # 7. Authority check
    add("")
    add("## 7. Authority check (SAP-01)")
    add("")
    tier_ok = settlement.net_total_gbp <= config.ACA_CLAIM_LIMIT_GBP
    add(
        f"Tier: **{'T0 — Autonomous Claims Agent' if tier_ok else 'T1 or above — beyond ACA authority'}** "
        f"(net {gbp(settlement.net_total_gbp)}; SAP-01 §2)."
    )
    add("")
    code_checks = _code_preconditions(intake, final_lines, settlement)
    reviewed = {p.id.strip().upper(): p for p in (final.preconditions if final else [])}
    add("| ID | Condition | Code check | Final review |")
    add("|---|---|---|---|")
    for pid, text in PRECONDITIONS:
        code = code_checks.get(pid)
        code_text = f"{_tick(code[0])} {_cell(code[1])}" if code else "— (final review / payment guardrails)"
        review = reviewed.get(pid)
        if final is None:
            review_text = "pending"
        elif review is None:
            review_text = "not stated"
        else:
            review_text = f"{_tick(review.passed)} {_cell(review.detail)}"
        add(f"| {pid} | {_cell(text)} | {code_text} | {review_text} |")
    add("")
    if gate is None:
        add("Payment gate (code + payments guardrails): **pending** — runs after the final review.")
    else:
        add(f"Payment gate (code + payments guardrails): **{'passed' if gate.passed else 'FAILED'}**; amount to pay now {gbp(gate.amount_to_pay_gbp)}.")
        add("")
        add("| Check | Result | Detail |")
        add("|---|---|---|")
        for check in gate.checks:
            add(f"| {_cell(check.id)} {_cell(check.description)} | {_tick(check.passed)} | {_cell(check.detail)} |")

    # 8. Recommended decision
    add("")
    add("## 8. Recommended decision")
    add("")
    add("| Line | Head | Item | Outcome | Payable |")
    add("|---|---|---|---|---|")
    for d in final_lines:
        c = claimed.get(d.line)
        lm = money_by_line.get(d.line)
        add(f"| {d.line} | {d.head} | {_cell(c.description if c else '')} | {d.outcome} | {gbp(lm.eligible_gbp) if lm else '—'} |")
    add("")
    overall, reasons = _recommendation(final_lines, settlement, already_paid_gbp)
    if overall == "SETTLE":
        to_pay = round(settlement.net_total_gbp - already_paid_gbp, 2)
        add(
            f"**Overall: SETTLE — net {gbp(settlement.net_total_gbp)}**, pay {gbp(to_pay)} now to the verified payee "
            f"(GC.6; SAP-01 P8, 5.3 reference \"{config.PAYMENT_REFERENCE_PREFIX} {claim_id}\")."
        )
        if settlement.fraud_band == "AMBER":
            add("Flag for post-payment QA sampling (FRD-03 Amber; SAP-01 P6).")
    else:
        add(f"**Overall: REFER to a T1 claims handler** — {'; '.join(reasons)}.")
    if final is not None:
        add("")
        add(f"Final review: **{final.verdict}** — {_one_line(final.summary)}")
        for concern in final.concerns:
            where = f"line {concern.line}: " if concern.line is not None else ""
            add(f"- {'**material** ' if concern.material else ''}{where}{_one_line(concern.concern)}")

    return EvidencePack(
        claim_id=claim_id,
        version=version,
        intake=intake,
        documents=notes,
        sections=sections,
        checker=checker,
        final_lines=final_lines,
        settlement=settlement,
        markdown="\n".join(md) + "\n",
    )


def pack_sha256(pack: EvidencePack) -> str:
    canonical = json.dumps(pack.model_dump(mode="json"), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
