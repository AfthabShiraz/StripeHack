"""Gemini calls with structured output. OWNER: agents subagent.

generate(): the pydantic model is sent as a JSON Schema (response_json_schema) with code-owned fields
(`verified`) removed and every property required (nullable where Optional), so the model must state each
field explicitly. The reply is validated with pydantic. API errors (429/5xx/timeouts) are retried with
exponential backoff; invalid output, and problems reported by an optional `check` callback, are fed back
to the model and retried, up to config.LLM_RETRIES times.
"""

from __future__ import annotations

import asyncio
import copy
import logging
import random
import re
import time
from typing import Any, Callable, TypeVar

from google import genai
from google.genai import errors as genai_errors
from google.genai import types
from pydantic import BaseModel, ValidationError

from . import config

T = TypeVar("T", bound=BaseModel)
log = logging.getLogger(__name__)

TEMPERATURE = 0.2
MAX_OUTPUT_TOKENS = 32768
REQUEST_TIMEOUT_S = 300
MAX_CONCURRENCY = 8  # in-flight Gemini calls per event loop; the pipeline may change this before running
API_RETRIES = max(config.LLM_RETRIES, 5)  # transient API errors: 429, 5xx, timeouts, connection errors
CODE_FIELDS = {"verified"}  # set by code (quotes.py), never by the model

# Simple counters for latency reporting.
stats: dict[str, float] = {"calls": 0, "seconds": 0.0, "prompt_tokens": 0, "output_tokens": 0, "retries": 0}


class LLMError(RuntimeError):
    """A Gemini call failed for good (non-retryable error, or retries exhausted)."""


# ---------------------------------------------------------------- client and concurrency

_client_instance: genai.Client | None = None
_semaphores: dict[Any, asyncio.Semaphore] = {}


def _client() -> genai.Client:
    global _client_instance
    if _client_instance is None:
        if not config.GEMINI_API_KEY:
            raise LLMError("GEMINI_API_KEY is not set (.env)")
        _client_instance = genai.Client(
            api_key=config.GEMINI_API_KEY,
            http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_S * 1000),
        )
    return _client_instance


def _semaphore() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    for old in [lp for lp in _semaphores if lp.is_closed()]:
        del _semaphores[old]
    sem = _semaphores.get(loop)
    if sem is None:
        sem = _semaphores[loop] = asyncio.Semaphore(MAX_CONCURRENCY)
    return sem


# ---------------------------------------------------------------- schema


def response_json_schema(schema: type[BaseModel]) -> dict:
    """JSON Schema for Gemini: code-owned fields removed, all properties required, no title noise."""

    def clean(node: Any) -> Any:
        if isinstance(node, dict):
            out: dict[str, Any] = {}
            for key, value in node.items():
                if key in ("title", "default") and not isinstance(value, dict):
                    continue
                if key == "properties" and isinstance(value, dict):
                    out[key] = {k: clean(v) for k, v in value.items() if k not in CODE_FIELDS}
                elif key == "required":
                    continue  # rebuilt below
                else:
                    out[key] = clean(value)
            if isinstance(out.get("properties"), dict):
                out["required"] = list(out["properties"].keys())
            return out
        if isinstance(node, list):
            return [clean(v) for v in node]
        return node

    return clean(copy.deepcopy(schema.model_json_schema()))


def reset_code_fields(obj: Any) -> None:
    """Set every code-owned field (verified) back to its default: never trust the model with it."""
    if isinstance(obj, BaseModel):
        for name, field in type(obj).model_fields.items():
            if name in CODE_FIELDS:
                setattr(obj, name, field.default)
            else:
                reset_code_fields(getattr(obj, name))
    elif isinstance(obj, (list, tuple)):
        for item in obj:
            reset_code_fields(item)


# ---------------------------------------------------------------- calls


def _retryable(exc: BaseException) -> bool:
    if isinstance(exc, genai_errors.APIError):
        return exc.code in (408, 409, 429, 499, 500, 502, 503, 504) or exc.code is None
    return isinstance(exc, (asyncio.TimeoutError, TimeoutError, ConnectionError, OSError)) or type(
        exc
    ).__module__.split(".")[0] in ("httpx", "httpcore", "aiohttp")


def _backoff(attempt: int, exc: BaseException) -> float:
    text = str(exc)
    hinted = re.search(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)s", text)
    if hinted:
        return float(hinted.group(1)) + random.uniform(0.5, 3.0)
    base = 10.0 if getattr(exc, "code", None) == 429 else 3.0
    return min(90.0, base * (2**attempt)) * random.uniform(0.75, 1.25)


async def _call(model: str, contents: list[types.Content], cfg: types.GenerateContentConfig, what: str):
    last: BaseException | None = None
    for attempt in range(API_RETRIES + 1):
        try:
            async with _semaphore():
                started = time.monotonic()
                resp = await asyncio.wait_for(
                    _client().aio.models.generate_content(model=model, contents=contents, config=cfg),
                    timeout=REQUEST_TIMEOUT_S + 30,
                )
            elapsed = time.monotonic() - started
            usage = resp.usage_metadata
            stats["calls"] += 1
            stats["seconds"] += elapsed
            if usage:
                stats["prompt_tokens"] += usage.prompt_token_count or 0
                stats["output_tokens"] += (usage.candidates_token_count or 0) + (usage.thoughts_token_count or 0)
            log.info(
                "gemini %s %.1fs in=%s out=%s thoughts=%s",
                what,
                elapsed,
                getattr(usage, "prompt_token_count", None),
                getattr(usage, "candidates_token_count", None),
                getattr(usage, "thoughts_token_count", None),
            )
            return resp
        except Exception as exc:  # noqa: BLE001 - classified below
            if not _retryable(exc):
                raise LLMError(f"Gemini call for {what} failed: {type(exc).__name__}: {str(exc)[:500]}") from exc
            last = exc
            if attempt < API_RETRIES:
                delay = _backoff(attempt, exc)
                stats["retries"] += 1
                log.warning("gemini %s: %s; retrying in %.0fs", what, str(exc)[:200], delay)
                await asyncio.sleep(delay)
    raise LLMError(f"Gemini call for {what} failed after {API_RETRIES + 1} attempts: {str(last)[:500]}")


def _config(system: str, *, json_schema: dict | None, thinking: str | None, temperature: float | None):
    kwargs: dict[str, Any] = {
        "system_instruction": system,
        "temperature": TEMPERATURE if temperature is None else temperature,
        "max_output_tokens": MAX_OUTPUT_TOKENS,
    }
    if json_schema is not None:
        kwargs["response_mime_type"] = "application/json"
        kwargs["response_json_schema"] = json_schema
    if thinking:
        kwargs["thinking_config"] = types.ThinkingConfig(thinking_level=thinking)
    return types.GenerateContentConfig(**kwargs)


def _contents(prompt: str, previous: str | None, feedback: str | None) -> list[types.Content]:
    contents = [types.Content(role="user", parts=[types.Part(text=prompt)])]
    if previous is not None and feedback:
        contents.append(types.Content(role="model", parts=[types.Part(text=previous)]))
        contents.append(types.Content(role="user", parts=[types.Part(text=feedback)]))
    return contents


def _response_text(resp) -> tuple[str, str]:
    finish = ""
    try:
        finish = str(resp.candidates[0].finish_reason or "")
    except (AttributeError, IndexError, TypeError):
        pass
    try:
        text = resp.text or ""
    except (ValueError, AttributeError):
        text = ""
    return text.strip(), finish


def _strip_fences(text: str) -> str:
    match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", text, re.S)
    return match.group(1) if match else text


async def generate(
    system: str,
    prompt: str,
    schema: type[T],
    *,
    model: str | None = None,
    check: Callable[[T], list[str]] | None = None,
    thinking: str | None = None,
    temperature: float | None = None,
) -> T:
    """Call Gemini with `schema` as the response schema and return a validated instance.

    Retries (config.LLM_RETRIES, with backoff) on API errors, rate limits and output that
    fails pydantic validation, feeding the validation error back to the model.
    `check` (optional) returns a list of problems with a valid result (e.g. quotes not found);
    they are fed back the same way. If problems remain after the retries, the result with the
    fewest problems is returned (downstream code checks still apply).
    `thinking`: Gemini thinking level ("low" | "medium" | "high"); None = model default.
    """
    model = model or config.LLM_MODEL
    cfg = _config(system, json_schema=response_json_schema(schema), thinking=thinking, temperature=temperature)
    what = schema.__name__
    previous: str | None = None
    feedback: str | None = None
    best: tuple[int, T, list[str]] | None = None
    last_problem = ""
    for attempt in range(config.LLM_RETRIES + 1):
        if attempt:
            stats["retries"] += 1
            await asyncio.sleep(min(8.0, 1.0 * 2**attempt))
        resp = await _call(model, _contents(prompt, previous, feedback), cfg, what)
        text, finish = _response_text(resp)
        if not text:
            last_problem = f"empty response (finish_reason={finish})"
            previous, feedback = None, None
            log.warning("gemini %s: %s", what, last_problem)
            continue
        try:
            obj = schema.model_validate_json(_strip_fences(text))
        except ValidationError as exc:
            truncated = "MAX_TOKENS" in finish
            last_problem = f"invalid output ({'truncated' if truncated else 'validation'}): {str(exc)[:1500]}"
            log.warning("gemini %s attempt %d: %s", what, attempt + 1, last_problem[:300])
            if truncated:
                previous, feedback = None, None
                prompt = prompt + "\n\nIMPORTANT: your previous answer was cut off for length. Be concise: short summaries, short quotes."
            else:
                previous = text
                feedback = (
                    "Your previous response failed schema validation:\n"
                    f"{str(exc)[:1500]}\n\nReturn the complete corrected JSON object."
                )
            continue
        reset_code_fields(obj)
        problems = check(obj) if check else []
        if not problems:
            return obj
        log.warning("gemini %s attempt %d: %d problem(s): %s", what, attempt + 1, len(problems), problems[:5])
        if best is None or len(problems) < best[0]:
            best = (len(problems), obj, problems)
        last_problem = "; ".join(problems[:10])
        previous = text
        feedback = (
            "Your previous response has these problems:\n- "
            + "\n- ".join(problems[:40])
            + "\n\nReturn the complete corrected JSON object. Fix only these problems; keep everything else."
        )
    if best is not None:
        log.warning("gemini %s: returning best result with unresolved problems: %s", what, best[2][:10])
        return best[1]
    raise LLMError(f"Gemini {what}: no valid output after {config.LLM_RETRIES + 1} attempts: {last_problem}")


async def generate_text(
    system: str,
    prompt: str,
    *,
    model: str | None = None,
    thinking: str | None = None,
    temperature: float | None = None,
) -> str:
    """Plain-text Gemini call with the same retry behaviour."""
    model = model or config.LLM_MODEL
    cfg = _config(system, json_schema=None, thinking=thinking, temperature=temperature)
    for attempt in range(config.LLM_RETRIES + 1):
        resp = await _call(model, _contents(prompt, None, None), cfg, "text")
        text, finish = _response_text(resp)
        if text:
            return text
        log.warning("gemini text attempt %d: empty response (finish_reason=%s)", attempt + 1, finish)
        await asyncio.sleep(min(8.0, 1.0 * 2 ** (attempt + 1)))
    raise LLMError(f"Gemini text: empty output after {config.LLM_RETRIES + 1} attempts")
