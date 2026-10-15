# Build plan: Larkspur claims agent

Read `problem-statement.md`, `data/README.md`, `claims_agent/schemas.py` and `claims_agent/documents.py` first.

## The flow

```
claim or new document
 → 1 intake agent (00 claim form + CERT + ADMIN → IntakeSummary)
 → 2 reader agents, one per document (→ DocumentNotes with verbatim quotes; quotes.verify_quotes)   → Cognee
 → 3 section agents, one per head of claim (notes for that head + kb_context from Cognee → SectionAssessment)
 → any PEND line? → evidence request email, status WAITING; when docs arrive, add_documents re-runs affected heads
 → 4 checker agent (cross-checks + FRD-03 indicators) → packs.apply_overrides → money.settle (code) → packs.build_pack
 → 5 final agent (pack only → AGREE/REFER)
 → 6 gate.pre_payment_checks (code) → payments.pay (adapter to the team's payments/ package: SAP-01 checks + Stripe)
     → paid, or referred to a person → decision letter
 → 7 memory.remember_decision → explainer answers "why?" via memory.ask
```

Principles: reliability over speed or cost. The strongest model everywhere. Model calls for judgement; code only
for money maths, hard payment limits, quote checks and glue. Cognee is where agents get their context.

## The data (PDF corpus)

- Every document is a PDF listed in a manifest: `data/claims/<claim_id>/manifest.json` and `data/company/manifest.json`.
  `documents.py` loads them and extracts text with `pdftotext -layout` (cached in `runs/text_cache/`).
- Claim doc IDs: `00` claim form, `01` statement, `M01`-`M03` emails, `E01`-`E43` evidence (`E18a`/`E18b` taxis).
  E24-E43 are noise. Company doc IDs: `WORDING-2026` (governing), `WORDING-2024` (superseded), `CHG-TRV`,
  `SAP-01`, `FRD-03`, `FX-REF`, `LTR-02`, `BROCHURE` (not contractual), `CERT`, `ADMIN`.
- Structured JSON for code checks only: `claim_form.json`, the ADMIN `*_policy_admin_record.json`, the FX CSV.
- Late evidence for the demo: by default `E12`, `M02`, `M03` are held back and arrive later (`pipeline.DEFAULT_HOLD_BACK`).
- `data_src/` and `data/answer_key/` are never ingested. The answer key is for `scripts/eval.py` and tests only.
- Expected result: £390.20 paid, fraud score 30 (F2, F4, F5), Tier T0. See `data/answer_key/`.

## Ownership (edit only your own files)

| Subagent | Files |
|---|---|
| memory | `claims_agent/memory.py`, `scripts/load_kb.py`, `tests/test_memory.py` |
| agents | `claims_agent/llm.py`, `claims_agent/agents.py`, `tests/test_agents.py` |
| core | `claims_agent/quotes.py`, `money.py`, `gate.py`, `payments.py`, `tests/test_core.py` |
| pipeline | `claims_agent/state.py`, `packs.py`, `pipeline.py`, `scripts/run_claim.py`, `scripts/eval.py`, `tests/test_pipeline.py` |

`schemas.py`, `config.py` and `documents.py` are the shared contract: don't change them. If you need a change,
say so in your final report and work around it meanwhile.

Not ours, never edit: `payments/` (Stripe payouts + SAP-01 guardrails, built separately; call it through
`claims_agent/payments.py`), `scripts/build_pdfs.py`, `scripts/verify_pdfs.py`, `scripts/pdf_renderer.swift`,
`data/`, `data_src/`, `.venv/`.

## Rules

- Python: `.venv-claims/bin/python` (3.12, arm64). Do NOT use or modify `.venv`.
  Install extra packages with `uv pip install --python .venv-claims/bin/python <pkg>` only if essential.
- Secrets live in `.env` (`GEMINI_API_KEY`; `STRIPE_SECRET_KEY` may be added later). Never print, log or commit them.
- All output goes under `runs/` (gitignored). Cognee storage goes under `.cognee_system/` and `.data_storage/` in the repo root.
- Don't commit. Don't touch other subagents' files.
- Gemini model: `config.LLM_MODEL` (gemini-3.1-pro-preview). Real API calls are fine for testing; keep test runs focused.
