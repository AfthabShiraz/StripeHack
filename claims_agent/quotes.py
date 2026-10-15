"""Quote check: every quote must appear in its source document. OWNER: core subagent.

A quote counts as found when, after normalising both sides, it is a substring of its document:

- Unicode NFKC, curly quotes / dashes / bullets folded to ASCII, case-folded;
- every whitespace run collapsed to one space (`pdftotext -layout` breaks sentences across lines and pads
  table columns), and compound words wrapped at a line end re-joined ("non-\\nrefundable" -> "non-refundable");
- leading/trailing punctuation and quotation marks around the quote ignored.

Fallbacks, tried in order when the plain match fails:
1. accents ignored (Portuguese text quoted without diacritics: "sem vigilancia");
2. repeated page headers and page-number footers removed (a sentence that runs over a page break);
3. a quote with an ellipsis ("…", "...", "[...]") matches when every piece appears, in order.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Mapping
from functools import lru_cache
from typing import Any

from pydantic import BaseModel

from .schemas import DocItem, DocumentNotes, EvidenceRef, Fact, SectionAssessment

_CHAR_MAP = str.maketrans(
    {
        "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'",
        "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"', "«": '"', "»": '"',
        "‐": "-", "‑": "-", "‒": "-", "–": "-", "—": "-", "―": "-", "−": "-",
        "•": " ", "·": " ", "▪": " ", "●": " ", "◦": " ", "‣": " ", "⁃": " ",
        "×": "x",
        "­": None, "​": None, "‌": None, "‍": None, "﻿": None,
    }
)
_WHITESPACE = re.compile(r"\s+")
_WRAPPED_COMPOUND = re.compile(r"(?<=\w)- (?=\w)")
_ELLIPSIS = re.compile(r"\s*[\[(]?\s*\.{3,}\s*[\])]?\s*")
_EDGE_CHARS = " \"'.,;:!?()[]{}<>*_-"
_PAGE_FOOTER = re.compile(r"^(?:\S+\s*[•·|-]\s*)?(?:page\s*)?\d+(?:\s*(?:of|/)\s*\d+)?$", re.IGNORECASE)


def normalise(text: str, *, keep_accents: bool = True) -> str:
    """The comparison form of a quote or a document text."""
    t = unicodedata.normalize("NFKC", text).translate(_CHAR_MAP).casefold()
    if not keep_accents:
        t = "".join(c for c in unicodedata.normalize("NFKD", t) if not unicodedata.combining(c))
    t = _WHITESPACE.sub(" ", t).strip()
    return _WRAPPED_COMPOUND.sub("-", t)


def _trim(s: str) -> str:
    return s.strip(_EDGE_CHARS)


def _without_page_furniture(text: str) -> str:
    """Text with the header lines repeated at the top of every page and page-number footers removed."""
    pages = [p for p in text.split("\f") if p.strip()]
    if len(pages) < 2:
        return text
    page_lines = [[ln.strip() for ln in p.splitlines() if ln.strip()] for p in pages]
    header = 0
    while all(len(pl) > header for pl in page_lines) and len({pl[header] for pl in page_lines}) == 1:
        header += 1
    body: list[str] = []
    for pl in page_lines:
        pl = pl[header:]
        if pl and _PAGE_FOOTER.match(pl[-1]):
            pl = pl[:-1]
        body.extend(pl)
    return "\n".join(body)


@lru_cache(maxsize=256)
def _variants(text: str) -> tuple[tuple[str, bool, str], ...]:
    """(how, keep_accents, normalised text) to try, in fallback order. The quote is normalised with the
    same keep_accents, so an accented quote is still compared accent-free against an accent-free text."""
    out: list[tuple[str, bool, str]] = []
    seen: set[tuple[bool, str]] = set()
    stripped = _without_page_furniture(text)
    sources = [("", text)] + ([("across a page break", stripped)] if stripped != text else [])
    for where, source in sources:
        for keep_accents in (True, False):
            norm = normalise(source, keep_accents=keep_accents)
            if (keep_accents, norm) in seen:
                continue
            seen.add((keep_accents, norm))
            how = ", ".join(x for x in (where, "" if keep_accents else "ignoring accents") if x)
            out.append((how or "normalised", keep_accents, norm))
    return tuple(out)


def _pieces_in_order(pieces: list[str], text: str) -> bool:
    pos = 0
    for piece in pieces:
        i = text.find(piece, pos)
        if i < 0:
            return False
        pos = i + len(piece)
    return True


def find_quote(quote: str, text: str) -> str | None:
    """How `quote` was found in `text` (e.g. "normalised", "ignoring accents", "across a page break"),
    or None if it wasn't. Quotes with no letters or digits are never found."""
    if not quote or not text:
        return None
    for how, keep_accents, norm_text in _variants(text):
        q = normalise(quote, keep_accents=keep_accents)
        whole = _trim(q)
        if not any(c.isalnum() for c in whole):
            return None
        if whole in norm_text:
            return how
        if "..." in q:
            pieces = [p for p in (_trim(x) for x in _ELLIPSIS.split(q)) if any(c.isalnum() for c in p)]
            if pieces and _pieces_in_order(pieces, norm_text):
                return f"{how}, in pieces around an ellipsis"
    return None


def quote_in_text(quote: str, text: str) -> bool:
    return find_quote(quote, text) is not None


# ---------------------------------------------------------------- doc ID resolution


def _id_key(doc_id: str) -> str:
    """Case-insensitive, zero-padding-insensitive form of a doc ID: "e01" == "E1" == "E01"."""
    return re.sub(r"(?<=[a-z])0+(?=\d)", "", doc_id.strip().casefold())


def _candidate_docs(doc_id: str, texts: Mapping[str, str]) -> list[str]:
    """Document keys a cited doc_id may mean, best first. Accepts the manifest ID ("E12"), a filename or path
    ("E12_police_report_PSP_original_PT.pdf"), a decorated ID ("E12 (original)"), or a split document's
    parent ID ("E18" -> E18a, E18b)."""
    raw = (doc_id or "").strip()
    if not raw:
        return []
    if raw in texts:
        return [raw]
    base = re.split(r"[\\/]", raw)[-1]
    base = re.sub(r"\.(pdf|md|txt|json|csv)$", "", base, flags=re.IGNORECASE)
    head = re.split(r"[_\s(,;:]", base, maxsplit=1)[0]
    keys = {_id_key(k): k for k in texts}
    for cand in (raw, base, head):
        if cand and _id_key(cand) in keys:
            return [keys[_id_key(cand)]]
    if head:
        parent = _id_key(head)
        return [k for k in texts if re.fullmatch(re.escape(parent) + r"[a-z]", _id_key(k))]
    return []


# ---------------------------------------------------------------- walking schema objects


def _short(quote: str, n: int = 90) -> str:
    q = _WHITESPACE.sub(" ", quote or "").strip()
    return q if len(q) <= n else q[: n - 1] + "…"


def _item_label(item: Any, index: int) -> str:
    if isinstance(item, DocumentNotes):
        return item.doc_id
    if isinstance(item, SectionAssessment):
        return item.head
    line = getattr(item, "line", None)
    if isinstance(line, int) and isinstance(item, BaseModel):
        return f"line {line}"
    return str(index)


def _check(ref: EvidenceRef | Fact | DocItem, doc_id: str | None, texts: Mapping[str, str], path: str, failures: list[str]) -> None:
    ref.verified = False
    if not doc_id:
        failures.append(f"{path}: no document to check the quote against: \"{_short(ref.quote)}\"")
        return
    if not (ref.quote or "").strip():
        failures.append(f"{path}: empty quote (cites {doc_id})")
        return
    candidates = _candidate_docs(doc_id, texts)
    if not candidates:
        failures.append(f"{path}: document {doc_id!r} is not in the claim file; quote: \"{_short(ref.quote)}\"")
        return
    for key in candidates:
        if find_quote(ref.quote, texts[key]):
            ref.verified = True
            if isinstance(ref, EvidenceRef) and ref.doc_id != key:
                ref.doc_id = key  # canonical manifest ID, e.g. "E12_police_report....pdf" -> "E12"
            return
    where = " / ".join(candidates)
    failures.append(f"{path}: quote not found in {where}: \"{_short(ref.quote)}\"")


def _walk(obj: Any, texts: Mapping[str, str], owner: str | None, path: str, failures: list[str]) -> None:
    if isinstance(obj, EvidenceRef):
        _check(obj, obj.doc_id, texts, path, failures)
    elif isinstance(obj, (Fact, DocItem)):
        _check(obj, owner, texts, path, failures)
    elif isinstance(obj, BaseModel):
        if isinstance(obj, DocumentNotes):
            owner = obj.doc_id
        for name in type(obj).model_fields:
            value = getattr(obj, name)
            if isinstance(value, (BaseModel, list, tuple, dict)):
                _walk(value, texts, owner, f"{path}.{name}" if path else name, failures)
    elif isinstance(obj, (list, tuple)):
        for i, item in enumerate(obj):
            _walk(item, texts, owner, f"{path}[{_item_label(item, i)}]", failures)
    elif isinstance(obj, dict):
        for key, value in obj.items():
            _walk(value, texts, owner, f"{path}[{key}]", failures)


def _texts(documents: Any) -> dict[str, str]:
    """{doc_id: text} from a mapping of texts or ClaimDocuments, or a list of ClaimDocuments."""
    if isinstance(documents, Mapping):
        return {k: (v if isinstance(v, str) else v.text) for k, v in documents.items()}
    return {d.doc_id: d.text for d in documents}


def verify_quotes(obj: BaseModel, documents: dict[str, str]) -> list[str]:
    """Walk any schema object, set `.verified` on every EvidenceRef, Fact and DocItem whose quote appears
    in its document (whitespace-normalised, case-insensitive, accent-tolerant), and return a list of
    human-readable failures. Facts/DocItems inside DocumentNotes belong to notes.doc_id.

    Every `.verified` is overwritten (never trusted from the LLM). `documents` maps doc ID -> text (a list
    of ClaimDocuments also works). `obj` may also be a list of schema objects. An EvidenceRef that cites
    its document loosely (filename, path, "E18" for E18a) is rewritten to the manifest doc ID it matched.
    """
    failures: list[str] = []
    root = type(obj).__name__ if isinstance(obj, BaseModel) else ""
    _walk(obj, _texts(documents), None, root, failures)
    return failures
