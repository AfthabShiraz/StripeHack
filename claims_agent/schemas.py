"""Shared data contract. Every module reads and writes these models.

LLM-facing models (filled by Gemini structured output) keep to types Gemini's response
schema supports: str, int, float, bool, Literal, Optional, list and nested models.
No dicts with free keys and no unions of models.

Fields named `verified` are set by code (quotes.py), never trusted from the LLM.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Outcome = Literal["PAY", "PAY_PARTIAL", "DECLINE", "PEND", "REFER"]
# How code converts a line to GBP (CHG-TRV 7.1-7.2):
#   GBP_DEBITED  - a card/bank statement line shows the GBP debited: eligible = gbp_debited * eligible_amount / receipt_total
#   FX_REFERENCE - no statement line (e.g. cash): eligible = eligible_amount * FX-REF rate on fx_date
#   GBP_NATIVE   - the cost was already in GBP: eligible = eligible_amount
#   NONE         - nothing payable (DECLINE / PEND / REFER)
MoneyBasis = Literal["GBP_DEBITED", "FX_REFERENCE", "GBP_NATIVE", "NONE"]


# ---------------------------------------------------------------- documents


class ClaimDocument(BaseModel):
    """A PDF from a manifest, with its text extracted by `pdftotext -layout`."""

    doc_id: str  # manifest ID: claim "00", "01", "M01".."M03", "E01".."E43" (E18a/E18b); company "CERT", "ADMIN", "WORDING-2026", ...
    filename: str
    path: str  # repo-relative PDF path from the manifest; citations use this
    title: str
    doc_type_hint: str  # coarse manifest type: receipt, email, document, police, clinic, statement, ...
    language: str
    document_date: Optional[str] = None
    text: str
    received_at: str  # ISO 8601 date-time the insurer received it


class EvidenceRef(BaseModel):
    doc_id: str
    quote: str = Field(description="Exact text copied verbatim from the document, 3-40 words")
    verified: bool = False


# ---------------------------------------------------------------- step 1: intake (LLM)


class ClaimedLine(BaseModel):
    line: int
    head: str = Field(description='Policy section code for this head of claim, e.g. "E", "D", "C", "B2"')
    head_name: str = Field(description='e.g. "Delayed baggage"')
    description: str
    incident_date: Optional[str] = None
    amount: float
    currency: str
    receipt_ref: Optional[str] = None


class IntakeSummary(BaseModel):
    claim_id: str
    policy_number: str
    policyholder: str
    insured_persons: list[str]
    companions_not_insured: list[str]
    wording_ref: str = Field(description='Governing policy wording reference from the Certificate, e.g. "TRV-2026 v1"')
    cover_level: str
    extensions: list[str] = Field(description="Optional extensions purchased; empty if none")
    period_start: str
    period_end: str
    returned_home: str
    notified_on: str
    notified_within_31_days: bool
    incidents_within_period: bool
    lines: list[ClaimedLine]
    summary: str = Field(description="2-3 sentence plain-English summary of the claim")
    evidence: list[EvidenceRef]


# ---------------------------------------------------------------- step 2: readers (LLM, one per document)


class Fact(BaseModel):
    label: str = Field(description='Short label, e.g. "Bag delivered to hotel"')
    value: str = Field(description='Normalised value, e.g. "2026-09-13T19:20" or "EUR 38.40"')
    quote: str = Field(description="Exact text copied verbatim from the document")
    verified: bool = False


class DocItem(BaseModel):
    """One itemised line on a receipt, invoice, booking or card statement."""

    description: str
    amount: float = Field(description="Amount in the document's own currency")
    currency: str
    gbp_debited: Optional[float] = Field(default=None, description="Card/bank statements only: GBP actually debited")
    date: Optional[str] = None
    quote: str = Field(description="Exact text of this line copied verbatim from the document")
    verified: bool = False


class DocumentNotes(BaseModel):
    doc_id: str
    doc_type: str = Field(
        description="receipt | card_statement | carrier_report | carrier_delivery | police_report | translation | "
        "medical_certificate | medical_invoice | booking | operator_email | proof_of_purchase | claim_form | "
        "claimant_statement | email | certificate | policy_record | marketing | other"
    )
    language: str
    is_original: bool = Field(description="False if this is someone's translation of another document")
    translation_of: Optional[str] = Field(default=None, description="doc_id of the original, if this is a translation")
    issuer: Optional[str] = None
    document_datetime: Optional[str] = None
    heads: list[str] = Field(description='Heads of claim this is evidence for, e.g. ["E"]. Empty if irrelevant.')
    supports_lines: list[int]
    relevance: str = Field(description="Why it is relevant, or why it is irrelevant")
    summary: str
    facts: list[Fact]
    items: list[DocItem]
    total: Optional[float] = None
    currency: Optional[str] = None
    payment_method: Optional[str] = None


# ---------------------------------------------------------------- step 3: section agents (LLM, one per head)


class LineDecision(BaseModel):
    line: int
    head: str
    outcome: Outcome
    claimed_amount: float
    claimed_currency: str
    basis: MoneyBasis
    receipt_total: Optional[float] = Field(default=None, description="Whole receipt/transaction, original currency")
    eligible_amount: Optional[float] = Field(default=None, description="Eligible part, original currency")
    gbp_debited: Optional[float] = Field(default=None, description="GBP debited for the whole transaction (GBP_DEBITED)")
    fx_date: Optional[str] = Field(default=None, description="YYYY-MM-DD the cost was incurred (FX_REFERENCE)")
    sub_limit: Optional[str] = Field(default=None, description='Sub-limit this line counts toward, e.g. "C3"')
    eligible_items: list[str]
    excluded_items: list[str]
    clause_ids: list[str] = Field(description='Policy/guideline clause IDs relied on, e.g. ["E.1", "2.5", "CHG 7.1.1"]')
    evidence: list[EvidenceRef]
    reason: str = Field(description="Plain-English reason a customer would understand")
    objective_exclusion: Optional[str] = Field(default=None, description='SAP-01 Appendix B ref for declines, e.g. "OE-1"')
    missing_evidence: list[str] = Field(description="For PEND only: exactly what to request from the claimant")


class SubLimit(BaseModel):
    code: str
    limit_gbp: float


class SectionAssessment(BaseModel):
    head: str
    head_name: str
    lines: list[LineDecision]
    section_limit_gbp: float
    sub_limits: list[SubLimit]
    excess_gbp: float = Field(description="Excess for this section and cover level; 0 if nil")
    excess_waived: bool
    excess_reason: str
    clause_ids: list[str]
    notes: str


# ---------------------------------------------------------------- step 4: checker (LLM) + money (code)


class Indicator(BaseModel):
    id: str = Field(description="FRD-03 indicator ID, F1..F11")
    name: str
    triggered: bool
    weight: int
    evidence: str = Field(description="Why it is or isn't triggered, citing document IDs")


class CrossCheck(BaseModel):
    kind: Literal["DUPLICATE", "CONTRADICTION", "UNINSURED_PERSON", "OTHER"]
    description: str
    lines: list[int]
    doc_ids: list[str]
    effect: str


class CheckerReport(BaseModel):
    cross_checks: list[CrossCheck]
    indicators: list[Indicator] = Field(description="Every FRD-03 indicator F1-F11 considered, triggered or not")
    line_overrides: list[LineDecision] = Field(description="Corrected decisions for lines a section agent got wrong; usually empty")
    notes: str


class LineMoney(BaseModel):
    line: int
    head: str
    outcome: Outcome
    eligible_gbp: float
    calculation: str  # e.g. "£36.15 × 29.25 / 42.15 = £25.09"


class SectionMoney(BaseModel):
    head: str
    eligible_gbp: float
    after_limits_gbp: float
    excess_gbp: float
    net_gbp: float
    calculation: str


class Settlement(BaseModel):
    lines: list[LineMoney]
    sections: list[SectionMoney]
    net_total_gbp: float
    fraud_score: int
    fraud_band: Literal["GREEN", "AMBER", "RED"]


class EvidencePack(BaseModel):
    """CHG-TRV §10 decision record. Assembled by code (packs.py) from the steps above."""

    claim_id: str
    version: int
    intake: IntakeSummary
    documents: list[DocumentNotes]
    sections: list[SectionAssessment]
    checker: CheckerReport
    final_lines: list[LineDecision]  # section decisions after checker overrides
    settlement: Settlement
    markdown: str


# ---------------------------------------------------------------- steps 5-7


class CheckResult(BaseModel):
    id: str
    description: str
    passed: bool
    detail: str


class Concern(BaseModel):
    line: Optional[int] = None
    concern: str
    material: bool = Field(description="True only if it would change an outcome or amount")


class FinalReview(BaseModel):
    verdict: Literal["AGREE", "REFER"]
    summary: str
    concerns: list[Concern]
    preconditions: list[CheckResult] = Field(description="Its reading of SAP-01 P1-P10")


class GateResult(BaseModel):
    passed: bool
    checks: list[CheckResult]
    amount_to_pay_gbp: float  # net total for this version minus everything already paid


class PaymentRecord(BaseModel):
    claim_id: str
    version: int
    amount_gbp: float
    idempotency_key: str  # "{claim_id}-v{version}"
    stripe_object_id: str  # e.g. tr_..., or "DRY_RUN"
    stripe_destination: str  # e.g. acct_...
    status: str
    dashboard_url: str
    created_at: str


class Letter(BaseModel):
    subject: str
    body_markdown: str


class DecisionRecord(BaseModel):
    claim_id: str
    version: int
    decided_at: str
    status: Literal["PAID", "REFERRED", "NO_PAYMENT_DUE"]
    net_total_gbp: float
    paid_now_gbp: float
    paid_total_gbp: float
    final_review: FinalReview
    gate: GateResult
    payment: Optional[PaymentRecord] = None
    pack_sha256: str
    letter: Optional[Letter] = None


class Answer(BaseModel):
    text: str
    references: list[str]


# ---------------------------------------------------------------- claim state (disk, runs/<claim_id>/state.json)


class TimelineEvent(BaseModel):
    at: str
    step: str  # intake | reader | section | checker | money | pack | final | gate | payment | letter | memory | waiting | error
    message: str
    artifact: Optional[str] = None  # path relative to runs/<claim_id>/


class ClaimState(BaseModel):
    claim_id: str
    status: Literal["NEW", "PROCESSING", "WAITING", "PAID", "REFERRED", "NO_PAYMENT_DUE", "ERROR"]
    documents_received: list[str]
    waiting_for: list[str]
    decision_version: int  # 0 = no decision yet
    paid_total_gbp: float
    payments: list[PaymentRecord]
    timeline: list[TimelineEvent]
