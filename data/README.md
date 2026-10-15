# Synthetic Larkspur insurance claims — PDF corpus

All people and commercial organisations are fictional. The policy, evidence and receipts are synthetic test data. Original source documents are preserved byte-for-byte under `data_src/`; generated PDFs have selectable, extractable text.

```text
data_src/                         # Generator inputs; do not ingest
  company/                       # Original Markdown, JSON and CSV
  claims/CLM-2026-004817/          # Original sources plus E24–E43 additions
  noise_catalogue.json           # Evaluation/documentation inventory; not rendered
data/
  company/                       # Shared company PDF corpus + original FX CSV
    manifest.json
    policy_records/              # Certificate PDF, PolicyCore PDF + original admin JSON
  claims/CLM-2026-004817/
    sources/                     # Flat PDF corpus: this is what the agent reads/cites
    claim_form.json              # Original structured submission
    manifest.json
  answer_key/                    # Evaluation only — NEVER ingest or expose to agents
```

Ingest `data/company/` into the shared company dataset and `data/claims/CLM-2026-004817/sources/` into the claim dataset. Citations should use the PDF paths from each manifest, for example `data/claims/CLM-2026-004817/sources/E12_police_report_PSP_original_PT.pdf`. Manifests contain IDs, titles, paths relative to the repository, document types, documentary dates (null when none is explicit), page counts, SHA-256 hashes and languages. Company records also contain wording version, effective date and superseded status; null dates/versions mean no applicable explicit wording metadata. Both current and superseded wordings are retained.

E01–E23 keep their original stems, except E18 is split into E18a/E18b taxi PDFs. The claim form and statement retain IDs 00 and 01. The original three-message email thread is split into M01–M03; its original attachment reference spelling is deliberately preserved as historical correspondence. E24–E43 are informational or corroborating additions, with no new expenses or benefit decisions. The evaluation key maps the changed references.

## Build

Requirements: macOS, Python 3.9+, Swift/Xcode command-line tools, and Poppler (`pdfinfo`, `pdftotext`, `pdftoppm`) on PATH. Fonts use macOS Arial and Courier New, including Portuguese accents and £/€. The renderer uses Cocoa/Core Graphics/Core Text; no third-party Python packages or network access are needed. Chrome was available but could not start inside this environment, and installing ReportLab was blocked by network restrictions.

From the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/build_pdfs.py
.venv/bin/python scripts/verify_pdfs.py
```

The Python generator calls `scripts/pdf_renderer.swift`, visits only allowlisted source directories and never reads the answer key. Receipts use narrow pages and monospace; policy booklets use paginated letterhead and benefit tables; police fields are boxed; email headers, clinic letterhead, bank tables and structured form/system tables have distinct layouts. Stable output names and normalized PDF timestamps/IDs make rebuilds reproducible on the same macOS/font/toolchain version. Cross-platform byte identity is not promised.

To rebuild from clean generated PDF outputs (structured files and the answer key are retained):

```sh
find data/company data/claims -type f -name '*.pdf' -delete
.venv/bin/python scripts/build_pdfs.py
.venv/bin/python scripts/verify_pdfs.py
```

The verifier checks every PDF's text, all parsed source blocks/table cells, original source bytes against git HEAD, manifest hashes, critical phrases, unchanged evaluation payment and absence of evaluation markers in PDFs. It writes `.build/verification.json` and five first-page PNGs under `.build/previews/` for visual review. `.build/` and `.venv/` are ignored by git. `scripts/verify_pdfs.py` accesses the answer key strictly for evaluation; never run it as part of agent ingestion.
