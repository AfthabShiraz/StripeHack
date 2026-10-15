"""Cognee memory: company knowledge, claim documents and notes, decisions, and the explainer.
Agents get their context through these functions. OWNER: memory subagent.

How it works (Cognee 1.6, local backends: SQLite + Ladybug graph + LanceDB vectors, per-dataset
databases because multi-user access control is on, so dataset scoping is physical):

- Every piece of memory is a Cognee data item (`cognee.add` with a `DataItem`): one per KB section,
  per raw claim document, per reader's notes and per decision. Each carries a pinned, deterministic
  data_id, a label, `external_metadata` (doc_id, wording_version, superseded, heads, ...) and node sets.
- Exact retrieval (kb_context, get_notes, claims_history) reads those items back through Cognee's
  dataset/data API (`cognee.datasets.list_data` + the stored raw item), selected by their metadata.
  No semantic search is involved, so it is complete and lossless, and needs no LLM call.
- `cognee.cognify` (Gemini Flash for extraction, Gemini embeddings) builds the knowledge graph over
  the KB and decisions; `ask` answers with `cognee.recall` over that graph plus the exact records.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from pathlib import Path
from typing import Literal

from . import config
from .schemas import Answer, ClaimDocument, DecisionRecord, DocumentNotes, EvidencePack

# ---------------------------------------------------------------- Cognee configuration
# Cognee reads these from the environment when it is first imported, so they are set here, before
# `setup()` imports it. setdefault: an explicit environment variable still wins.
# LLM_MODEL / EMBEDDING_MODEL are deliberately NOT set as env vars: config.py reads the same names.
COGNEE_SYSTEM_DIR = config.ROOT / ".cognee_system"
COGNEE_DATA_DIR = config.ROOT / ".data_storage"
# Cognee's own graph extraction uses a fast model; decisions never depend on it.
COGNEE_LLM_MODEL = os.environ.get("COGNEE_LLM_MODEL", "gemini-3.8-flash")
# Answers from ask() use the strongest model.
COGNEE_QUERY_MODEL = os.environ.get("COGNEE_QUERY_MODEL", config.LLM_MODEL)
# Embeddings for Cognee's vector index: local fastembed by default (set COGNEE_EMBEDDING_PROVIDER=gemini to use
# config.EMBEDDING_MODEL). Changing it requires wiping .cognee_system/ and .data_storage/ (vector size changes).
COGNEE_EMBEDDING_PROVIDER = os.environ.get("COGNEE_EMBEDDING_PROVIDER", "fastembed")

for _k, _v in {
    "TELEMETRY_DISABLED": "1",
    "SYSTEM_ROOT_DIRECTORY": str(COGNEE_SYSTEM_DIR),
    "DATA_ROOT_DIRECTORY": str(COGNEE_DATA_DIR),
    "CACHE_ROOT_DIRECTORY": str(COGNEE_SYSTEM_DIR / "cache"),
    "ENABLE_BACKEND_ACCESS_CONTROL": "true",  # per-dataset databases: dataset filters really scope
    "AUTO_FEEDBACK": "false",  # no extra LLM call per recall
    "LOG_LEVEL": "ERROR",
    "COGNEE_SKIP_CONNECTION_TEST": "true",  # no probe calls; real calls fail loudly anyway
}.items():
    os.environ.setdefault(_k, _v)

_ready = False
_locks: dict[tuple[int, str], asyncio.Lock] = {}
_NS = uuid.UUID("6f1c2a52-6c0b-4d39-9a43-6a7a2f0e5b11")


def _lock(name: str) -> asyncio.Lock:
    """One lock per dataset per event loop (Streamlit may run several loops)."""
    key = (id(asyncio.get_running_loop()), name)
    if key not in _locks:
        _locks[key] = asyncio.Lock()
    return _locks[key]


def _data_id(*parts: str) -> uuid.UUID:
    return uuid.uuid5(_NS, "/".join(parts))


async def setup() -> None:
    """Configure Cognee (Gemini LLM + embeddings, project-local storage). Idempotent; call before anything else."""
    global _ready
    if _ready:
        return
    if not config.GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not set (.env)")
    import cognee

    cognee.config.system_root_directory(str(COGNEE_SYSTEM_DIR))
    cognee.config.data_root_directory(str(COGNEE_DATA_DIR))
    cognee.config.set_llm_config(
        {
            "llm_provider": "gemini",
            "llm_model": f"gemini/{COGNEE_LLM_MODEL}",
            "llm_api_key": config.GEMINI_API_KEY,
            "llm_query_provider": "gemini",
            "llm_query_model": f"gemini/{COGNEE_QUERY_MODEL}",
            "llm_query_api_key": config.GEMINI_API_KEY,
        }
    )
    if COGNEE_EMBEDDING_PROVIDER == "gemini":
        cognee.config.set_embedding_config(
            {
                "embedding_provider": "gemini",
                "embedding_model": f"gemini/{config.EMBEDDING_MODEL}",
                "embedding_dimensions": 3072,
                "embedding_api_key": config.GEMINI_API_KEY,
            }
        )
    else:  # local, no quota: Gemini's 3,000 embed requests/min is exhausted by one cognify
        cognee.config.set_embedding_config(
            {"embedding_provider": "fastembed", "embedding_model": "BAAI/bge-small-en-v1.5", "embedding_dimensions": 384}
        )
    COGNEE_SYSTEM_DIR.mkdir(parents=True, exist_ok=True)
    COGNEE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    from cognee.modules.engine.operations.setup import setup as create_databases

    await create_databases()  # relational tables + default user; idempotent
    _ready = True


# ---------------------------------------------------------------- data-item helpers


async def _dataset(name: str):
    import cognee

    for ds in await cognee.datasets.list_datasets():
        if ds.name == name:
            return ds
    return None


async def _rows(name: str) -> list:
    """Data rows of a dataset (oldest first), or [] if the dataset doesn't exist."""
    import cognee

    ds = await _dataset(name)
    if ds is None:
        return []
    return list(await cognee.datasets.list_data(ds.id))


async def _read(row) -> str:
    from cognee.infrastructure.files.utils.open_data_file import open_data_file

    async with open_data_file(row.raw_data_location, mode="r", encoding="utf-8") as f:
        return f.read()


def _meta(row) -> dict:
    m = row.external_metadata
    if isinstance(m, str):
        try:
            m = json.loads(m)
        except ValueError:
            m = {}
    return m or {}


async def _put(dataset: str, items: list[tuple[uuid.UUID, str, str, dict, list[str]]]) -> int:
    """Store items (data_id, label, text, metadata, node_set) in a dataset. An item whose pinned id
    already exists with the same text is left alone; with different text it is replaced."""
    import cognee
    from cognee.tasks.ingestion.data_item import DataItem

    if not items:
        return 0
    async with _lock(dataset):
        existing = {str(r.id): r for r in await _rows(dataset)}
        ds = await _dataset(dataset)
        todo = []
        for data_id, label, text, meta, node_set in items:
            row = existing.get(str(data_id))
            if row is not None:
                if await _read(row) == text:
                    continue
                await cognee.forget(data_id=row.id, dataset_id=ds.id)
            todo.append(
                DataItem(data=text, label=label, external_metadata=meta, node_set=node_set,
                         data_id=data_id, literal_text=True)
            )
        if todo:
            await cognee.add(todo, dataset_name=dataset, skip_connection_test=True)
        return len(todo)


async def _cognify(dataset: str) -> None:
    """Build/refresh the knowledge graph for a dataset (incremental: only new items are processed)."""
    import cognee

    async with _lock(dataset):
        if not await _rows(dataset):
            return
        await cognee.cognify(datasets=[dataset], summary_method="from_extraction")


def _block(text: str, tag: str) -> str | None:
    m = re.search(rf"<<<{tag}\n(.*?)\n{tag}>>>", text, re.S)
    return m.group(1) if m else None


# ---------------------------------------------------------------- knowledge base

_HEADING = re.compile(r"^(\d{1,2})\. (\S.*)$")
_APPENDIX = re.compile(r"^Appendix ([A-Z]) — (.+)$")
_SECTION_LETTER = re.compile(r"^\d{1,2}\. Section ([A-Z])\b")


def split_sections(doc_id: str, text: str) -> list[dict]:
    """Split a company document into its numbered top-level sections (plus a preamble and
    appendices), dropping page headers/footers. Numbered list items inside a section are not
    headings: a heading must be the next number in sequence, short, and not end with a full stop."""
    furniture = re.compile(
        rf"^\s*(LARKSPUR ASSURANCE( \| .*)?|{re.escape(doc_id)} / [A-Z ]+|{re.escape(doc_id)} • \d+)\s*$"
    )
    sections: list[dict] = []
    key, heading, buf, expected = "0", "Preamble", [], 1

    def flush():
        body = re.sub(r"\n{3,}", "\n\n", "\n".join(buf)).strip()
        if body:
            letter = _SECTION_LETTER.match(heading)
            sections.append({"key": key, "heading": heading, "text": body,
                             "letter": letter.group(1) if letter else None})

    for line in text.splitlines():
        if furniture.match(line):
            continue
        m, a = _HEADING.match(line), _APPENDIX.match(line)
        if m and int(m.group(1)) == expected and len(line) <= 90 and not line.rstrip().endswith("."):
            flush()
            key, heading, buf, expected = m.group(1), line.strip(), [line], expected + 1
        elif a:
            flush()
            key, heading, buf = f"App{a.group(1)}", line.strip(), [line]
        else:
            buf.append(line)
    flush()
    return sections


def _norm_ref(s: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _kb_items() -> list[tuple[uuid.UUID, str, str, dict, list[str]]]:
    from .documents import company_documents

    items = []
    for entry, doc in company_documents():
        doc_id = entry["doc_id"]
        version = entry.get("wording_version")
        superseded = bool(entry.get("superseded"))
        contractual = doc_id != "BROCHURE"
        status = (
            "SUPERSEDED - never apply" if superseded
            else "marketing, NOT contractual - never rely on it" if not contractual
            else "governing wording" if version else "current"
        )
        tag = "kb_superseded" if superseded else "kb_non_contractual" if not contractual else "kb_current"
        for order, sec in enumerate(split_sections(doc_id, doc.text)):
            head = f"### {doc_id}" + (f" | {version}" if version else "") + f" | {status} | {sec['heading']}"
            meta = {
                "kind": "kb_section", "doc_id": doc_id, "title": doc.title, "path": doc.path,
                "wording_version": version, "superseded": superseded, "contractual": contractual,
                "section_key": sec["key"], "heading": sec["heading"], "section_letter": sec["letter"],
                "order": order,
            }
            items.append((_data_id("kb", doc_id, sec["key"]), f"{doc_id} {sec['heading']}"[:200],
                          head + "\n" + sec["text"], meta, ["kb", f"doc_{doc_id}", tag]))
    return items


async def load_kb(force: bool = False) -> None:
    """Ingest the company PDFs from documents.company_documents() (policy records excluded, answer key never)
    into the KB dataset, split by section and tagged by doc_id and wording_version / superseded from the
    manifest. Skips if already loaded unless force."""
    import cognee

    await setup()
    items = _kb_items()
    if not force:
        rows = {str(r.id): r for r in await _rows(config.KB_DATASET)}
        if all(str(i[0]) in rows for i in items) and all(
            (rows[str(i[0])].pipeline_status or {}) for i in items
        ):
            return
    else:
        if await _dataset(config.KB_DATASET) is not None:
            async with _lock(config.KB_DATASET):
                await cognee.forget(dataset=config.KB_DATASET)
    await _put(config.KB_DATASET, items)
    await _cognify(config.KB_DATASET)


async def _kb_sections() -> list[dict]:
    out = []
    for row in await _rows(config.KB_DATASET):
        meta = _meta(row)
        if meta.get("kind") == "kb_section":
            out.append({**meta, "text": await _read(row)})
    out.sort(key=lambda s: (s["doc_id"], s["order"]))
    return out


def _wanted(purpose: str, sections: list[dict], wording_doc: str, head: str | None, head_name: str | None):
    """(doc_id, section_key) pairs to include, in order."""
    by_doc: dict[str, list[dict]] = {}
    for s in sections:
        by_doc.setdefault(s["doc_id"], []).append(s)
    wording = by_doc.get(wording_doc, [])

    def keys(doc, ks):
        return [(doc, k) for k in ks if any(s["section_key"] == k for s in by_doc.get(doc, []))]

    def whole(doc):
        return [(doc, s["section_key"]) for s in by_doc.get(doc, [])]

    if purpose == "section":
        letters: list[str] = []
        h = (head or "").strip().upper()
        if h and h[0].isalpha():
            letters.append(h[0])
        head_secs = [s for s in wording if s["section_letter"] in letters]
        if not head_secs and head_name:  # match by name if the code is unusual
            words = [w for w in re.findall(r"[a-z]+", head_name.lower()) if len(w) > 3]
            head_secs = [s for s in wording if s["section_letter"] and any(w in s["heading"].lower() for w in words)]
        if not head_secs:  # unknown head: include every section of the wording
            head_secs = [s for s in wording if s["section_letter"]]
        # sections the head's own section refers to (e.g. B1.1 -> A.2, F.1 -> D.3.1, E.5 -> Section D)
        for s in list(head_secs):
            for ref in re.findall(r"\b([A-I])\d*\.\d|\bSection ([A-I])\b", s["text"]):
                letter = ref[0] or ref[1]
                if letter not in letters:
                    letters.append(letter)
                    head_secs += [x for x in wording if x["section_letter"] == letter]
        head_keys = sorted({s["section_key"] for s in head_secs}, key=int)
        return (
            keys(wording_doc, ["0", "1", "2", "3"]) + [(wording_doc, k) for k in head_keys]
            + keys(wording_doc, ["13", "14"])
            + keys("CHG-TRV", ["1", "2", "4", "5", "6", "7", "8", "9"])
            + keys("SAP-01", ["AppB"])
        )
    if purpose == "checker":
        return whole("FRD-03") + keys("CHG-TRV", ["2", "5", "7"]) + keys(wording_doc, ["1", "14"]) + keys("SAP-01", ["AppB"])
    if purpose == "final":
        return whole("SAP-01") + keys("CHG-TRV", ["2", "9", "10"])
    if purpose == "letter":
        return whole("LTR-02") + keys(wording_doc, ["15"])
    raise ValueError(f"unknown purpose {purpose!r}")


async def kb_context(
    purpose: Literal["section", "checker", "final", "letter"],
    wording_ref: str,
    head: str | None = None,
    head_name: str | None = None,
) -> str:
    """Company rules an agent needs, retrieved from Cognee, as prompt-ready text with document/heading labels.
    Must only return the governing wording version (never superseded wordings) and never the brochure.
    Errs on the side of more context: completeness matters more than size."""
    await setup()
    sections = await _kb_sections()
    if not sections:
        await load_kb()
        sections = await _kb_sections()
    allowed = [s for s in sections if not s["superseded"] and s["contractual"]]
    wordings = sorted({s["doc_id"] for s in allowed if s["wording_version"]})
    match = [d for d in wordings if any(_norm_ref(s["wording_version"]) == _norm_ref(wording_ref)
                                        for s in allowed if s["doc_id"] == d)]
    note = ""
    if not match:
        note = (f"NOTE: the requested wording {wording_ref!r} is not a current wording in memory; "
                f"superseded wordings are never used. Showing the current governing wording instead - "
                f"refer to a human if the Certificate really names another wording.\n\n")
    wording_doc = (match or wordings or [""])[0]
    index = {(s["doc_id"], s["section_key"]): s for s in allowed}
    picked, seen = [], set()
    for k in _wanted(purpose, allowed, wording_doc, head, head_name):
        if k in index and k not in seen:
            seen.add(k)
            picked.append(index[k])
    version = next((s["wording_version"] for s in allowed if s["doc_id"] == wording_doc), wording_ref)
    header = (
        f"COMPANY RULES (from Cognee memory, dataset {config.KB_DATASET}) for purpose '{purpose}'"
        + (f", head of claim {head} {head_name or ''}".rstrip() if head else "")
        + f". Governing wording: {version} ({wording_doc}). Superseded wordings and marketing material are excluded. "
        "Each block starts with '### <document ID> | <version> | <status> | <heading>'; cite clause IDs as written.\n\n"
    )
    return header + note + "\n\n".join(s["text"] for s in picked)


# ---------------------------------------------------------------- claim documents and notes


async def remember_document(claim_id: str, doc: ClaimDocument) -> None:
    """Store a raw claim document in the claim's dataset."""
    await setup()
    text = (
        f"CLAIM {claim_id} - DOCUMENT {doc.doc_id}: {doc.title}\n"
        f"File: {doc.path} | type: {doc.doc_type_hint} | language: {doc.language} | date: {doc.document_date}\n\n"
        f"{doc.text}"
    )
    meta = {"kind": "document", "claim_id": claim_id, "doc_id": doc.doc_id, "path": doc.path,
            "title": doc.title, "doc_type_hint": doc.doc_type_hint, "language": doc.language,
            "document_date": doc.document_date, "received_at": doc.received_at}
    await _put(config.claim_dataset(claim_id), [(
        _data_id("claim", claim_id, "doc", doc.doc_id), f"{doc.doc_id} {doc.title}"[:200], text, meta,
        [f"claim_{claim_id}", "raw_document"],
    )])


def _notes_text(claim_id: str, n: DocumentNotes) -> str:
    lines = [
        f"CLAIM {claim_id} - READER NOTES for document {n.doc_id} ({n.doc_type}); heads: "
        f"{', '.join(n.heads) or 'none'}; supports lines: {', '.join(map(str, n.supports_lines)) or 'none'}",
        f"Issuer: {n.issuer} | Date: {n.document_datetime} | Language: {n.language} | Original: {n.is_original}"
        + (f" (translation of {n.translation_of})" if n.translation_of else ""),
        f"Summary: {n.summary}",
        f"Relevance: {n.relevance}",
    ]
    lines += [f"- Fact: {f.label}: {f.value} (quote: \"{f.quote}\")" for f in n.facts]
    lines += [f"- Item: {i.description}: {i.amount} {i.currency}"
              + (f" (GBP debited {i.gbp_debited})" if i.gbp_debited is not None else "")
              + (f" on {i.date}" if i.date else "") + f" (quote: \"{i.quote}\")" for i in n.items]
    if n.total is not None:
        lines.append(f"Total: {n.total} {n.currency or ''} paid by {n.payment_method}")
    return "\n".join(lines) + "\n\n<<<NOTES_JSON\n" + n.model_dump_json() + "\nNOTES_JSON>>>\n"


def _norm_head(h: str) -> str:
    return re.sub(r"\s+", "", h or "").upper()


def _head_matches(note_head: str, head: str) -> bool:
    """'C' matches 'C3'; 'B2' matches 'B'; 'B1' does not match 'B2'."""
    a, b = _norm_head(note_head), _norm_head(head)
    if not a or not b:
        return False
    return a == b or a.startswith(b) or b.startswith(a) if a[0] == b[0] else False


async def remember_notes(claim_id: str, notes: DocumentNotes) -> None:
    """Store a reader's notes in the claim's dataset, tagged with the heads of claim they belong to."""
    await setup()
    heads = sorted({_norm_head(h) for h in notes.heads if _norm_head(h)})
    meta = {"kind": "notes", "claim_id": claim_id, "doc_id": notes.doc_id, "heads": heads,
            "doc_type": notes.doc_type}
    await _put(config.claim_dataset(claim_id), [(
        _data_id("claim", claim_id, "notes", notes.doc_id), f"notes {notes.doc_id}",
        _notes_text(claim_id, notes), meta,
        [f"claim_{claim_id}", "notes"] + [f"head_{h}" for h in heads],
    )])


def _doc_sort_key(doc_id: str):
    return [(0, int(p), "") if p.isdigit() else (1, 0, p) for p in re.findall(r"\d+|\D+", doc_id)]


async def get_notes(claim_id: str, head: str | None = None) -> list[DocumentNotes]:
    """All notes for the claim (head=None) or those tagged with `head`. Must be exact and complete."""
    await setup()
    out: list[DocumentNotes] = []
    for row in await _rows(config.claim_dataset(claim_id)):
        meta = _meta(row)
        if meta.get("kind") != "notes":
            continue
        raw = _block(await _read(row), "NOTES_JSON")
        if raw is None:
            raise RuntimeError(f"notes item {row.id} for {claim_id} has no JSON block")
        notes = DocumentNotes.model_validate_json(raw)
        if head is None or any(_head_matches(h, head) for h in notes.heads):
            out.append(notes)
    out.sort(key=lambda n: _doc_sort_key(n.doc_id))
    return out


# ---------------------------------------------------------------- decisions


def _decision_facts(record: DecisionRecord, pack: EvidencePack) -> dict:
    money = {lm.line: lm for lm in pack.settlement.lines}
    return {
        "claim_id": record.claim_id, "version": record.version, "decided_at": record.decided_at,
        "status": record.status, "policy_number": pack.intake.policy_number,
        "policyholder": pack.intake.policyholder, "wording_ref": pack.intake.wording_ref,
        "net_total_gbp": record.net_total_gbp, "paid_now_gbp": record.paid_now_gbp,
        "paid_total_gbp": record.paid_total_gbp, "fraud_score": pack.settlement.fraud_score,
        "fraud_band": pack.settlement.fraud_band, "final_verdict": record.final_review.verdict,
        "gate_passed": record.gate.passed, "pack_sha256": record.pack_sha256,
        "payment": record.payment.model_dump() if record.payment else None,
        "sections": [s.model_dump() for s in pack.settlement.sections],
        "lines": [
            {
                "line": d.line, "head": d.head, "outcome": d.outcome,
                "claimed": f"{d.claimed_amount} {d.claimed_currency}",
                "eligible_gbp": money[d.line].eligible_gbp if d.line in money else None,
                "calculation": money[d.line].calculation if d.line in money else None,
                "clause_ids": d.clause_ids, "objective_exclusion": d.objective_exclusion,
                "evidence": [{"doc_id": e.doc_id, "quote": e.quote} for e in d.evidence],
                "reason": d.reason,
            }
            for d in pack.final_lines
        ],
    }


def _decision_text(f: dict, record: DecisionRecord, pack: EvidencePack) -> str:
    p = f["payment"]
    out = [
        f"CLAIM {f['claim_id']} - DECISION version {f['version']}: {f['status']} (decided {f['decided_at']})",
        f"Policyholder: {f['policyholder']} | Policy: {f['policy_number']} | Wording: {f['wording_ref']}",
        f"Net settlement GBP {f['net_total_gbp']:.2f}; paid now GBP {f['paid_now_gbp']:.2f}; "
        f"paid in total GBP {f['paid_total_gbp']:.2f}",
        (f"Payment: Stripe {p['stripe_object_id']} GBP {p['amount_gbp']:.2f} to {p['stripe_destination']} "
         f"({p['status']}), idempotency key {p['idempotency_key']}, {p['dashboard_url']}") if p else "Payment: none",
        f"Fraud score {f['fraud_score']} ({f['fraud_band']}). Final reviewer: {f['final_verdict']} - "
        f"{record.final_review.summary}",
        f"Pre-payment gate {'passed' if f['gate_passed'] else 'FAILED'}: "
        + "; ".join(f"{c.id} {'ok' if c.passed else 'FAIL'} ({c.detail})" for c in record.gate.checks),
        "Line decisions:",
    ]
    for ln in f["lines"]:
        ev = "; ".join(f"{e['doc_id']}: \"{e['quote']}\"" for e in ln["evidence"])
        out.append(
            f"- Line {ln['line']} (head {ln['head']}): {ln['outcome']}; claimed {ln['claimed']}; eligible GBP "
            f"{ln['eligible_gbp']} ({ln['calculation']}); clauses {', '.join(ln['clause_ids'])}"
            + (f"; objective exclusion {ln['objective_exclusion']}" if ln["objective_exclusion"] else "")
            + f"; evidence {ev}; reason: {ln['reason']}"
        )
    out += [f"- Section {s['head']}: {s['calculation']} -> net GBP {s['net_gbp']:.2f}" for s in f["sections"]]
    if record.letter:
        out += ["", f"Decision letter: {record.letter.subject}", record.letter.body_markdown]
    out += ["", "EVIDENCE PACK", pack.markdown]
    return "\n".join(out) + "\n\n<<<DECISION_JSON\n" + json.dumps(f) + "\nDECISION_JSON>>>\n"


async def remember_decision(claim_id: str, record: DecisionRecord, pack: EvidencePack) -> None:
    """Store the decision, the payment and the Evidence Pack in the decisions dataset, linked to the claim."""
    await setup()
    facts = _decision_facts(record, pack)
    holder = re.sub(r"[^a-z0-9]+", "_", pack.intake.policyholder.lower()).strip("_")
    meta = {"kind": "decision", "claim_id": claim_id, "version": record.version, "status": record.status,
            "policyholder": pack.intake.policyholder, "decided_at": record.decided_at,
            "net_total_gbp": record.net_total_gbp,
            "payment_id": record.payment.stripe_object_id if record.payment else None}
    added = await _put(config.DECISIONS_DATASET, [(
        _data_id("decision", claim_id, str(record.version)), f"decision {claim_id} v{record.version}",
        _decision_text(facts, record, pack), meta,
        ["decision", f"claim_{claim_id}", f"policyholder_{holder}"],
    )])
    if added:
        await _cognify(config.DECISIONS_DATASET)  # graph for ask() / graph_html(); ~15-30 s with Flash


async def _decisions(claim_id: str | None = None) -> list[tuple[dict, str]]:
    out = []
    for row in await _rows(config.DECISIONS_DATASET):
        meta = _meta(row)
        if meta.get("kind") != "decision" or (claim_id and meta.get("claim_id") != claim_id):
            continue
        text = await _read(row)
        raw = _block(text, "DECISION_JSON")
        if raw:
            out.append((json.loads(raw), text))
    out.sort(key=lambda d: (d[0]["claim_id"], d[0]["version"]))
    return out


async def claims_history(policyholder: str, claim_id: str) -> str:
    """Prior decisions for this policyholder from the decisions dataset (excluding claim_id), as text."""
    await setup()
    who = " ".join(policyholder.lower().split())
    latest: dict[str, dict] = {}
    for f, _ in await _decisions():
        if f["claim_id"] != claim_id and " ".join(str(f["policyholder"]).lower().split()) == who:
            latest[f["claim_id"]] = f  # sorted by version: last one wins
    lines = []
    for f in latest.values():
        heads = sorted({ln["head"] for ln in f["lines"]})
        lines.append(
            f"- {f['claim_id']} (decision v{f['version']}, {f['decided_at']}): {f['status']}, net GBP "
            f"{f['net_total_gbp']:.2f}, paid GBP {f['paid_total_gbp']:.2f}, heads {', '.join(heads)}, "
            f"fraud score {f['fraud_score']}"
        )
    if not lines:
        return ""
    return f"Prior claims decided for {policyholder} (from Cognee memory):\n" + "\n".join(lines)


# ---------------------------------------------------------------- explainer

_EXPLAINER = (
    "You are the Larkspur claims explainer. Answer the question using ONLY the memory provided: the "
    "authoritative decision records, the retrieved Cognee memory and the policy/guideline extracts. "
    "For every amount paid or not paid, name the policy or guideline clause IDs that made it so (e.g. E.1, "
    "2.5, C1.2, CHG 7.2.2, SAP-01 P1), the evidence document IDs with short exact quotes, the calculation, "
    "and the authority rule (SAP-01 tier and preconditions) that allowed payment without a person. "
    "If the memory does not contain the answer, say so. Be concise and specific."
)


async def ask(question: str, claim_id: str | None = None) -> Answer:
    """Explainer: answer from memory (decisions + claim + KB) citing clauses and evidence."""
    import cognee
    from cognee import SearchType

    await setup()
    decisions = await _decisions(claim_id)
    if claim_id and not decisions:
        mentioned = set(re.findall(r"CLM-\d{4}-\d+", question))
        decisions = [d for d in await _decisions() if d[0]["claim_id"] in mentioned]
    record_text = "\n\n".join(t.split("\n\nEVIDENCE PACK\n")[0] for _, t in decisions[-3:])
    # policy wording for the clauses the decision relied on (exact, from the KB items)
    clause_ids = sorted({c for f, _ in decisions for ln in f["lines"] for c in ln["clause_ids"]})
    kb = ""
    if decisions:
        f = decisions[-1][0]
        heads = sorted({ln["head"] for ln in f["lines"]})
        parts = [await kb_context("section", f["wording_ref"], h) for h in heads[:1]]
        parts.append(await kb_context("final", f["wording_ref"]))
        kb = "\n\n".join(parts)
    system = (
        _EXPLAINER
        + "\n\nAUTHORITATIVE DECISION RECORDS (from Cognee memory):\n" + (record_text or "(none found)")
        + (f"\n\nCLAUSES RELIED ON: {', '.join(clause_ids)}" if clause_ids else "")
        + ("\n\nPOLICY AND GUIDELINE EXTRACTS (from Cognee memory):\n" + kb[:60000] if kb else "")
    )
    datasets = [config.DECISIONS_DATASET] if await _dataset(config.DECISIONS_DATASET) else []
    refs: list[str] = []
    text = ""
    if datasets:
        try:
            results = await cognee.recall(
                question, query_type=SearchType.GRAPH_COMPLETION, datasets=datasets, system_prompt=system,
                top_k=20, include_references=True,
                node_name=[f"claim_{claim_id}"] if claim_id and decisions else None,
            )
            text, refs = _answer_from_recall(results)
        except Exception as e:  # graph not built yet etc.: answer from the exact records
            refs.append(f"recall unavailable: {type(e).__name__}")
    if not text:
        from cognee.infrastructure.llm.LLMGateway import LLMGateway

        text = await LLMGateway.acreate_structured_output(text_input=question, system_prompt=system, response_model=str)
    cited = re.findall(r"\b(?:E\d{2}[ab]?|M0\d|CHG(?:-TRV)? \d+(?:\.\d+)*|SAP-01 [A-Z0-9.]+|[A-I]\d?\.\d+(?:\.\d+)?)\b", text)
    for d, _ in decisions:
        if d.get("payment"):
            refs.append(f"payment {d['payment']['stripe_object_id']}")
        refs.append(f"decision {d['claim_id']} v{d['version']}")
    references = list(dict.fromkeys(refs + cited))
    return Answer(text=str(text).strip(), references=references)


def _answer_from_recall(results) -> tuple[str, list[str]]:
    """Answer text and Cognee's evidence (source documents/chunks and graph nodes it used)."""
    texts, refs = [], []
    for r in results or []:
        text = getattr(r, "text", None)
        if text is None and isinstance(r, dict):
            text = r.get("text") or r.get("search_result")
        if isinstance(text, list):
            text = "\n".join(map(str, text))
        if text:
            texts.append(re.split(r"\n+Evidence:\n- chunk ", str(text))[0])
        meta = getattr(r, "metadata", None) or (r.get("metadata") if isinstance(r, dict) else None) or {}
        ds = getattr(r, "dataset_name", None) or ""
        for ev in meta.get("evidence", []) or []:
            if ev.get("kind") == "segment" and ev.get("document_name"):
                refs.append(f"cognee:{ds}/{ev['document_name']}#chunk{ev.get('chunk_index')}")
            elif ev.get("kind") == "graph_node" and ev.get("label"):
                refs.append(f"cognee-node:{ev['label']}")
    return "\n\n".join(texts).strip(), refs


async def graph_html(claim_id: str | None = None) -> Path:
    """Render the Cognee graph (optionally for one claim) to an HTML file and return its path."""
    import cognee

    await setup()
    dataset = config.DECISIONS_DATASET
    if claim_id is None and not await _dataset(dataset):
        dataset = config.KB_DATASET
    out_dir = config.RUNS_DIR / (claim_id or "memory")
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"graph_{dataset}.html"
    await cognee.visualize_graph(str(path), dataset=dataset, full=True, include_session_events=False)
    return path
