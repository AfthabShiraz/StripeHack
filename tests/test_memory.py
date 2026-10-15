"""Memory smoke tests against real Cognee + Gemini. Run: .venv-claims/bin/python -m pytest tests/test_memory.py -q
The first load_kb takes ~6 minutes (graph extraction); later runs skip it."""

import re

import pytest

from claims_agent import config, memory
from claims_agent.schemas import (
    CheckerReport, CheckResult, ClaimedLine, DecisionRecord, DocItem, DocumentNotes, EvidencePack, EvidenceRef,
    Fact, FinalReview, GateResult, IntakeSummary, LineDecision, LineMoney, PaymentRecord, SectionMoney, Settlement,
)

TEST_CLAIM = "CLM-TEST-000001"


def _flat(s: str) -> str:
    return re.sub(r"\s+", " ", s)


async def test_load_kb_and_section_context():
    await memory.load_kb()
    ctx = _flat(await memory.kb_context("section", "TRV-2026 v1", "E", "Delayed baggage"))
    assert "E.1 What is covered. If your baggage is delayed on your outbound journey for more than 12 hours" in ctx
    assert "E.4.1 items bought after your baggage was returned to you;" in ctx
    assert "2.5 Essential items — replacement clothing, toiletries" in ctx
    assert "Table of Benefits" in ctx and "13. General exclusions" in ctx and "14. General conditions" in ctx
    assert "OE-1" in ctx and "8.1.2 Only receipts timestamped inside that window are eligible" in ctx
    assert "arm's reach" not in ctx and "arm’s reach" not in ctx
    assert "Your phone and gadgets protected" not in ctx and "TRV-2024" not in ctx.replace("Supersedes: TRV-2024 v3", "")

    b2 = _flat(await memory.kb_context("section", "TRV-2026 v1", "B2", "Missed pre-booked excursions"))
    assert "B2.3 Not covered: (a) any amount refunded" in b2 and "arm's reach" not in b2

    checker = _flat(await memory.kb_context("checker", "TRV-2026 v1"))
    assert "F4 Duplicate receipt" in checker and "7.4.1 Each receipt" in checker and "5.2 Original language prevails" in checker
    final = _flat(await memory.kb_context("final", "TRV-2026 v1"))
    assert "P10 Any partial decline satisfies Section 4." in final and "10. The Evidence Pack" in final
    letter = _flat(await memory.kb_context("letter", "TRV-2026 v1"))
    assert "LTR-02" in letter and "Do not use the word \"fraud\"" in letter and "arm's reach" not in letter


def _notes(doc_id: str, heads: list[str]) -> DocumentNotes:
    return DocumentNotes(
        doc_id=doc_id, doc_type="receipt", language="pt", is_original=True, issuer="Farmácia Estrela",
        document_datetime="2026-09-12T18:42", heads=heads, supports_lines=[1], relevance="Essential items, £ and € test",
        summary="Toothbrush and charger.",
        facts=[Fact(label="Receipt time", value="2026-09-12T18:42", quote="12/09/2026 18:42", verified=True)],
        items=[DocItem(description="Escova de dentes", amount=3.2, currency="EUR", quote="ESCOVA DENTES 3,20", verified=True)],
        total=29.25, currency="EUR", payment_method="card",
    )


async def test_notes_round_trip_exact():
    a, b = _notes("E06", ["E"]), _notes("E17", ["C"])
    await memory.remember_notes(TEST_CLAIM, a)
    await memory.remember_notes(TEST_CLAIM, b)
    await memory.remember_notes(TEST_CLAIM, a)  # idempotent
    assert await memory.get_notes(TEST_CLAIM) == [a, b]
    assert await memory.get_notes(TEST_CLAIM, "E") == [a]
    assert await memory.get_notes(TEST_CLAIM, "C") == [b]
    assert await memory.get_notes(TEST_CLAIM, "B2") == []
    a2 = a.model_copy(update={"summary": "Updated summary."})
    await memory.remember_notes(TEST_CLAIM, a2)  # replaced, not duplicated
    assert await memory.get_notes(TEST_CLAIM, "E") == [a2]


def _decision() -> tuple[DecisionRecord, EvidencePack]:
    line = LineDecision(
        line=1, head="E", outcome="PAY", claimed_amount=29.25, claimed_currency="EUR", basis="GBP_DEBITED",
        receipt_total=29.25, eligible_amount=29.25, gbp_debited=25.10, eligible_items=["toothbrush", "charger"],
        excluded_items=[], clause_ids=["E.1", "2.5", "CHG 7.1.1"],
        evidence=[EvidenceRef(doc_id="E06", quote="ESCOVA DENTES 3,20", verified=True)],
        reason="Essential items bought while the bag was delayed.", missing_evidence=[],
    )
    intake = IntakeSummary(
        claim_id=TEST_CLAIM, policy_number="LRK-TEST", policyholder="Test Person", insured_persons=["Test Person"],
        companions_not_insured=[], wording_ref="TRV-2026 v1", cover_level="Silver", extensions=[],
        period_start="2026-09-10", period_end="2026-09-20", returned_home="2026-09-20", notified_on="2026-09-25",
        notified_within_31_days=True, incidents_within_period=True,
        lines=[ClaimedLine(line=1, head="E", head_name="Delayed baggage", description="Essentials", amount=29.25, currency="EUR")],
        summary="Delayed bag essentials.", evidence=[],
    )
    settlement = Settlement(
        lines=[LineMoney(line=1, head="E", outcome="PAY", eligible_gbp=25.10, calculation="£25.10 debited")],
        sections=[SectionMoney(head="E", eligible_gbp=25.10, after_limits_gbp=25.10, excess_gbp=0, net_gbp=25.10,
                               calculation="£25.10, limit £300, nil excess")],
        net_total_gbp=25.10, fraud_score=0, fraud_band="GREEN",
    )
    pack = EvidencePack(
        claim_id=TEST_CLAIM, version=1, intake=intake, documents=[], sections=[],
        checker=CheckerReport(cross_checks=[], indicators=[], line_overrides=[], notes=""),
        final_lines=[line], settlement=settlement,
        markdown="# Evidence Pack CLM-TEST-000001\nLine 1 PAY £25.10 under E.1 and 2.5; evidence E06 \"ESCOVA DENTES 3,20\".",
    )
    ok = CheckResult(id="P1", description="Net ≤ £1,000", passed=True, detail="£25.10")
    record = DecisionRecord(
        claim_id=TEST_CLAIM, version=1, decided_at="2026-10-15T12:00:00+00:00", status="PAID", net_total_gbp=25.10,
        paid_now_gbp=25.10, paid_total_gbp=25.10,
        final_review=FinalReview(verdict="AGREE", summary="Supported.", concerns=[], preconditions=[ok]),
        gate=GateResult(passed=True, checks=[ok], amount_to_pay_gbp=25.10),
        payment=PaymentRecord(claim_id=TEST_CLAIM, version=1, amount_gbp=25.10, idempotency_key=f"{TEST_CLAIM}-v1",
                              stripe_object_id="tr_test123", stripe_destination="acct_test", status="paid",
                              dashboard_url="https://dashboard.stripe.com/test/transfers/tr_test123",
                              created_at="2026-10-15T12:00:01+00:00"),
        pack_sha256="0" * 64,
    )
    return record, pack


async def test_decision_history_and_ask():
    record, pack = _decision()
    await memory.remember_decision(TEST_CLAIM, record, pack)
    assert "CLM-TEST-000001" in await memory.claims_history("test person", "CLM-OTHER")
    assert await memory.claims_history("Test Person", TEST_CLAIM) == ""
    answer = await memory.ask("Why did you pay £25.10 on this claim?", TEST_CLAIM)
    print(answer.text, answer.references)
    assert answer.text and "E.1" in answer.text
    assert "payment tr_test123" in answer.references
    path = await memory.graph_html(TEST_CLAIM)
    assert path.exists() and path.stat().st_size > 1000


@pytest.fixture(scope="module", autouse=True)
async def cleanup():
    yield
    import cognee

    await memory.setup()
    ds = await memory._dataset(config.claim_dataset(TEST_CLAIM))
    if ds:
        await cognee.forget(dataset=config.claim_dataset(TEST_CLAIM))
    dec = await memory._dataset(config.DECISIONS_DATASET)
    for row in await memory._rows(config.DECISIONS_DATASET):
        if memory._meta(row).get("claim_id") == TEST_CLAIM:
            await cognee.forget(data_id=row.id, dataset_id=dec.id)
