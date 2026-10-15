"""Agent tests with real Gemini calls (slow; needs GEMINI_API_KEY).

Intake and reader notes are cached under runs/test_cache/agents/ so section tests can be rerun cheaply;
set REFRESH_AGENT_CACHE=1 to regenerate them. The KB context here is built from the company documents'
text (the pipeline gets it from Cognee). The answer key is read by tests only, never shown to agents.
"""

from __future__ import annotations

import asyncio
import json
import os
import re

import pytest

from claims_agent import agents, config, documents
from claims_agent.schemas import DocumentNotes, IntakeSummary, SectionAssessment

CLAIM = "CLM-2026-004817"
POLICY = "LRK-TRV-26-0071934"
CACHE = config.RUNS_DIR / "test_cache" / "agents"
REFRESH = os.environ.get("REFRESH_AGENT_CACHE") == "1"

pytestmark = pytest.mark.skipif(not config.GEMINI_API_KEY, reason="GEMINI_API_KEY not set")

# Documents each section agent gets notes for (claim form, statement and the evidence for that head).
SECTION_DOCS = {
    "E": ["00", "01", "E04", "E05", "E06", "E07", "E08", "E09", "E10", "E21", "E22"],
    "C": ["00", "01", "E15", "E16", "E17", "E18a", "E18b", "E21"],
}


def _norm(text: str) -> str:
    return agents._norm(text)


def answer_key() -> dict:
    return json.loads((config.ANSWER_KEY_DIR / f"{CLAIM}_expected_outcome.json").read_text())


def company_text() -> dict[str, str]:
    return {d.doc_id: d.text for _, d in documents.company_documents()}


def kb_context(purpose: str) -> str:
    """Stand-in for memory.kb_context: governing wording + guidelines + SAP-01 Appendix B, etc."""
    t = company_text()
    sap = t["SAP-01"]
    appendix_b = sap[sap.index("Appendix B") :]
    parts = {
        "section": [("WORDING-2026", t["WORDING-2026"]), ("CHG-TRV", t["CHG-TRV"]), ("SAP-01 Appendix B", appendix_b)],
        "checker": [("FRD-03", t["FRD-03"]), ("CHG-TRV", t["CHG-TRV"]), ("WORDING-2026", t["WORDING-2026"])],
        "final": [("SAP-01", sap), ("FRD-03", t["FRD-03"]), ("CHG-TRV", t["CHG-TRV"])],
        "letter": [("LTR-02", t["LTR-02"]), ("WORDING-2026", t["WORDING-2026"])],
    }[purpose]
    return "\n\n".join(f"=== {name} ===\n{text}" for name, text in parts)


def claim_docs(ids: list[str]):
    return {d.doc_id: d for d in documents.claim_documents(CLAIM, ids)}


async def get_intake() -> IntakeSummary:
    path = CACHE / "intake.json"
    if path.exists() and not REFRESH:
        return IntakeSummary.model_validate_json(path.read_text())
    form = claim_docs(["00"])["00"]
    cert, admin = sorted(documents.policy_documents(POLICY), key=lambda d: d.doc_id != "CERT")
    intake = await agents.run_intake(form, cert, admin)
    CACHE.mkdir(parents=True, exist_ok=True)
    path.write_text(intake.model_dump_json(indent=1))
    return intake


async def get_notes(ids: list[str], intake: IntakeSummary) -> list[DocumentNotes]:
    docs = claim_docs(ids)

    async def one(doc_id: str) -> DocumentNotes:
        path = CACHE / f"notes_{doc_id}.json"
        if path.exists() and not REFRESH:
            return DocumentNotes.model_validate_json(path.read_text())
        notes = await agents.run_reader(docs[doc_id], intake)
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(notes.model_dump_json(indent=1))
        return notes

    return list(await asyncio.gather(*(one(i) for i in ids)))


def unverified_quotes(obj, texts: dict[str, str], default_doc: str | None = None) -> list[str]:
    """Simple whitespace/case/accent-normalised substring check of every quote against its document."""
    bad = []

    def walk(node, doc_id):
        if hasattr(node, "model_fields"):
            doc_id = getattr(node, "doc_id", None) if isinstance(getattr(node, "doc_id", None), str) else doc_id
            quote = getattr(node, "quote", None)
            if isinstance(quote, str):
                if doc_id not in texts or _norm(quote) not in _norm(texts[doc_id]):
                    bad.append(f"{doc_id}: {quote}")
            for name in type(node).model_fields:
                walk(getattr(node, name), doc_id)
        elif isinstance(node, list):
            for item in node:
                walk(item, doc_id)

    walk(obj, default_doc)
    return bad


def all_texts() -> dict[str, str]:
    texts = {d.doc_id: d.text for d in documents.claim_documents(CLAIM)}
    texts.update({d.doc_id: d.text for d in documents.policy_documents(POLICY)})
    return texts


def save_run(name: str, obj) -> None:
    runs = CACHE / "runs"
    runs.mkdir(parents=True, exist_ok=True)
    n = len(list(runs.glob(f"{name}_*.json"))) + 1
    (runs / f"{name}_{n}.json").write_text(obj.model_dump_json(indent=1))


# ---------------------------------------------------------------- tests


async def test_intake():
    intake = await get_intake()
    assert intake.wording_ref.replace(" ", "").upper() == "TRV-2026V1"
    assert intake.cover_level.strip().upper() == "SILVER"
    assert intake.extensions == []
    assert [p.lower() for p in intake.insured_persons] == ["eleanor whitcombe"]
    assert any("tom" in c.lower() for c in intake.companions_not_insured)
    assert [ln.line for ln in intake.lines] == list(range(1, 13))
    heads = {ln.line: ln.head for ln in intake.lines}
    assert [heads[i] for i in range(1, 13)] == ["E"] * 6 + ["D"] + ["C"] * 4 + ["B2"]
    assert intake.notified_within_31_days and intake.incidents_within_period
    assert unverified_quotes(intake, all_texts()) == []


async def test_readers():
    intake = await get_intake()
    ids = ["E06", "E12", "E13", "E21", "E33"]
    notes = {n.doc_id: n for n in await get_notes(ids, intake)}
    texts = all_texts()
    for n in notes.values():
        assert unverified_quotes(n, texts, n.doc_id) == [], n.doc_id
    assert notes["E13"].is_original is False
    assert notes["E12"].is_original is True
    assert notes["E33"].heads == [] and notes["E33"].supports_lines == []
    assert "E" in notes["E06"].heads and 1 in notes["E06"].supports_lines
    assert "D" in notes["E12"].heads
    e06_items = {round(i.amount, 2) for i in notes["E06"].items}
    assert 14.95 in e06_items and 3.20 in e06_items
    debits = {round(i.gbp_debited or 0, 2) for i in notes["E21"].items}
    assert {32.86, 36.15, 103.38, 158.66} <= debits
    # The original police report's account of the unattended bag is captured verbatim.
    assert any("sem vigil" in _norm(f.quote) for f in notes["E12"].facts)


async def run_section(head: str, head_name: str) -> SectionAssessment:
    intake = await get_intake()
    notes = await get_notes(SECTION_DOCS[head], intake)
    notes = [n for n in notes if head in n.heads]
    section = await agents.run_section(head, head_name, intake, notes, kb_context("section"))
    save_run(f"section_{head}", section)
    return section


async def test_section_E():
    section = await run_section("E", "Delayed baggage")
    by_line = {d.line: d for d in section.lines}
    assert sorted(by_line) == [1, 2, 3, 4, 5, 6]
    for n in (1, 2, 3, 4):
        assert by_line[n].outcome == "PAY", (n, by_line[n].reason)
        assert by_line[n].basis == "GBP_DEBITED"
    assert by_line[1].gbp_debited == pytest.approx(32.86)
    assert by_line[1].eligible_amount == pytest.approx(38.40)  # sunscreen is a toiletry under E (C7.2 is Section C only)
    assert by_line[5].outcome == "DECLINE" and by_line[5].objective_exclusion == "OE-8"
    assert by_line[6].outcome == "DECLINE"
    assert any(re.sub(r"\s", "", c).startswith("E.4.1") for c in by_line[6].clause_ids)
    assert section.excess_gbp == 0 and section.section_limit_gbp == pytest.approx(300)
    assert unverified_quotes(section, all_texts()) == []


async def test_section_C():
    section = await run_section("C", "Emergency medical and associated expenses")
    by_line = {d.line: d for d in section.lines}
    assert sorted(by_line) == [8, 9, 10, 11]
    assert by_line[8].outcome == "PAY" and by_line[8].gbp_debited == pytest.approx(158.66)
    d9 = by_line[9]
    assert d9.outcome == "PAY_PARTIAL" and d9.basis == "GBP_DEBITED"
    assert (d9.eligible_amount, d9.receipt_total, d9.gbp_debited) == pytest.approx((29.25, 42.15, 36.15))
    for n in (10, 11):
        d = by_line[n]
        assert d.outcome == "PAY" and d.basis == "FX_REFERENCE", (n, d.reason)
        assert d.fx_date == "2026-09-16" and d.sub_limit == "C3"
    assert section.excess_gbp == pytest.approx(100) and section.excess_waived is False
    assert any(s.code == "C3" and s.limit_gbp == pytest.approx(100) for s in section.sub_limits)
    assert unverified_quotes(section, all_texts()) == []
