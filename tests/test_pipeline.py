"""Offline pipeline tests. Memory (Cognee) and the LLM agents are faked; quotes, money, gate and the payments
adapter are the real modules, with payments forced to DRY_RUN and the live Stripe call booby-trapped."""

from __future__ import annotations

import asyncio
import json

import pytest

from claims_agent import agents, config, memory, packs, payments, pipeline, state
from claims_agent.schemas import (
    Answer,
    CheckerReport,
    CheckResult,
    ClaimedLine,
    DocumentNotes,
    EvidenceRef,
    Fact,
    FinalReview,
    Indicator,
    IntakeSummary,
    LineDecision,
    Letter,
    SectionAssessment,
)

CLAIM = "CLM-2026-004817"
DOC_HEADS = {"00": ["E", "D", "C"], "E06": ["E"], "E07": ["E"], "M02": ["E"], "E12": ["D"], "E13": ["D"], "E15": ["C"], "CERT": ["D"]}
HEAD_NAMES = {"E": "Delayed baggage", "D": "Personal belongings", "C": "Medical expenses"}


def _quote(text: str) -> str:
    """Six words from the longest line of the real PDF text (body text, not page furniture)."""
    line = max(text.splitlines(), key=lambda l: len(l.split()))
    return " ".join(line.split()[:6])


INTAKE = IntakeSummary(
    claim_id=CLAIM, policy_number="LRK-TRV-26-0071934", policyholder="Eleanor Whitcombe",
    insured_persons=["Eleanor Whitcombe"], companions_not_insured=["Tom Ashdown"], wording_ref="TRV-2026 v1",
    cover_level="SILVER", extensions=[], period_start="2026-09-12", period_end="2026-09-19", returned_home="2026-09-19",
    notified_on="2026-09-24", notified_within_31_days=True, incidents_within_period=True,
    lines=[
        ClaimedLine(line=1, head="E", head_name="Delayed baggage", description="Toiletries", incident_date="2026-09-12", amount=100, currency="GBP"),
        ClaimedLine(line=2, head="E", head_name="Delayed baggage", description="Clothes", incident_date="2026-09-12", amount=100, currency="GBP"),
        ClaimedLine(line=3, head="D", head_name="Personal belongings", description="Phone", incident_date="2026-09-15", amount=649, currency="GBP"),
        ClaimedLine(line=4, head="C", head_name="Medical expenses", description="Clinic", incident_date="2026-09-16", amount=185, currency="GBP"),
    ],
    summary="Test claim.", evidence=[],
)


class World:
    """Fake Cognee memory + fake agents, recording what ran."""

    def __init__(self, pend_without_e12: bool = False):
        self.pend = pend_without_e12
        self.memory_notes: dict[str, DocumentNotes] = {}
        self.readers: list[str] = []
        self.sections: list[str] = []
        self.decisions: list[int] = []
        self.in_flight = self.max_in_flight = 0

    # -- memory
    async def setup(self): pass
    async def load_kb(self, force=False): pass
    async def remember_document(self, claim_id, doc): pass
    async def remember_notes(self, claim_id, notes): self.memory_notes[notes.doc_id] = notes
    async def get_notes(self, claim_id, head=None):
        return [n for n in self.memory_notes.values() if head is None or head in n.heads]
    async def kb_context(self, purpose, wording_ref, head=None, head_name=None): return f"rules for {purpose} {head or ''}"
    async def claims_history(self, policyholder, claim_id): return "No earlier claims."
    async def remember_decision(self, claim_id, record, pack): self.decisions.append(record.version)
    async def ask(self, question, claim_id=None): return Answer(text=f"Answer to {question}", references=["E.1"])

    # -- agents
    async def run_intake(self, form, cert, admin): return INTAKE.model_copy(deep=True)

    async def run_reader(self, doc, intake):
        self.in_flight += 1
        self.max_in_flight = max(self.max_in_flight, self.in_flight)
        await asyncio.sleep(0.001)
        self.in_flight -= 1
        self.readers.append(doc.doc_id)
        heads = DOC_HEADS.get(doc.doc_id, [])
        return DocumentNotes(
            doc_id=doc.doc_id, doc_type="other", language="en", is_original=True, heads=heads, supports_lines=[],
            relevance="test" if heads else "not about the claim", summary="",
            facts=[Fact(label="text", value="x", quote=_quote(doc.text))], items=[],
        )

    async def run_section(self, head, head_name, intake, notes, kb):
        self.sections.append(head)
        ids = {n.doc_id for n in notes}
        evidence = [EvidenceRef(doc_id=n.doc_id, quote=n.facts[0].quote) for n in notes if n.facts][:3]

        def line(n, outcome, eligible=None):
            paying = outcome in ("PAY", "PAY_PARTIAL")
            return LineDecision(
                line=n, head=head, outcome=outcome, claimed_amount=100, claimed_currency="GBP",
                basis="GBP_NATIVE" if paying else "NONE", eligible_amount=eligible, eligible_items=[], excluded_items=[],
                clause_ids=["X.1"], evidence=evidence, reason="test",
                objective_exclusion="OE-3" if outcome == "DECLINE" else None,
                missing_evidence=["the original police report"] if outcome == "PEND" else [],
            )

        if head == "E":
            lines = [line(1, "PAY", 30.0), line(2, "PAY", 80.0 if "M02" in ids else 70.0)]
        elif head == "D":
            lines = [line(3, "PEND" if self.pend and "E12" not in ids else "DECLINE")]
        else:
            lines = [line(4, "PAY", 150.0)]
        return SectionAssessment(
            head=head, head_name=head_name, lines=lines, section_limit_gbp=1000.0, sub_limits=[],
            excess_gbp=100.0 if head == "C" else 0.0, excess_waived=False, excess_reason="test", clause_ids=["X.1"], notes="",
        )

    async def run_checker(self, intake, notes, sections, kb, history):
        return CheckerReport(cross_checks=[], line_overrides=[], notes="",
                             indicators=[Indicator(id="F4", name="Duplicate receipt", triggered=True, weight=10, evidence="E06")])

    async def run_final(self, markdown, kb):
        assert "## 8. Recommended decision" in markdown
        return FinalReview(verdict="AGREE", summary="consistent", concerns=[],
                           preconditions=[CheckResult(id="P1", description="limit", passed=True, detail="ok")])

    async def write_decision_letter(self, pack, summary, kb): return Letter(subject="Your claim decision", body_markdown=summary)
    async def write_evidence_request(self, intake, missing, kb): return Letter(subject="One more document, please", body_markdown="\n".join(missing))


@pytest.fixture
def world(tmp_path, monkeypatch):
    def install(**kwargs) -> World:
        w = World(**kwargs)
        monkeypatch.setattr(config, "RUNS_DIR", tmp_path / "runs")
        monkeypatch.delenv("LIVE_PAYMENTS", raising=False)
        for name in ("setup", "load_kb", "remember_document", "remember_notes", "get_notes", "kb_context",
                     "claims_history", "remember_decision", "ask"):
            monkeypatch.setattr(memory, name, getattr(w, name))
        for name in ("run_intake", "run_reader", "run_section", "run_checker", "run_final",
                     "write_decision_letter", "write_evidence_request"):
            monkeypatch.setattr(agents, name, getattr(w, name))

        def no_live_stripe(*a, **k):
            raise AssertionError("tests must never call Stripe")
        monkeypatch.setattr(payments.stripe_payout, "pay_claim", no_live_stripe)
        return w
    return install


async def test_start_with_default_hold_back_reaches_a_decision(world):
    w = world()
    st = await pipeline.start_claim(CLAIM)

    assert st.status == "PAID", [e.message for e in st.timeline[-6:]]
    assert st.decision_version == 1
    assert pipeline.pending_documents(CLAIM) == ["M02", "M03", "E12", "E20"]
    assert len(w.readers) == 45 + 2 and "E12" not in w.readers and {"CERT", "ADMIN"} <= set(w.readers)
    assert 1 < w.max_in_flight <= pipeline.READER_CONCURRENCY
    assert sorted(w.sections) == ["C", "D", "E"]
    # E 30 + 70, D declined, C 150 - 100 excess
    assert st.paid_total_gbp == 150.0
    assert [(p.version, p.amount_gbp, p.status) for p in st.payments] == [(1, 150.0, "DRY_RUN")]
    assert w.decisions == [1]

    for rel in ("intake.json", "notes/E06.json", "sections/E.json", "sections/D.json", "sections/C.json",
                "v1/checker.json", "v1/final_input.md", "v1/final.json", "v1/payment.json", "v1/pack.json",
                "v1/pack.md", "v1/letter.md", "v1/decision.json"):
        assert state.artifact_path(CLAIM, rel).exists(), rel
    pack = pipeline.latest_pack(CLAIM)
    decision = pipeline.latest_decision(CLAIM)
    assert decision.pack_sha256 == packs.pack_sha256(pack)
    assert decision.status == "PAID" and decision.paid_now_gbp == 150.0 and decision.gate.passed
    md = state.read_artifact(CLAIM, "v1/pack.md")
    for heading in ("## 1. Claim summary", "## 2. Coverage verification", "## 3. Document index",
                    "## 4. Line-item findings", "## 5. Consistency & fraud screen", "## 6. Settlement calculation",
                    "## 7. Authority check", "## 8. Recommended decision"):
        assert heading in md
    assert "✓ **E06**" in md  # real quote check ran
    assert any(e.step == "reader" and e.message.startswith("Reader E06:") for e in st.timeline)
    assert any("DRY RUN" in e.message for e in st.timeline if e.step == "payment")
    on_disk = json.loads(state.artifact_path(CLAIM, "state.json").read_text())
    assert on_disk["status"] == "PAID"


async def test_pend_waits_then_late_evidence_reruns_only_affected_heads_and_tops_up(world):
    w = world(pend_without_e12=True)
    st = await pipeline.start_claim(CLAIM)
    assert st.status == "WAITING" and st.decision_version == 0 and not st.payments
    assert any("police report" in item for item in st.waiting_for)
    assert state.artifact_path(CLAIM, "requests/1.md").exists()
    assert not state.artifact_path(CLAIM, "v1").exists()

    # the police report arrives: only D re-runs, the claim is decided and paid
    w.readers.clear(), w.sections.clear()
    st = await pipeline.add_documents(CLAIM, ["E12"])
    assert w.readers == ["E12"] and w.sections == ["D"]
    assert st.status == "PAID" and st.decision_version == 1 and st.paid_total_gbp == 150.0
    assert "E12" in st.documents_received and pipeline.pending_documents(CLAIM) == ["M02", "M03", "E20"]

    # a late email changes head E: only E re-runs, v2 pays only the £10 difference
    w.readers.clear(), w.sections.clear()
    st = await pipeline.add_documents(CLAIM, ["m02"])  # case-insensitive
    assert w.readers == ["M02"] and w.sections == ["E"]
    assert st.status == "PAID" and st.decision_version == 2 and st.paid_total_gbp == 160.0
    assert [(p.version, p.amount_gbp) for p in st.payments] == [(1, 150.0), (2, 10.0)]
    v2 = pipeline.latest_decision(CLAIM)
    assert v2.version == 2 and v2.paid_now_gbp == 10.0 and v2.payment.idempotency_key == f"{CLAIM}-v2"

    # an irrelevant document re-runs nothing and pays nothing more
    w.sections.clear()
    st = await pipeline.add_documents(CLAIM, ["M03"])
    assert w.sections == [] and st.status == "NO_PAYMENT_DUE" and st.decision_version == 3 and st.paid_total_gbp == 160.0
    assert len(st.payments) == 2

    with pytest.raises(ValueError):
        await pipeline.add_documents(CLAIM, ["E99"])
    assert (await pipeline.ask(CLAIM, "why?")).references == ["E.1"]


async def test_failure_sets_error_and_resume_finishes(world):
    w = world()
    original = w.run_section

    async def broken(head, *args):
        if head == "C":
            raise RuntimeError("model unavailable")
        return await original(head, *args)

    agents.run_section = broken  # restored by monkeypatch at teardown
    with pytest.raises(RuntimeError, match="Section C"):
        await pipeline.start_claim(CLAIM)
    st = state.load_state(CLAIM)
    assert st.status == "ERROR" and st.timeline[-1].step == "error"

    agents.run_section = original
    st = await pipeline.resume(CLAIM)
    assert st.status == "PAID" and st.decision_version == 1
