"""Runs the steps in order and handles evidence that arrives later. OWNER: pipeline subagent.

Artifacts under runs/<claim_id>/:
    state.json                  ClaimState (UI polls it; every log() saves it)
    intake.json                 IntakeSummary
    notes/<doc_id>.json         DocumentNotes per received document (quotes verified)
    sections/<head>.json        latest SectionAssessment per head (reused when a head isn't affected)
    requests/<n>.md             evidence-request emails (WAITING), n = 1, 2, ...
    v<n>/checker.json           CheckerReport
    v<n>/final_input.md         the exact Evidence Pack markdown the final agent reviewed
    v<n>/final.json             FinalReview
    v<n>/payment.json           PaymentRecord (written before the letter, SAP-01 App. A; absent if referred)
    v<n>/pack.json, pack.md     EvidencePack with the authority check filled (pack_sha256 is over pack.json)
    v<n>/letter.md              decision letter
    v<n>/decision.json          DecisionRecord
"""

from __future__ import annotations

import asyncio
import functools
import os
import re
from contextlib import contextmanager
from dataclasses import dataclass, field

from pydantic import BaseModel

from . import agents, config, documents, gate, memory, money, packs, payments, quotes, state
from .packs import gbp
from .schemas import (
    Answer,
    CheckResult,
    ClaimDocument,
    ClaimState,
    DecisionRecord,
    DocItem,
    DocumentNotes,
    EvidencePack,
    EvidenceRef,
    Fact,
    GateResult,
    Concern,
    FinalReview,
    IntakeSummary,
    LineDecision,
    LineMoney,
    PaymentRecord,
    SectionAssessment,
    Settlement,
)

DEFAULT_HOLD_BACK = ["E12", "E20", "M02", "M03"]  # police report original, operator refusal (B2 PENDs without it), 29-30 Sep emails
READER_CONCURRENCY = 4
POLICY_DOC_IDS = ["CERT", "ADMIN"]
CLAIM_FORM_ID = "00"
PAID_STATUSES = {"PAID", "DRY_RUN", "ALREADY_PAID", "NOTHING_TO_PAY"}


def live_payments_enabled() -> bool:
    """Real Stripe test-mode transfers only when LIVE_PAYMENTS=1 (or live=True / --live); DRY_RUN otherwise,
    so ordinary runs never use up a claim's idempotency keys."""
    return os.environ.get("LIVE_PAYMENTS", "").strip().lower() in {"1", "true", "yes"}

_active: set[str] = set()


# ---------------------------------------------------------------- public API


async def start_claim(
    claim_id: str, hold_back: list[str] | None = None, *, concurrency: int | None = None, live: bool | None = None
) -> ClaimState:
    """New claim: receive every document in the claim manifest except hold_back (doc IDs),
    plus the policy's CERT and ADMIN, then run intake, readers, and the decision cycle.
    Starts fresh: any earlier runs/<claim_id>/ is cleared (Cognee memory and Stripe are not)."""
    with _exclusive(claim_id):
        manifest = _manifest_ids(claim_id)
        hold = _resolve_ids(claim_id, DEFAULT_HOLD_BACK if hold_back is None else hold_back)
        if CLAIM_FORM_ID in hold:
            raise ValueError("The claim form (00) starts the claim; it can't be held back")
        state.reset_claim(claim_id)
        state.update_state(claim_id, status="PROCESSING")
        try:
            run = _Run(claim_id, concurrency or READER_CONCURRENCY, live=_live(live))
            await _start(run, [d for d in manifest if d not in hold], hold)
        except BaseException as exc:
            _fail(claim_id, exc)
            raise
        return state.load_state(claim_id)


async def add_documents(
    claim_id: str, doc_ids: list[str], *, concurrency: int | None = None, live: bool | None = None
) -> ClaimState:
    """Later evidence: read only the new documents, re-run only the heads they affect (plus any waiting
    heads), then the rest of the decision cycle. A new decision pays only the difference.
    With no new documents on a claim in ERROR, resumes it (re-reads unread docs, re-runs every head)."""
    with _exclusive(claim_id):
        current = state.load_state(claim_id)
        intake = state.read_model(claim_id, "intake.json", IntakeSummary)
        if intake is None:
            raise ValueError(f"{claim_id} hasn't been started (no intake yet): run start_claim first")
        ids = _resolve_ids(claim_id, doc_ids)
        new = [d for d in ids if d not in current.documents_received]
        resuming = current.status in ("ERROR", "PROCESSING")
        if not new and not resuming:
            state.log(claim_id, "intake", f"No new documents ({', '.join(ids) or 'none given'} already received); "
                      f"decision v{current.decision_version} stands")
            return current
        state.update_state(claim_id, status="PROCESSING")
        try:
            run = _Run(claim_id, concurrency or READER_CONCURRENCY, live=_live(live), intake=intake)
            await _add(run, new, resuming)
        except BaseException as exc:
            _fail(claim_id, exc)
            raise
        return state.load_state(claim_id)


async def resume(claim_id: str, *, concurrency: int | None = None, live: bool | None = None) -> ClaimState:
    """Continue a claim that stopped with ERROR."""
    return await add_documents(claim_id, [], concurrency=concurrency, live=live)


def pending_documents(claim_id: str) -> list[str]:
    """Doc IDs in the claim folder that haven't been received yet."""
    received = set(state.load_state(claim_id).documents_received)
    return [d for d in _manifest_ids(claim_id) if d not in received]


async def ask(claim_id: str, question: str) -> Answer:
    await memory.setup()
    return await memory.ask(question, claim_id)


def latest_decision(claim_id: str) -> DecisionRecord | None:
    version = state.load_state(claim_id).decision_version
    return state.read_model(claim_id, f"v{version}/decision.json", DecisionRecord) if version else None


def latest_pack(claim_id: str) -> EvidencePack | None:
    version = state.load_state(claim_id).decision_version
    return state.read_model(claim_id, f"v{version}/pack.json", EvidencePack) if version else None


# ---------------------------------------------------------------- run context


@dataclass
class _Run:
    claim_id: str
    concurrency: int
    live: bool = False  # False = DRY_RUN payments
    intake: IntakeSummary | None = None
    received: list[str] = field(default_factory=list)  # doc IDs received, in arrival order
    texts: dict[str, str] = field(default_factory=dict)  # doc ID / filename / path -> text (quote checks)
    notes: dict[str, DocumentNotes] = field(default_factory=dict)  # doc ID -> notes written by this pipeline

    def __post_init__(self):
        self.sem = asyncio.Semaphore(max(1, self.concurrency))
        self.mem_lock = asyncio.Lock()  # Cognee writes one at a time


def _live(live: bool | None) -> bool:
    return live_payments_enabled() if live is None else bool(live)


@contextmanager
def _exclusive(claim_id: str):
    if claim_id in _active:
        raise RuntimeError(f"{claim_id} is already being processed")
    _active.add(claim_id)
    try:
        yield
    finally:
        _active.discard(claim_id)


def _fail(claim_id: str, exc: BaseException) -> None:
    message = f"{type(exc).__name__}: {exc}" if str(exc) else type(exc).__name__
    try:
        state.log(claim_id, "error", message)
        state.update_state(claim_id, status="ERROR")
    except Exception:
        pass


async def _gather(coros):
    """gather that cancels the siblings when one fails, re-raising the original exception."""
    tasks = [asyncio.ensure_future(c) for c in coros]
    try:
        return await asyncio.gather(*tasks)
    except BaseException:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise


# ---------------------------------------------------------------- documents


def _manifest_ids(claim_id: str) -> list[str]:
    try:
        return documents.claim_doc_ids(claim_id)
    except FileNotFoundError:
        raise ValueError(f"No claim folder with a manifest at data/claims/{claim_id}") from None


def _resolve_ids(claim_id: str, ids) -> list[str]:
    """Manifest doc IDs (case-insensitive, comma lists allowed); unknown IDs raise."""
    manifest = _manifest_ids(claim_id)
    by_lower = {d.lower(): d for d in manifest}
    out, unknown = [], []
    for raw in ids or []:
        for part in str(raw).split(","):
            key = part.strip()
            if not key:
                continue
            match = by_lower.get(key.lower())
            if match is None:
                unknown.append(key)
            elif match not in out:
                out.append(match)
    if unknown:
        raise ValueError(f"Unknown document ID(s) for {claim_id}: {', '.join(unknown)}. Known: {', '.join(manifest)}")
    return out


def _load_documents(claim_id: str, ids: list[str]) -> list[ClaimDocument]:
    claim_ids = [d for d in ids if d not in POLICY_DOC_IDS]
    docs = documents.claim_documents(claim_id, claim_ids) if claim_ids else []
    wanted = [d for d in ids if d in POLICY_DOC_IDS]
    if wanted:
        by_id = {d.doc_id: d for d in documents.policy_documents(documents.policy_number_for_claim(claim_id))}
        missing = [d for d in wanted if d not in by_id]
        if missing:
            raise RuntimeError(f"Policy documents not found for {claim_id}: {', '.join(missing)}")
        docs += [by_id[d] for d in wanted]
    return docs


def _text_map(docs: list[ClaimDocument]) -> dict[str, str]:
    """doc ID -> text. quotes.verify_quotes maps loose citations (filename, "E18") to these IDs itself."""
    return {doc.doc_id: doc.text for doc in docs}


@functools.lru_cache(maxsize=1)
def _company_texts() -> dict[str, str]:
    """Governing company documents, so quotes citing e.g. FX-REF or the wording can be verified too.
    Superseded wordings and the (non-contractual) brochure are left out."""
    try:
        docs = [doc for entry, doc in documents.company_documents()
                if not entry.get("superseded") and doc.doc_id != "BROCHURE"]
    except Exception:
        return {}
    return _text_map(docs)


def _quote_count(obj) -> tuple[int, int]:
    ok = total = 0

    def walk(x):
        nonlocal ok, total
        if isinstance(x, (EvidenceRef, Fact, DocItem)):
            total += 1
            ok += bool(x.verified)
        if isinstance(x, BaseModel):
            for name in type(x).model_fields:
                walk(getattr(x, name))
        elif isinstance(x, list):
            for item in x:
                walk(item)

    walk(obj)
    return ok, total


def _quotes_text(obj) -> str:
    ok, total = _quote_count(obj)
    return f" · {ok}/{total} quotes verified" if total else ""


# ---------------------------------------------------------------- messages


_LANGS = {"en": "English", "pt": "Portuguese", "es": "Spanish", "fr": "French", "de": "German", "it": "Italian"}


def _short(text: str, n: int = 110) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    return text if len(text) <= n else text[: n - 1] + "…"


def _lines_text(nums) -> str:
    nums = sorted(set(nums))
    if not nums:
        return "no lines"
    runs, start, prev = [], nums[0], nums[0]
    for n in nums[1:] + [None]:
        if n is not None and n == prev + 1:
            prev = n
            continue
        runs.append(str(start) if start == prev else f"{start}–{prev}")
        if n is not None:
            start = prev = n
    return ("line " if len(nums) == 1 else "lines ") + ", ".join(runs)


def _reader_message(doc: ClaimDocument, notes: DocumentNotes) -> str:
    lang = notes.language or doc.language or ""
    lang = _LANGS.get(lang.strip().lower()[:2], lang) if len(lang.strip()) <= 5 else lang
    origin = "original" if notes.is_original else f"translation of {notes.translation_of or 'another document'}"
    kind = notes.doc_type.replace("_", " ")
    bits = ", ".join(x for x in (origin, lang) if x)
    if notes.heads:
        target = f"evidence for {', '.join(notes.heads)}"
        if notes.supports_lines:
            target += f" ({_lines_text(notes.supports_lines)})"
    else:
        target = f"irrelevant ({_short(notes.relevance, 80)})"
    return f"Reader {doc.doc_id}: {kind} ({bits}) → {target}{_quotes_text(notes)}"


def _letter_md(letter) -> str:
    return f"# {letter.subject}\n\n{letter.body_markdown.strip()}\n"


def _checks_text(checks: list[CheckResult]) -> str:
    return "; ".join(f"{c.id}: {_short(c.detail or c.description, 140)}" for c in checks)


# ---------------------------------------------------------------- start / add


async def _start(run: _Run, receive: list[str], hold: list[str]) -> None:
    claim_id = run.claim_id
    docs = _load_documents(claim_id, receive + POLICY_DOC_IDS)
    by_id = {d.doc_id: d for d in docs}
    if CLAIM_FORM_ID not in by_id:
        raise ValueError(f"{claim_id} has no claim form (00) in its manifest")
    run.received = [d.doc_id for d in docs]
    run.texts = {**_company_texts(), **_text_map(docs)}
    state.update_state(claim_id, documents_received=run.received)
    held = f"; held back until later: {', '.join(hold)}" if hold else ""
    policy_number = documents.policy_number_for_claim(claim_id)
    state.log(claim_id, "intake", f"Claim {claim_id} received: {len(docs) - 2} claim documents{held}; "
              f"policy {policy_number} Certificate (CERT) and PolicyCore record (ADMIN) attached")

    await memory.setup()
    await memory.load_kb()
    state.log(claim_id, "memory", f"Cognee memory ready: company rules ({config.KB_DATASET}), "
              f"claim dataset {config.claim_dataset(claim_id)}")

    state.log(claim_id, "intake", "Intake agent reading the claim form (00), Certificate (CERT) and policy record (ADMIN)…")
    intake = await agents.run_intake(by_id[CLAIM_FORM_ID], by_id["CERT"], by_id["ADMIN"])
    intake.claim_id = claim_id
    for line in intake.lines:
        line.head = line.head.strip().upper()
    quotes.verify_quotes(intake, run.texts)
    rel = state.write_artifact(claim_id, "intake.json", intake)
    run.intake = intake
    heads = _heads(intake)
    per_head = "; ".join(
        f"{h} {name} ({_lines_text([l.line for l in intake.lines if l.head == h])})" for h, name in heads.items()
    )
    state.log(claim_id, "intake", f"Intake: {len(intake.lines)} claimed lines — {per_head}. Wording {intake.wording_ref}, "
              f"{intake.cover_level}, extensions: {', '.join(intake.extensions) or 'none'}; insured: "
              f"{', '.join(intake.insured_persons)}{_quotes_text(intake)}", rel)

    await _read_documents(run, docs)
    await _decision_cycle(run, None)


async def _add(run: _Run, new: list[str], resuming: bool) -> None:
    claim_id, intake = run.claim_id, run.intake
    current = state.load_state(claim_id)
    run.received = list(current.documents_received)
    for doc_id in run.received:
        notes = state.read_model(claim_id, f"notes/{doc_id}.json", DocumentNotes)
        if notes is not None:
            run.notes[doc_id] = notes
    unread = [d for d in run.received if d not in run.notes] if resuming else []
    new_docs = _load_documents(claim_id, new + unread)
    run.texts = {**_company_texts(), **_text_map(_load_documents(claim_id, run.received) + new_docs)}
    if new:
        state.log(claim_id, "intake", f"New evidence received: {', '.join(new)}")
    if resuming:
        state.log(claim_id, "intake", "Resuming after an interruption" + (f"; re-reading {', '.join(unread)}" if unread else ""))

    await memory.setup()
    if new_docs:
        await _read_documents(run, new_docs)
    if new:
        run.received += [d for d in new if d not in run.received]
        with state.mutate(claim_id) as s:
            s.documents_received += [d for d in new if d not in s.documents_received]

    heads = _heads(intake)
    sections = {h: state.read_model(claim_id, _section_rel(h), SectionAssessment) for h in heads}
    from_new = {h for d in new + unread for h in run.notes[d].heads if h in heads}
    waiting = {h for h, s in sections.items() if s and any(l.outcome == "PEND" for l in s.lines)}
    missing = {h for h, s in sections.items() if s is None}
    if resuming:
        to_run = set(heads)
        why = "resuming: re-assessing every head"
    else:
        to_run = from_new | waiting | missing
        why = "; ".join(x for x in (
            f"new evidence for {', '.join(sorted(from_new))}" if from_new else "",
            f"waiting on {', '.join(sorted(waiting))}" if waiting else "",
            f"no earlier decision for {', '.join(sorted(missing))}" if missing else "",
        ) if x) or "no head affected"
    state.log(claim_id, "section", f"Affected heads: {', '.join(h for h in heads if h in to_run) or 'none'} ({why})")
    await _decision_cycle(run, to_run)


async def _read_documents(run: _Run, docs: list[ClaimDocument]) -> None:
    claim_id = run.claim_id
    state.log(claim_id, "reader", f"Reader agents reading {len(docs)} documents ({run.concurrency} at a time)…")

    async def read(doc: ClaimDocument) -> DocumentNotes:
        async with run.sem:
            try:
                notes = await agents.run_reader(doc, run.intake)
            except Exception as exc:
                raise RuntimeError(f"Reader {doc.doc_id} failed: {exc}") from exc
        notes.doc_id = doc.doc_id
        quotes.verify_quotes(notes, {doc.doc_id: doc.text})
        rel = state.write_artifact(claim_id, f"notes/{doc.doc_id}.json", notes)
        async with run.mem_lock:
            await memory.remember_document(claim_id, doc)
            await memory.remember_notes(claim_id, notes)
        run.notes[doc.doc_id] = notes
        state.log(claim_id, "reader", _reader_message(doc, notes), rel)
        return notes

    results = await _gather([read(d) for d in docs])
    relevant = sum(1 for n in results if n.heads)
    state.log(claim_id, "memory", f"{len(results)} documents and their notes stored in Cognee "
              f"({config.claim_dataset(claim_id)}): {relevant} relevant, {len(results) - relevant} irrelevant")


# ---------------------------------------------------------------- decision cycle


def _heads(intake: IntakeSummary) -> dict[str, str]:
    heads: dict[str, str] = {}
    for line in intake.lines:
        heads.setdefault(line.head, line.head_name)
    return heads


def _section_rel(head: str) -> str:
    return f"sections/{re.sub(r'[^A-Za-z0-9_-]', '_', head)}.json"


def _merge_notes(run: _Run, from_memory: list[DocumentNotes] | None, head: str | None) -> list[DocumentNotes]:
    """Notes from Cognee, limited to documents received in this run (memory may hold an earlier run's
    notes), with any the pipeline wrote but memory didn't return added back (logged). Section agents
    always also get the policy documents (CERT, ADMIN)."""
    received = set(run.received)
    chosen: dict[str, DocumentNotes] = {}
    for notes in from_memory or []:
        if notes.doc_id in received and notes.doc_id not in chosen:
            chosen[notes.doc_id] = run.notes.get(notes.doc_id, notes)
    expected = [d for d, n in run.notes.items() if d in received and (head is None or head in n.heads)]
    missed = [d for d in expected if d not in chosen]
    if missed:
        scope = f"head {head}" if head else "the claim"
        state.log(run.claim_id, "memory", f"Memory returned {len(expected) - len(missed)} of {len(expected)} notes for "
                  f"{scope}; added {', '.join(missed)} from the pipeline's copy")
        for d in missed:
            chosen[d] = run.notes[d]
    if head is not None:
        for d in POLICY_DOC_IDS:
            if d not in chosen and d in run.notes:
                chosen[d] = run.notes[d]
    order = {d: i for i, d in enumerate(run.received)}
    return sorted(chosen.values(), key=lambda n: order.get(n.doc_id, len(order)))


def _normalise_section(run: _Run, section: SectionAssessment, head: str, head_name: str) -> SectionAssessment:
    """One decision per claimed line of this head: extra lines dropped, missing lines REFERred."""
    section.head = head
    section.head_name = section.head_name or head_name
    expected = {l.line: l for l in run.intake.lines if l.head == head}
    kept, seen = [], set()
    for decision in section.lines:
        if decision.line in expected and decision.line not in seen:
            decision.head = head
            kept.append(decision)
            seen.add(decision.line)
    for n, claimed in expected.items():
        if n not in seen:
            kept.append(LineDecision(
                line=n, head=head, outcome="REFER", claimed_amount=claimed.amount, claimed_currency=claimed.currency,
                basis="NONE", eligible_items=[], excluded_items=[], clause_ids=[], evidence=[],
                reason="The section agent returned no decision for this line; a claims handler must decide it.",
                missing_evidence=[],
            ))
            state.log(run.claim_id, "section", f"Section {head}: no decision returned for line {n}; marked REFER")
    section.lines = sorted(kept, key=lambda d: d.line)
    return section


async def _assess_head(run: _Run, head: str, head_name: str) -> SectionAssessment:
    claim_id, intake = run.claim_id, run.intake
    try:
        notes = _merge_notes(run, await memory.get_notes(claim_id, head), head)
        kb = await memory.kb_context("section", intake.wording_ref, head, head_name)
        section = await agents.run_section(head, head_name, intake, notes, kb)
    except Exception as exc:
        raise RuntimeError(f"Section {head} ({head_name}) failed: {exc}") from exc
    section = _normalise_section(run, section, head, head_name)
    quotes.verify_quotes(section, run.texts)
    rel = state.write_artifact(claim_id, _section_rel(head), section)
    by_outcome: dict[str, list[int]] = {}
    for d in section.lines:
        by_outcome.setdefault(d.outcome, []).append(d.line)
    summary = "; ".join(f"{o} {_lines_text(ls)}" for o, ls in by_outcome.items())
    needs = [m for d in section.lines if d.outcome == "PEND" for m in d.missing_evidence]
    state.log(claim_id, "section", f"Section {head} ({section.head_name}): {summary} — from {len(notes)} documents' notes"
              + (f"; needs: {'; '.join(needs)}" if needs else "") + _quotes_text(section), rel)
    return section


async def _decision_cycle(run: _Run, heads_to_run: set[str] | None) -> None:
    claim_id = run.claim_id
    heads = _heads(run.intake)
    sections: dict[str, SectionAssessment] = {}
    to_run = []
    for head in heads:
        saved = None
        if heads_to_run is not None and head not in heads_to_run:
            saved = state.read_model(claim_id, _section_rel(head), SectionAssessment)
        if saved is None:
            to_run.append(head)
        else:
            sections[head] = saved
    reused = [h for h in heads if h in sections]
    if to_run:
        state.log(claim_id, "section", f"Section agents assessing {', '.join(f'{h} ({heads[h]})' for h in to_run)}"
                  + (f"; reusing the latest decisions for {', '.join(reused)}" if reused else ""))
    results = await _gather([_assess_head(run, h, heads[h]) for h in to_run])
    sections.update(zip(to_run, results))
    ordered = [sections[h] for h in heads]

    pending = [(s, d) for s in ordered for d in s.lines if d.outcome == "PEND"]
    if pending:
        await _request_evidence(run, pending)
    else:
        await _decide(run, ordered)


async def _request_evidence(run: _Run, pending: list[tuple[SectionAssessment, LineDecision]]) -> None:
    claim_id, intake = run.claim_id, run.intake
    claimed = {l.line: l for l in intake.lines}
    missing: list[str] = []
    for section, d in pending:
        desc = claimed[d.line].description if d.line in claimed else section.head_name
        for item in d.missing_evidence or [f"evidence supporting line {d.line}"]:
            text = f"Line {d.line} ({_short(desc, 60)}): {item}"
            if text not in missing:
                missing.append(text)
    kb = await memory.kb_context("letter", intake.wording_ref)
    letter = await agents.write_evidence_request(intake, missing, kb)
    folder = state.artifact_path(claim_id, "requests")
    numbers = [int(p.stem) for p in folder.glob("*.md") if p.stem.isdigit()] if folder.exists() else []
    n = max(numbers, default=0) + 1
    rel = state.write_artifact(claim_id, f"requests/{n}.md", _letter_md(letter))
    state.update_state(claim_id, status="WAITING", waiting_for=missing)
    heads = sorted({s.head for s, _ in pending})
    state.log(claim_id, "waiting", f"WAITING for evidence on {_lines_text([d.line for _, d in pending])} "
              f"(head {', '.join(heads)}): {'; '.join(missing)}. Request #{n} sent to the claimant", rel)


def _outcome(gate_result: GateResult, record: PaymentRecord | None, net: float, already: float):
    """(status, paid_now, paid_total)."""
    if not gate_result.passed or record is None or record.status not in PAID_STATUSES:
        return "REFERRED", 0.0, already
    if record.status == "ALREADY_PAID":
        return "PAID", 0.0, round(max(already, net), 2)
    if record.status == "NOTHING_TO_PAY" or record.amount_gbp <= 0:
        return "NO_PAYMENT_DUE", 0.0, already
    return "PAID", round(record.amount_gbp, 2), round(already + record.amount_gbp, 2)


def _decision_summary(claim_id: str, version: int, status: str, settlement: Settlement, paid_now: float,
                      paid_total: float, already: float, final_lines: list[LineDecision],
                      record: PaymentRecord | None = None, policy_number: str = "") -> str:
    ref = f"{config.PAYMENT_REFERENCE_PREFIX} {claim_id}"
    try:
        last4 = documents.load_policy_record(policy_number)["verified_payee_account"]["account_number_last4"]
    except Exception:
        last4 = "on file"
    paid_on = (record.created_at if record else documents.now_iso())[:10]
    net = settlement.net_total_gbp
    money_by_line = {m.line: m.eligible_gbp for m in settlement.lines}
    outcomes = "; ".join(f"line {d.line} {d.outcome} {gbp(money_by_line.get(d.line, 0.0))}" for d in final_lines)
    if status == "PAID":
        text = (f"Status: PAID (decision v{version}), net settlement {gbp(net)}. "
                + (f"Amount paid: {gbp(paid_now)} on {paid_on} by bank transfer to the verified account ending {last4}, "
                   f"payment reference {ref}."
                   if paid_now else f"The settlement has been paid to the verified account ending {last4}, payment reference {ref}.")
                + (f" This is in addition to {gbp(already)} paid earlier; total paid {gbp(paid_total)}." if already else ""))
        return f"{text} Line outcomes: {outcomes}."
    if status == "NO_PAYMENT_DUE":
        return (f"Decision v{version}: after reviewing the new information the settlement is {gbp(net)}, which has already "
                f"been paid ({gbp(already)}). No further payment is due. Line outcomes: {outcomes}.")
    return (f"Decision v{version}: the claim has been passed to a claims handler for review before any payment is made. "
            f"No payment has been made{' beyond the ' + gbp(already) + ' paid earlier' if already else ''}. "
            "The outcome is not final yet.")


async def _decide(run: _Run, sections: list[SectionAssessment]) -> None:
    claim_id, intake = run.claim_id, run.intake
    current = state.load_state(claim_id)
    version = current.decision_version + 1
    already = round(current.paid_total_gbp, 2)
    v = f"v{version}"

    # 4. checker
    state.log(claim_id, "checker", "Checker cross-checking every head and screening the FRD-03 fraud indicators…")
    notes = _merge_notes(run, await memory.get_notes(claim_id), None)
    kb = await memory.kb_context("checker", intake.wording_ref)
    history = await memory.claims_history(intake.policyholder, claim_id)
    checker = await agents.run_checker(intake, notes, sections, kb, history)
    quotes.verify_quotes(checker, run.texts)
    rel = state.write_artifact(claim_id, f"{v}/checker.json", checker)
    triggered = ", ".join(f"{i.id} ({i.weight})" for i in checker.indicators if i.triggered) or "none"
    overrides = ", ".join(f"line {o.line} → {o.outcome}" for o in checker.line_overrides) or "none"
    state.log(claim_id, "checker", f"Checker: {len(checker.cross_checks)} cross-check finding(s); indicators triggered: "
              f"{triggered}; overrides: {overrides}", rel)

    # money (code); quotes re-checked on the exact line decisions the gate will see
    final_lines = packs.apply_overrides(sections, checker)
    quotes.verify_quotes(final_lines, run.texts)
    money_error = None
    try:
        settlement = money.settle(final_lines, sections, checker.indicators)
        by_section = " + ".join(f"{s.head} {gbp(s.net_gbp)}" for s in settlement.sections)
        state.log(claim_id, "money", f"Settlement (code): net {gbp(settlement.net_total_gbp)} = {by_section}; fraud score "
                  f"{settlement.fraud_score} {settlement.fraud_band}"
                  + (f"; {gbp(already)} already paid → difference {gbp(settlement.net_total_gbp - already)}" if already else ""))
    except money.MoneyError as exc:
        money_error = str(exc)
        score = money.fraud_score(checker.indicators)
        settlement = Settlement(
            lines=[LineMoney(line=d.line, head=d.head, outcome=d.outcome, eligible_gbp=0.0,
                             calculation=f"not calculated: {money_error}") for d in final_lines],
            sections=[], net_total_gbp=0.0, fraud_score=score, fraud_band=money.fraud_band(score),
        )
        state.log(claim_id, "money", f"Settlement can't be calculated exactly — REFER: {money_error}")

    # Evidence Pack
    pack = packs.build_pack(claim_id, version, intake, notes, sections, checker, final_lines, settlement,
                            already_paid_gbp=already)
    rel = state.write_artifact(claim_id, f"{v}/final_input.md", pack.markdown)
    state.log(claim_id, "pack", f"Evidence Pack v{version} assembled (CHG-TRV §10): {len(notes)} documents indexed, "
              f"{len(final_lines)} line findings", rel)

    # 5. final review (pack + rules only)
    if money_error is None:
        kb = await memory.kb_context("final", intake.wording_ref)
        final = await agents.run_final(pack.markdown, kb)
    else:
        final = FinalReview(verdict="REFER", summary=f"Not reviewed: the settlement could not be calculated ({money_error}).",
                            concerns=[Concern(concern=money_error, material=True)], preconditions=[])
    rel = state.write_artifact(claim_id, f"{v}/final.json", final)
    state.log(claim_id, "final", f"Final review: {final.verdict} — {_short(final.summary, 200)}", rel)

    # 6. gate (code) + payment (DRY_RUN unless live)
    checks = list(gate.pre_payment_checks(final, final_lines))
    if money_error is not None:
        checks.insert(0, CheckResult(id="MONEY", description="Settlement calculated exactly (CHG-TRV §7)",
                                     passed=False, detail=money_error))
    ok = gate.gate_passed(checks)
    failed = [c for c in checks if not c.passed]
    to_pay = round(settlement.net_total_gbp - already, 2)
    mode = "LIVE Stripe test-mode transfer" if run.live else "DRY RUN, Stripe not called"
    record, pay_checks = None, []
    if not ok:
        state.log(claim_id, "gate", f"Gate: REFER, no payment — {_checks_text(failed)}")
    else:
        state.log(claim_id, "gate", f"Gate: all {len(checks)} pre-payment checks passed; payments service (SAP-01 "
                  f"guardrails) asked to settle {gbp(to_pay)} [{mode}]")
        decision = gate.decision_dict(claim_id, version, final_lines, settlement, settle=ok, indicators=checker.indicators)
        try:
            record, pay_checks = await asyncio.to_thread(
                payments.pay, claim_id, decision, dry_run=not run.live, already_paid_gbp=already)
        except payments.PaymentsConfigError as exc:
            state.log(claim_id, "payment", f"Payment NOT made [{mode}] — setup problem; fix it and resume "
                      f"(payments are idempotent, a retry can't pay twice): {exc}")
            raise
    pay_checks = list(pay_checks or [])
    pay_failed = [c for c in pay_checks if not c.passed]
    gate_result = GateResult(passed=ok and record is not None and not pay_failed,
                             checks=checks + pay_checks, amount_to_pay_gbp=to_pay)
    status, paid_now, paid_total = _outcome(gate_result, record, settlement.net_total_gbp, already)

    # payment record before the letter (SAP-01 Appendix A)
    rel = state.write_artifact(claim_id, f"{v}/payment.json", record) if record is not None else None
    with state.mutate(claim_id) as s:
        if record is not None and status == "PAID" and paid_now > 0:
            s.payments.append(record)
        s.paid_total_gbp = paid_total
    if status == "REFERRED":
        reasons = _checks_text(failed or pay_failed) or "the payments service made no payment"
        message = f"No payment: referred to a T1 claims handler with the Evidence Pack — {reasons}"
    elif status == "NO_PAYMENT_DUE":
        message = (f"No further payment due [{mode}]: {gbp(already)} already paid covers the "
                   f"{gbp(settlement.net_total_gbp)} settlement")
    elif record.status == "ALREADY_PAID":
        message = f"Stripe already holds the v{version} payment ({record.stripe_object_id}); nothing paid twice"
    elif record.status == "DRY_RUN":
        message = (f"DRY RUN payment (Stripe not called): SAP-01 guardrails passed; would pay {gbp(paid_now)} to "
                   f"{record.stripe_destination}, idempotency key {record.idempotency_key}"
                   + (f"; total {gbp(paid_total)}" if already else ""))
    else:
        message = (f"LIVE payment: {gbp(paid_now)} sent via Stripe test mode ({record.stripe_object_id}) to "
                   f"{record.stripe_destination}, reference {config.PAYMENT_REFERENCE_PREFIX} {claim_id}, idempotency key "
                   f"{record.idempotency_key}" + (f"; total paid {gbp(paid_total)}" if already else ""))
    state.log(claim_id, "payment", message, rel)

    # the pack of record, with the authority check filled
    pack = packs.build_pack(claim_id, version, intake, notes, sections, checker, final_lines, settlement,
                            final=final, gate=gate_result, already_paid_gbp=already)
    state.write_artifact(claim_id, f"{v}/pack.json", pack)
    rel = state.write_artifact(claim_id, f"{v}/pack.md", pack.markdown)
    state.log(claim_id, "pack", f"Evidence Pack v{version} final: authority check (SAP-01 P1–P10) and payment gate filled", rel)

    # letter
    kb = await memory.kb_context("letter", intake.wording_ref)
    summary = _decision_summary(claim_id, version, status, settlement, paid_now, paid_total, already, final_lines,
                                record, intake.policy_number)
    letter = await agents.write_decision_letter(pack, summary, kb)
    rel = state.write_artifact(claim_id, f"{v}/letter.md", _letter_md(letter))
    state.log(claim_id, "letter", f"Decision letter: “{letter.subject}”", rel)

    # 7. decision record + memory
    decision_record = DecisionRecord(
        claim_id=claim_id, version=version, decided_at=documents.now_iso(), status=status,
        net_total_gbp=settlement.net_total_gbp, paid_now_gbp=paid_now, paid_total_gbp=paid_total,
        final_review=final, gate=gate_result, payment=record, pack_sha256=packs.pack_sha256(pack), letter=letter,
    )
    rel = state.write_artifact(claim_id, f"{v}/decision.json", decision_record)
    async with run.mem_lock:
        await memory.remember_decision(claim_id, decision_record, pack)
    state.update_state(claim_id, status=status, decision_version=version, waiting_for=[])
    state.log(claim_id, "memory", f"Decision v{version} ({status}, net {gbp(settlement.net_total_gbp)}, paid now "
              f"{gbp(paid_now)}) stored in Cognee with its Evidence Pack — ask “why?” any time", rel)
