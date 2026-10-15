"""Load claim and company documents from the manifests, with text extracted from the PDFs."""

import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from .config import CLAIMS_DIR, COMPANY_DIR, POLICY_RECORDS_DIR, ROOT, RUNS_DIR
from .schemas import ClaimDocument

TEXT_CACHE = RUNS_DIR / "text_cache"
FX_CSV = COMPANY_DIR / "06_fx_reference_rates_2026-09.csv"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def pdf_text(path: Path) -> str:
    """Text of a PDF via `pdftotext -layout` (Poppler), cached by content hash."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    cached = TEXT_CACHE / f"{digest}.txt"
    if cached.exists():
        return cached.read_text(encoding="utf-8")
    out = subprocess.run(
        ["pdftotext", "-layout", "-enc", "UTF-8", str(path), "-"], check=True, capture_output=True
    ).stdout.decode("utf-8")
    TEXT_CACHE.mkdir(parents=True, exist_ok=True)
    cached.write_text(out, encoding="utf-8")
    return out


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _to_document(entry: dict, received_at: str | None) -> ClaimDocument:
    return ClaimDocument(
        doc_id=entry["doc_id"],
        filename=entry["filename"],
        path=entry["path"],
        title=(entry.get("title") or "").strip(),
        doc_type_hint=entry.get("doc_type") or "",
        language=entry.get("language") or "",
        document_date=entry.get("date"),
        text=pdf_text(ROOT / entry["path"]),
        received_at=received_at or now_iso(),
    )


# ---------------------------------------------------------------- claims


def claim_dir(claim_id: str) -> Path:
    return CLAIMS_DIR / claim_id


def claim_manifest(claim_id: str) -> list[dict]:
    return _read_json(claim_dir(claim_id) / "manifest.json")


def claim_doc_ids(claim_id: str) -> list[str]:
    return [e["doc_id"] for e in claim_manifest(claim_id)]


def claim_documents(claim_id: str, doc_ids: list[str] | None = None, received_at: str | None = None) -> list[ClaimDocument]:
    """Documents in manifest order, optionally only `doc_ids`."""
    entries = claim_manifest(claim_id)
    if doc_ids is not None:
        wanted = set(doc_ids)
        entries = [e for e in entries if e["doc_id"] in wanted]
    return [_to_document(e, received_at) for e in entries]


def load_claim_form(claim_id: str) -> dict:
    """The original structured submission (claim_form.json). For code checks only; agents read 00_claim_form.pdf."""
    return _read_json(claim_dir(claim_id) / "claim_form.json")


def policy_number_for_claim(claim_id: str) -> str:
    return load_claim_form(claim_id)["policy_number"]


# ---------------------------------------------------------------- company


def company_manifest() -> list[dict]:
    return _read_json(COMPANY_DIR / "manifest.json")


def company_documents() -> list[tuple[dict, ClaimDocument]]:
    """Knowledge-base documents (policy records excluded) with their manifest entry, which carries
    wording_version, effective_date and superseded."""
    return [
        (e, _to_document(e, None))
        for e in company_manifest()
        if not e["path"].startswith("data/company/policy_records/")
    ]


def policy_documents(policy_number: str) -> list[ClaimDocument]:
    """The policyholder's Certificate (CERT) and PolicyCore extract (ADMIN) as documents."""
    return [_to_document(e, None) for e in company_manifest() if e["filename"].startswith(policy_number)]


def load_policy_record(policy_number: str) -> dict:
    """The PolicyCore admin record JSON. For code checks only (payee, status, kill switch)."""
    return _read_json(POLICY_RECORDS_DIR / f"{policy_number}_policy_admin_record.json")
