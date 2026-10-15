"""Core (code-only) parts: money maths, quote checks, gate, payments adapter. No LLM, no Stripe calls
(the payments tests force or fake the dry run; CLM-2026-004817's idempotency key must stay unused)."""

import datetime as dt
import json

import pytest

from claims_agent import documents, gate, money, payments, quotes
from claims_agent.config import ANSWER_KEY_DIR
from claims_agent.schemas import (
    Concern,
    DocItem,
    DocumentNotes,
    EvidenceRef,
    Fact,
    FinalReview,
    Indicator,
    LineDecision,
    SectionAssessment,
    SubLimit,
)

CLAIM = "CLM-2026-004817"
TODAY = dt.date(2026, 10, 15)
ANSWER_KEY = json.loads((ANSWER_KEY_DIR / f"{CLAIM}_expected_outcome.json").read_text())


def line(n, head, outcome, claimed, currency="EUR", basis="NONE", clauses=("X.1",), doc="E21", **kw):
    return LineDecision(
        line=n, head=head, outcome=outcome, claimed_amount=claimed, claimed_currency=currency, basis=basis,
        eligible_items=[], excluded_items=[], clause_ids=list(clauses),
        evidence=[EvidenceRef(doc_id=doc, quote="quote", verified=True)],
        reason="r", missing_evidence=[], **kw,
    )


def debited(n, head, claimed, gbp, outcome="PAY", eligible=None, **kw):
    return line(n, head, outcome, claimed, basis="GBP_DEBITED", receipt_total=claimed,
                eligible_amount=claimed if eligible is None else eligible, gbp_debited=gbp, **kw)


def answer_key_lines():
    return [
        debited(1, "E", 38.40, 32.86, clauses=("E.1", "2.5", "GC.5", "CHG 7.1.1")),
        debited(2, "E", 86.50, 74.02, clauses=("E.1", "2.5")),
        debited(3, "E", 84.90, 72.61, clauses=("E.1", "2.5", "CHG 8.1.3")),
        debited(4, "E", 29.99, 25.65, clauses=("E.1", "2.5")),
        line(5, "E", "DECLINE", 38.40, clauses=("CHG 7.4",), doc="E06", objective_exclusion="OE-8"),
        line(6, "E", "DECLINE", 139.00, clauses=("E.4.1", "E.4.2"), doc="E10", objective_exclusion="OE-1"),
        line(7, "D", "DECLINE", 649.00, currency="GBP", clauses=("D.4.4", "D.4.5", "2.12"), doc="E12", objective_exclusion="OE-3"),
        debited(8, "C", 185.00, 158.66, clauses=("C1.1",)),
        debited(9, "C", 42.15, 36.15, outcome="PAY_PARTIAL", eligible=29.25, clauses=("C1.2", "C7.2")),
        line(10, "C", "PAY", 16.80, basis="FX_REFERENCE", eligible_amount=16.80, fx_date="2026-09-16", sub_limit="C3", clauses=("C3",), doc="E18a"),
        line(11, "C", "PAY", 41.30, basis="FX_REFERENCE", eligible_amount=41.30, fx_date="2026-09-16", sub_limit="C3", clauses=("C3",), doc="E18b"),
        debited(12, "B2", 120.00, 103.38, outcome="PAY_PARTIAL", eligible=60.00, clauses=("B2.1", "B2.2", "B2.3(b)")),
    ]


def section(head, limit, excess, sub_limits=(), waived=False):
    return SectionAssessment(
        head=head, head_name=head, lines=[], section_limit_gbp=limit,
        sub_limits=[SubLimit(code=c, limit_gbp=v) for c, v in sub_limits], excess_gbp=excess,
        excess_waived=waived, excess_reason="", clause_ids=[], notes="",
    )


def answer_key_sections(c_excess=100, c_waived=False):
    return [
        section("E", 300, 0),
        section("C", 5_000_000, c_excess, sub_limits=[("C3", 100)], waived=c_waived),
        section("B2", 250, 0),
        section("D", 1500, 75),
    ]


def indicators(triggered=("F2", "F4", "F5")):
    return [
        Indicator(id=f"F{i}", name=f"F{i}", triggered=f"F{i}" in triggered, weight=money.FRD03_WEIGHTS[f"F{i}"], evidence="")
        for i in range(1, 12)
    ]


def nets(settlement):
    return {s.head: s.net_gbp for s in settlement.sections}


# ---------------------------------------------------------------- money


def test_fx_table():
    fx = money.load_fx_rates()
    assert fx["2026-09-16"] == 0.8540 and fx["2026-08-28"] == 0.8468 and len(fx) == 12


def test_answer_key_settlement():
    s = money.settle(answer_key_lines(), answer_key_sections(), indicators())
    assert nets(s) == {"E": 205.14, "C": 133.37, "B2": 51.69, "D": 0.0}
    assert s.net_total_gbp == 390.20
    assert (s.fraud_score, s.fraud_band) == (30, "AMBER")
    assert {m.line: m.eligible_gbp for m in s.lines} == {l["line"]: l["payable_gbp"] for l in ANSWER_KEY["lines"]}
    by_line = {m.line: m for m in s.lines}
    assert by_line[9].calculation == "£36.15 × 29.25 / 42.15 = £25.09"
    assert by_line[10].calculation == "EUR 16.80 × 0.8540 (FX-REF 2026-09-16) = £14.35"
    c = next(x for x in s.sections if x.head == "C")
    assert (c.eligible_gbp, c.after_limits_gbp, c.excess_gbp) == (233.37, 233.37, 100.0)
    d = next(x for x in s.sections if x.head == "D")
    assert d.excess_gbp == 0.0  # excess not applied when nothing is eligible


def _mutated(n, **changes):
    lines = answer_key_lines()
    lines[n - 1] = lines[n - 1].model_copy(update=changes)
    return lines


# The answer key's "common wrong answers": each mistake, made on purpose, must give the key's wrong total.
WRONG_ANSWERS = {
    "Tom's half of the excursion paid": (lambda: (_mutated(12, outcome="PAY", eligible_amount=120.0), answer_key_sections()), 441.89),
    "duplicate pharmacy receipt kept": (lambda: (_mutated(5, outcome="PAY", basis="GBP_DEBITED", receipt_total=38.40, eligible_amount=38.40, gbp_debited=32.86), answer_key_sections()), 423.06),
    "jacket included (E capped at £300)": (lambda: (_mutated(6, outcome="PAY", basis="GBP_DEBITED", receipt_total=139.0, eligible_amount=139.0, gbp_debited=119.06), answer_key_sections()), 485.06),
    "GHIC excess wrongly waived": (lambda: (answer_key_lines(), answer_key_sections(c_waived=True)), 490.20),
    "sunscreen kept on the medical receipt": (lambda: (_mutated(9, outcome="PAY", eligible_amount=42.15), answer_key_sections()), 401.26),
    "sunscreen removed from the Section E receipt too": (lambda: (_mutated(1, outcome="PAY_PARTIAL", eligible_amount=38.40 - 14.95), answer_key_sections()), 377.41),
    "phone paid at the £300 single-article value": (lambda: (_mutated(7, outcome="PAY", basis="GBP_NATIVE", eligible_amount=300.0), answer_key_sections()), 615.20),
    "TRV-2024 wording (C excess £75, no B2)": (lambda: (_mutated(12, outcome="DECLINE", basis="NONE"), answer_key_sections(c_excess=75)), 363.51),
}


@pytest.mark.parametrize("mistake", list(WRONG_ANSWERS))
def test_common_wrong_answers(mistake):
    build, expected = WRONG_ANSWERS[mistake]
    lines, sections = build()
    assert money.settle(lines, sections, indicators()).net_total_gbp == expected


def test_fx_instead_of_gbp_debited_for_section_e():
    lines = answer_key_lines()
    dates = {1: "2026-09-12", 2: "2026-09-12", 3: "2026-09-13", 4: "2026-09-13"}
    for n, date in dates.items():
        lines[n - 1] = lines[n - 1].model_copy(update={"basis": "FX_REFERENCE", "fx_date": date})
    assert money.settle(lines, answer_key_sections(), indicators()).net_total_gbp == 389.31


def test_rounding_half_up_per_line_before_summing():
    fx = {"2026-09-16": 0.5}
    lines = [line(n, "C", "PAY", 0.25, basis="FX_REFERENCE", fx_date="2026-09-16") for n in (1, 2)]
    s = money.settle(lines, [section("C", 1000, 0)], [], fx=fx)
    assert [m.eligible_gbp for m in s.lines] == [0.13, 0.13]  # 0.125 -> 0.13 (half-up, not banker's)
    assert s.net_total_gbp == 0.26  # rounded per line, then summed (not 0.25)


def test_sub_limit_cap_excess_floor_and_fraud_bands():
    lines = [line(1, "C", "PAY", 80, basis="GBP_NATIVE", currency="GBP", sub_limit="C3"),
             line(2, "C", "PAY", 40, basis="GBP_NATIVE", currency="GBP", sub_limit="C3"),
             line(3, "D", "PAY", 50, basis="GBP_NATIVE", currency="GBP")]
    s = money.settle(lines, [section("C", 5000, 0, sub_limits=[("C3", 100)]), section("D", 1500, 75)], [])
    assert nets(s) == {"C": 100.0, "D": 0.0} and s.fraud_band == "GREEN"
    dup = indicators(("F4",)) + [Indicator(id="F4", name="dup", triggered=True, weight=10, evidence="")]
    assert money.fraud_score(dup) == 10  # each ID once
    assert money.fraud_band(24) == "GREEN" and money.fraud_band(25) == "AMBER" and money.fraud_band(39) == "AMBER" and money.fraud_band(40) == "RED"


def test_money_errors_are_loud():
    with pytest.raises(money.MoneyError, match="fx_date"):
        money.line_gbp(line(1, "C", "PAY", 10, basis="FX_REFERENCE"), money.load_fx_rates())
    with pytest.raises(money.MoneyError, match="eligible_amount"):
        money.line_gbp(line(1, "C", "PAY_PARTIAL", 10, basis="GBP_DEBITED", gbp_debited=9.0), {})
    with pytest.raises(money.MoneyError, match="sub-limit"):
        money.settle([line(1, "C", "PAY", 10, basis="GBP_NATIVE", currency="GBP", sub_limit="C3")], [section("C", 100, 0)], [])


# ---------------------------------------------------------------- quotes (real PDF text)


@pytest.fixture(scope="module")
def docs():
    return {d.doc_id: d.text for d in documents.claim_documents(CLAIM, ["E12", "E17", "E21"])}


def test_quotes_on_real_pdf_text(docs):
    e12 = "deixou o seu saco de praia sobre a toalha, na areia, sem vigilância"  # spans a line break in the PDF
    assert "saco de\n praia" in docs["E12"]
    refs = [
        EvidenceRef(doc_id="E12", quote=e12),
        EvidenceRef(doc_id="E12", quote="Deixou o seu saco de praia sobre a toalha, na areia, sem vigilancia"),  # no accents
        EvidenceRef(doc_id="E12", quote=e12 + ", enquanto nadava no mar … a uma distância aproximada de 40 (quarenta) metros"),
        EvidenceRef(doc_id="E12", quote="encontravam os seus pertences. Que, ao regressar, verificou que o saco tinha sido aberto"),  # page break
        EvidenceRef(doc_id="E12_police_report_PSP_original_PT.pdf", quote="sem vigilância"),
        EvidenceRef(doc_id="E21", quote="16 Sep 18 Sep FARMACIA CENTRAL SINTRA PT EUR 42.15 £36.15"),
        EvidenceRef(doc_id="E17", quote="Farmácia Central de Sintra"),
    ]
    decision = line(7, "D", "DECLINE", 649.0, currency="GBP").model_copy(update={"evidence": refs})
    assert quotes.verify_quotes(decision, docs) == []
    assert all(r.verified for r in refs)
    assert refs[4].doc_id == "E12"  # filename citation rewritten to the manifest ID

    bad = [EvidenceRef(doc_id="E12", quote="she was sitting right next to her bag", verified=True),
           EvidenceRef(doc_id="E13", quote="sem vigilância"), EvidenceRef(doc_id="E12", quote="  ")]
    failures = quotes.verify_quotes(decision.model_copy(update={"evidence": bad}), docs)
    assert len(failures) == 3 and not any(r.verified for r in bad)  # LLM's verified=True is overwritten
    assert "quote not found in E12" in failures[0] and "E13" in failures[1]


def test_quotes_inside_document_notes(docs):
    notes = DocumentNotes(
        doc_id="E17", doc_type="receipt", language="pt", is_original=True, heads=["C"], supports_lines=[9],
        relevance="", summary="",
        facts=[Fact(label="Receipt", value="FCS 2026/A/09921", quote="FATURA-RECIBO FCS 2026/A/09921"),
               Fact(label="Made up", value="x", quote="Paracetamol 500mg")],
        items=[DocItem(description="Sunscreen", amount=12.90, currency="EUR", quote="Protetor solar FPS50 spray 1 12.90 23%")],
    )
    failures = quotes.verify_quotes(notes, docs)
    assert [f.verified for f in notes.facts] == [True, False] and notes.items[0].verified
    assert len(failures) == 1 and "facts" in failures[0]


# ---------------------------------------------------------------- gate


def final(verdict="AGREE", concerns=()):
    return FinalReview(verdict=verdict, summary="ok", concerns=list(concerns), preconditions=[])


def test_gate_checks():
    lines = answer_key_lines()
    assert gate.gate_passed(gate.pre_payment_checks(final(), lines))

    def failing(checks):
        return {c.id for c in checks if not c.passed}

    assert failing(gate.pre_payment_checks(final("REFER"), lines)) == {"FINAL_AGREE"}
    assert failing(gate.pre_payment_checks(final(concerns=[Concern(line=9, concern="x", material=True)]), lines)) == {"NO_MATERIAL_CONCERNS"}
    assert failing(gate.pre_payment_checks(final(concerns=[Concern(concern="minor", material=False)]), lines)) == set()
    pend = _mutated(12, outcome="PEND")
    assert failing(gate.pre_payment_checks(final(), pend)) == {"NO_PEND_OR_REFER"}
    no_clause = _mutated(5, clause_ids=[" "])
    assert failing(gate.pre_payment_checks(final(), no_clause)) == {"CLAUSES_CITED"}
    unverified = _mutated(7, evidence=[EvidenceRef(doc_id="E12", quote="q", verified=False)])
    assert failing(gate.pre_payment_checks(final(), unverified)) == {"EVIDENCE_VERIFIED"}


def answer_key_decision(settle=True, version=1):
    lines = answer_key_lines()
    s = money.settle(lines, answer_key_sections(), indicators())
    return gate.decision_dict(CLAIM, version, lines, s, settle, indicators=indicators())


def test_decision_dict_matches_answer_key_and_guardrails():
    d = answer_key_decision()
    assert d["overall_decision"] == "SETTLE" and d["decision_version"] == 1
    assert d["net_payable_gbp"] == ANSWER_KEY["net_payable_gbp"]
    assert {k: v["net_gbp"] for k, v in d["sections"].items()} == {k: v["net_gbp"] for k, v in ANSWER_KEY["sections"].items()}
    assert [(l["line"], l["outcome"], l["payable_gbp"]) for l in d["lines"]] == [(l["line"], l["outcome"], l["payable_gbp"]) for l in ANSWER_KEY["lines"]]
    assert d["fraud"] == {"score": 30, "band": "AMBER", "qa_flag": True, "triggered": ["F2", "F4", "F5"]}
    json.dumps(d)
    policy, form = documents.load_policy_record("LRK-TRV-26-0071934"), documents.load_claim_form(CLAIM)
    assert payments.guardrails.check_decision(d, policy, form, TODAY) == []
    assert payments.stripe_payout._metadata(d, policy, 39020, 0, 39020)["lines"].startswith("1:PAY:32.86;")
    refer = answer_key_decision(settle=False)
    assert [f.rule for f in payments.guardrails.check_decision(refer, policy, form, TODAY)] == ["SAP-01 §3"]


# ---------------------------------------------------------------- payments adapter (no Stripe)


def test_dry_run_payment(monkeypatch):
    monkeypatch.setattr(payments.stripe_payout, "pay_claim", lambda *a, **k: pytest.fail("Stripe must not be called"))
    record, checks = payments.pay(CLAIM, answer_key_decision(), dry_run=True, today=TODAY)
    assert record.status == "DRY_RUN" and record.stripe_object_id == "DRY_RUN"
    assert (record.amount_gbp, record.idempotency_key, record.version) == (390.20, "CLM-2026-004817-v1", 1)
    assert record.stripe_destination == "payee_tok_8f3c2a91e4" and all(c.passed for c in checks)

    # Auto mode with no key also dry-runs.
    monkeypatch.setattr(payments.config, "STRIPE_SECRET_KEY", "")
    assert payments.pay(CLAIM, answer_key_decision(), today=TODAY)[0].status == "DRY_RUN"

    # A later version pays the difference; a lower one is referred (5.8); referral -> no record.
    v2 = answer_key_decision(version=2)
    assert payments.pay(CLAIM, v2, dry_run=True, already_paid_gbp=300, today=TODAY)[0].amount_gbp == 90.20
    assert payments.pay(CLAIM, v2, dry_run=True, already_paid_gbp=390.20, today=TODAY)[0].status == "NOTHING_TO_PAY"
    record, checks = payments.pay(CLAIM, v2, dry_run=True, already_paid_gbp=400, today=TODAY)
    assert record is None and [c.id for c in checks] == ["SAP-01 5.8"]
    record, checks = payments.pay(CLAIM, answer_key_decision(settle=False), dry_run=True, today=TODAY)
    assert record is None and [c.id for c in checks if not c.passed] == ["SAP-01 §3"]
    with pytest.raises(ValueError):
        payments.pay("OTHER-1", answer_key_decision(), dry_run=True)


def test_live_result_mapping(monkeypatch):
    from payments import PaymentResult

    paid = PaymentResult(status="PAID", claim_id=CLAIM, decision_version=1, amount_gbp="390.20", net_total_gbp="390.20",
                         idempotency_key="CLM-2026-004817-v1", transfer_id="tr_123", destination_account="acct_9")
    monkeypatch.setattr(payments.stripe_payout, "pay_claim", lambda *a, **k: paid)
    record, checks = payments.pay(CLAIM, answer_key_decision(), dry_run=False, today=TODAY)
    assert (record.status, record.amount_gbp, record.stripe_object_id, record.stripe_destination) == ("PAID", 390.20, "tr_123", "acct_9")
    assert record.dashboard_url.endswith("/tr_123") and checks[0].passed

    referred = PaymentResult(status="REFERRED", claim_id=CLAIM, decision_version=1, failed_rules=[{"rule": "SAP-01 P1", "detail": "too big"}])
    monkeypatch.setattr(payments.stripe_payout, "pay_claim", lambda *a, **k: referred)
    record, checks = payments.pay(CLAIM, answer_key_decision(), dry_run=False, today=TODAY)
    assert record is None and (checks[0].id, checks[0].passed, checks[0].detail) == ("SAP-01 P1", False, "too big")

    def empty_float(*a, **k):
        raise payments.PaymentsConfigError("claims float has less than £390.20 available")

    monkeypatch.setattr(payments.stripe_payout, "pay_claim", empty_float)
    with pytest.raises(payments.PaymentsConfigError, match="setup problem.*float"):
        payments.pay(CLAIM, answer_key_decision(), dry_run=False, today=TODAY)
