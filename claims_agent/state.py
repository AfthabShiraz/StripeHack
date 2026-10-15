"""Claim state and artifacts on disk under runs/<claim_id>/. OWNER: pipeline subagent.

Layout (relative to runs/<claim_id>/):
    state.json                 ClaimState; the UI polls it (every log() saves it immediately)
    intake.json                IntakeSummary
    notes/<doc_id>.json        DocumentNotes, one per received document
    sections/<head>.json       latest SectionAssessment per head of claim
    requests/<n>.md            evidence-request emails (1, 2, ...)
    v<n>/...                   one folder per decision version (see pipeline.py)

Writes are atomic (temp file + rename) so a reader never sees half a file, and every
read-modify-write of state.json holds a lock (threads in this process + flock across processes).
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator, TypeVar

from pydantic import BaseModel

from . import config
from .documents import now_iso
from .schemas import ClaimState, TimelineEvent

try:  # POSIX only; on other platforms the in-process lock still applies
    import fcntl
except ImportError:  # pragma: no cover
    fcntl = None

M = TypeVar("M", bound=BaseModel)

_LOCK = threading.RLock()
_held: dict[str, tuple[int, object]] = {}  # claim_id -> (depth, open lock file), guarded by _LOCK
_listeners: list[Callable[[str, TimelineEvent], None]] = []


# ---------------------------------------------------------------- paths


def run_dir(claim_id: str) -> Path:
    return config.RUNS_DIR / claim_id


def artifact_path(claim_id: str, relpath: str) -> Path:
    base = run_dir(claim_id).resolve()
    path = (base / relpath).resolve()
    if base != path and base not in path.parents:
        raise ValueError(f"artifact path escapes the claim folder: {relpath}")
    return path


def _state_path(claim_id: str) -> Path:
    return run_dir(claim_id) / "state.json"


def _atomic_write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# ---------------------------------------------------------------- locking


@contextmanager
def locked(claim_id: str) -> Iterator[None]:
    """Exclusive, re-entrant lock for one claim's state (threads + processes)."""
    with _LOCK:
        depth, fh = _held.get(claim_id, (0, None))
        if depth == 0 and fcntl is not None:
            run_dir(claim_id).mkdir(parents=True, exist_ok=True)
            fh = open(run_dir(claim_id) / ".lock", "a")
            fcntl.flock(fh, fcntl.LOCK_EX)
        _held[claim_id] = (depth + 1, fh)
        try:
            yield
        finally:
            depth, fh = _held[claim_id]
            if depth == 1:
                del _held[claim_id]
                if fh is not None:
                    fcntl.flock(fh, fcntl.LOCK_UN)
                    fh.close()
            else:
                _held[claim_id] = (depth - 1, fh)


# ---------------------------------------------------------------- state


def new_state(claim_id: str) -> ClaimState:
    return ClaimState(
        claim_id=claim_id,
        status="NEW",
        documents_received=[],
        waiting_for=[],
        decision_version=0,
        paid_total_gbp=0.0,
        payments=[],
        timeline=[],
    )


def load_state(claim_id: str) -> ClaimState:
    """Existing state, or a NEW one."""
    path = _state_path(claim_id)
    if not path.exists():
        return new_state(claim_id)
    return ClaimState.model_validate_json(path.read_text(encoding="utf-8"))


def save_state(state: ClaimState) -> None:
    with locked(state.claim_id):
        _atomic_write(_state_path(state.claim_id), state.model_dump_json(indent=2))


@contextmanager
def mutate(claim_id: str) -> Iterator[ClaimState]:
    """Load, let the caller change, save — all under the claim lock. Use this instead of holding a
    ClaimState across awaits, so concurrent log() calls are never lost."""
    with locked(claim_id):
        state = load_state(claim_id)
        yield state
        save_state(state)


def update_state(claim_id: str, **fields) -> ClaimState:
    with mutate(claim_id) as state:
        for key, value in fields.items():
            setattr(state, key, value)
    return state


def on_log(callback: Callable[[str, TimelineEvent], None]) -> None:
    """Register a callback(claim_id, event) called after every log() (the CLI prints live progress)."""
    _listeners.append(callback)


def log(claim_id: str, step: str, message: str, artifact: str | None = None) -> None:
    """Append a TimelineEvent and save immediately (the UI polls state.json)."""
    event = TimelineEvent(at=now_iso(), step=step, message=message, artifact=artifact)
    with mutate(claim_id) as state:
        state.timeline.append(event)
    for callback in list(_listeners):
        try:
            callback(claim_id, event)
        except Exception:  # a broken listener must never break the pipeline
            pass


def reset_claim(claim_id: str) -> None:
    """Delete runs/<claim_id>/ (state, notes, sections, decisions). Cognee memory is not touched."""
    with _LOCK:
        shutil.rmtree(run_dir(claim_id), ignore_errors=True)


# ---------------------------------------------------------------- artifacts


def write_artifact(claim_id: str, relpath: str, content: BaseModel | str | dict | list) -> str:
    """Write runs/<claim_id>/<relpath> (pydantic -> pretty JSON, str -> text). Returns relpath."""
    if isinstance(content, BaseModel):
        text = content.model_dump_json(indent=2)
    elif isinstance(content, (dict, list)):
        text = json.dumps(content, indent=2, ensure_ascii=False, default=str)
    else:
        text = str(content)
    _atomic_write(artifact_path(claim_id, relpath), text)
    return relpath


def read_artifact(claim_id: str, relpath: str) -> str | None:
    path = artifact_path(claim_id, relpath)
    return path.read_text(encoding="utf-8") if path.exists() else None


def read_model(claim_id: str, relpath: str, model: type[M]) -> M | None:
    text = read_artifact(claim_id, relpath)
    return model.model_validate_json(text) if text is not None else None
