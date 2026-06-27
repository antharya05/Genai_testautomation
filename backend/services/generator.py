"""
Async batch test case generator with RAG enrichment.

FLOW PER REQUIREMENT:
cache hit? → return cached (deterministic, free)
    ↓ miss
RAG enrichment → retrieve top-3 knowledge chunks
    ↓
LLM call (temperature=0, provider abstraction)
    ↓
Parse JSON response
    ↓
Validate + repair (Pydantic)
    ↓
Attach metadata (model, prompt version, rag chunks, timestamp)
    ↓
Cache result
    ↓
Dedup against seen titles
    ↓
Update job state (SSE consumers see incremental results)

CONCURRENCY MODEL:
An AdaptiveLimiter (AIMD) gates parallel LLM calls per provider: it starts at a
provider-specific level, halves on a 429, and grows back on sustained success.
run_in_executor moves blocking SDK calls off the event loop.
asyncio.gather runs all requirement tasks concurrently within the live limit.

RETRY MODEL:
Only *retryable* provider failures (rate-limit / timeout / unavailable) are retried,
with exponential backoff + full jitter + Retry-After. Deterministic failures
(parse / validation) and fatal failures (bad key / quota) are never retried.

TEST-ID MODEL:
Each requirement owns a fixed id block (idx * _TC_ID_BLOCK) computed from its
position, so test ids are assigned deterministically with no shared mutable
counter — eliminating the duplicate-id race the old running ``tc_offset`` had.
"""

import asyncio
import hashlib
import json
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

MAX_RETRIES = 4          # max retries for a *retryable* failure (was a flat 2 for all)
TEMPERATURE = 0.0

# Deterministic test-id namespacing: requirement at index ``i`` numbers its cases
# in the block [i*_TC_ID_BLOCK + 1, ...]. Comfortably larger than any per-
# requirement case count, so blocks never overlap and ids never collide.
_TC_ID_BLOCK = 1000


class ParseFailure(ValueError):
    """The provider returned 2xx but the body was not parseable JSON. Deterministic."""


class ValidationFailure(ValueError):
    """The parsed payload yielded zero valid test cases. Deterministic."""


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse(content: str) -> list[dict]:
    content = _strip_fences(content)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ParseFailure(f"Response was not valid JSON: {exc}") from exc
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        return [parsed]
    raise ParseFailure(f"Unexpected JSON type: {type(parsed).__name__}")


def _preserve_requirement_id(cases: list, req_id: str) -> None:
    """Force the deterministically-extracted requirement id onto every case.

    The id comes from regex extraction (cannot hallucinate), so it is
    authoritative over whatever the LLM produced. Only applied when a real id
    was found — otherwise the LLM's best guess is left in place.
    """
    if not req_id or req_id == "REQ_UNKNOWN":
        return
    for tc in cases:
        tc.requirement_id = req_id


def _preserve_asil(cases: list, meta: dict) -> None:
    """Force the deterministically-resolved ASIL onto every case.

    ASIL is resolved in ``requirement_analyzer.extract_metadata`` (stated in the
    document → "requirement", else content-estimated → "estimated"). That value
    is authoritative over the LLM's per-case guess, guaranteeing a single
    consistent ASIL — and an honest source — across all cases for a requirement.
    """
    asil = meta.get("asil", "QM")
    source = meta.get("asil_source", "estimated")
    confidence = int(meta.get("asil_confidence", 100))
    for tc in cases:
        tc.asil = asil
        tc.asil_source = source
        tc.asil_confidence = confidence


async def _generate_one(
    requirement: str,
    tc_offset: int,
    prompt_version: str,
    provider=None,
    parsed: Optional[dict] = None,
    limiter=None,
) -> tuple[list, int, list[dict], dict, Optional[dict]]:
    """
    Generate test cases for a single requirement.
    Returns (test_cases, retry_count, rag_chunks, coverage_report, error_info).

    ``error_info`` is ``None`` on success, or a classified failure dict when the
    requirement produced no test cases. It carries the persisted ``failure_type``
    (rate_limit / timeout / malformed_response / validation_failure /
    parsing_failure / provider_unavailable / unknown), a human ``failure_reason``,
    ``last_attempt_at`` and ``fatal`` — so the batch can classify the run outcome
    and the requirement row can show *why* it has no cases.

    ``limiter`` is the optional :class:`AdaptiveLimiter`; on a rate-limit it is
    notified so concurrency contracts, and on a clean call so it can grow again.

    ``parsed`` is the optional ``ParsedRequirement.to_dict()`` record for this
    requirement. When present, structured parser fields (requirement_id, asil,
    category, …) are authoritative; when absent the legacy string-only path runs
    unchanged.
    """
    from prompts.manager import get_prompt
    from providers import ProviderError, ProviderErrorType, classify_exception, provider_manager
    from services import cache
    from services import requirement_analyzer as analyzer
    from services import validator
    from services.concurrency import backoff_delay
    from services.rag import rag_pipeline

    # ── Deterministic metadata extraction (no LLM, cannot hallucinate) ──
    meta = analyzer.extract_metadata(requirement, parsed=parsed)
    req_id = meta["requirement_id"]

    # ── Facts block (built up-front so it can also key the cache) ──
    # Structured parser metadata changes the prompt for the same requirement
    # text, so it must take part in the cache key to avoid stale plain-text hits.
    facts_block = analyzer.format_metadata_block(meta)
    cache_version = prompt_version
    if parsed:
        sig = hashlib.sha256(facts_block.encode("utf-8")).hexdigest()[:8]
        cache_version = f"{prompt_version}:{sig}"

    # ── Cache check ──────────────────────────────────────────────
    cached = cache.get(requirement, cache_version)
    if cached:
        cases, warnings = validator.validate_batch(cached, req_id=req_id, offset=tc_offset)
        for i, tc in enumerate(cases):
            tc.test_id = f"TC_{tc_offset + i + 1:03d}"
        if limiter is not None:
            await limiter.on_success()  # cache hits keep the pipeline healthy
        _preserve_requirement_id(cases, req_id)
        _preserve_asil(cases, meta)
        coverage = validator.validate_coverage(cases, meta)
        return cases, 0, [], coverage, None

    if provider is None:
        # Strict BYOK: generation must never silently invent a provider.
        raise ProviderError(
            "No provider supplied to generation (BYOK not resolved).",
            ProviderErrorType.MISSING_KEY,
        )
    provider_id = getattr(provider, "provider_id", "unknown")
    system_prompt = get_prompt("generate", prompt_version)

    # ── RAG enrichment ────────────────────────────────────────────
    user_msg, rag_chunks = rag_pipeline.build_enriched_prompt(requirement)

    # ── Prepend authoritative extracted facts (anti-hallucination) ──
    user_msg = f"{facts_block}\n\n{'=' * 60}\n\n{user_msg}"

    # ── LLM call with retry ───────────────────────────────────────
    last_error_info: Optional[dict] = None
    attempt = 0
    while True:
        t0 = time.perf_counter()
        try:
            loop = asyncio.get_event_loop()
            content = await loop.run_in_executor(
                None,
                lambda: provider.complete(
                    system_prompt, user_msg, temperature=TEMPERATURE, max_tokens=4096
                ),
            )
            latency_ms = (time.perf_counter() - t0) * 1000
            usage = getattr(provider, "last_usage", None) or {}
            provider_manager.record_usage(
                provider_id,
                latency_ms=latency_ms,
                success=True,
                tokens_in=usage.get("input", 0),
                tokens_out=usage.get("output", 0),
            )
            raw_list = _parse(content)  # raises ParseFailure (deterministic, no retry)
            cases, warnings = validator.validate_batch(raw_list, req_id=req_id, offset=tc_offset)

            if warnings:
                logger.warning("Validation warnings for '%s...': %s", requirement[:40], warnings)
            if not cases:
                raise ValidationFailure("Zero valid test cases after validation")

            # ── Attach metadata ───────────────────────────────────
            timestamp = datetime.now(timezone.utc).isoformat()
            rag_sources = [c["source"] for c in rag_chunks]
            rag_score = round(rag_chunks[0]["score"], 4) if rag_chunks else 0.0

            for i, tc in enumerate(cases):
                tc.test_id = f"TC_{tc_offset + i + 1:03d}"
                tc.source_requirement_text = requirement
                tc.generation_timestamp = timestamp
                tc.model_version = provider.model_name
                tc.prompt_version = prompt_version
                tc.retry_count = attempt
                # Store RAG attribution on the test case
                tc.rag_sources = rag_sources
                tc.rag_top_score = rag_score

            # ── Requirement ID preservation (authoritative regex id) ──
            _preserve_requirement_id(cases, req_id)
            # ── ASIL preservation (authoritative resolved ASIL) ───
            _preserve_asil(cases, meta)

            # ── Post-generation coverage validation ───────────────
            coverage = validator.validate_coverage(cases, meta)
            if coverage["warnings"]:
                logger.info("Coverage findings for %s: %s", req_id, coverage["warnings"])

            # ── Cache the result ──────────────────────────────────
            cache.set(requirement, cache_version, [tc.model_dump() for tc in cases])
            if limiter is not None:
                await limiter.on_success()
            return cases, attempt, rag_chunks, coverage, None

        except Exception as exc:
            latency_ms = (time.perf_counter() - t0) * 1000

            # Classify the failure into the persisted vocabulary. Parse/validation
            # are deterministic generator-side failures — re-prompting at temp=0
            # would reproduce them, so they are never retried.
            if isinstance(exc, ParseFailure):
                failure_type, retryable, fatal, reason = "parsing_failure", False, False, str(exc)
                perr = None
            elif isinstance(exc, ValidationFailure):
                failure_type, retryable, fatal, reason = "validation_failure", False, False, str(exc)
                perr = None
            else:
                perr = classify_exception(exc, provider=provider_id)
                failure_type, retryable, fatal, reason = (
                    perr.failure_type, perr.retryable, perr.fatal, perr.message,
                )
                # Only transport-level provider faults count against provider metrics;
                # parse/validation followed a successful call already recorded above.
                provider_manager.record_usage(
                    provider_id, latency_ms=latency_ms, success=False,
                    error_type=perr.error_type.value,
                )
                # Feed the adaptive limiter so concurrency contracts under throttling.
                if limiter is not None and perr.error_type.value == "rate_limit":
                    await limiter.on_rate_limit()

            last_error_info = {
                "failure_type": failure_type,
                "failure_reason": reason,
                "error_type": perr.error_type.value if perr else failure_type,
                "provider": provider_id,
                "fatal": fatal,
                "retryable": retryable,
                "retry_after": getattr(perr, "retry_after", None),
                "last_attempt_at": datetime.now(timezone.utc).isoformat(),
                "attempts": attempt + 1,
            }
            logger.warning(
                "Attempt %d failed (%s): %s", attempt + 1, failure_type, reason,
            )

            # Stop now for deterministic or fatal failures, or once retries are spent.
            if fatal or not retryable or attempt >= MAX_RETRIES:
                break
            delay = backoff_delay(attempt, retry_after=getattr(perr, "retry_after", None))
            logger.info("Retrying in %.2fs (attempt %d/%d)", delay, attempt + 2, MAX_RETRIES + 1)
            await asyncio.sleep(delay)
            attempt += 1

    logger.error("All attempts failed for '%s...': %s", requirement[:40], last_error_info)
    return [], attempt, [], validator.validate_coverage([], meta), last_error_info


async def run_batch(
    requirements: list[str],
    job_id: str,
    jobs: dict,
    provider=None,
    parsed_meta: Optional[dict] = None,
    on_requirement_start=None,
    on_requirement_done=None,
    should_cancel=None,
    skip_positions: Optional[set] = None,
) -> None:
    """
    Process all requirements concurrently and stream results via jobs dict.
    The SSE endpoint reads jobs[job_id] every 400ms to stream progress to frontend.

    ``parsed_meta`` optionally maps a requirement string (the flattened
    ``"id: statement"`` text) to its ``ParsedRequirement.to_dict()`` record, so
    structured parser metadata flows into generation. ``None`` keeps the legacy
    list[str]-only behaviour for raw-text / backward-compatible callers.

    Durable-job hooks (Phase 2B — all optional, default to legacy behaviour):

    * ``on_requirement_done(idx, cases, coverage, gen_status, error_info)`` is
      invoked as each requirement finishes, so the worker can persist that
      requirement's result incrementally (in its own transaction) instead of
      relying on a single terminal write. It may be sync or async.
    * ``should_cancel()`` is polled before each requirement is generated; when it
      returns truthy the requirement is skipped (left for a later resume).
    * ``skip_positions`` is the set of requirement indices already persisted as
      ``generated`` — they are not regenerated, making restart/resume cheap and
      idempotent.
    """
    from prompts.manager import get_current_version
    from services.concurrency import AdaptiveLimiter
    from services.dedup import deduplicate

    prompt_version = get_current_version()
    provider_id = getattr(provider, "provider_id", None)
    limiter = AdaptiveLimiter.for_provider(provider_id)
    start_ts = time.perf_counter()

    # ── Run-outcome accumulators ──────────────────────────────────
    failed_reqs = 0       # requirements that produced zero test cases
    error_count = 0       # total failed LLM attempts across the run
    fatal_error: Optional[dict] = None  # first fatal provider error, if any

    jobs[job_id].setdefault("coverage", [])
    # Per-requirement generation status, keyed by index, persisted at finalize time
    # so the Requirements Workspace can tell "failed" apart from merely "uncovered".
    jobs[job_id].setdefault("requirement_status", [])

    skip = skip_positions or set()

    async def process(req: str, idx: int) -> None:
        nonlocal failed_reqs, error_count, fatal_error
        # Resume: a requirement already persisted as generated is not re-run.
        if idx in skip:
            jobs[job_id]["current"] = max(jobs[job_id].get("current", 0), idx + 1)
            return
        # Cooperative cancellation at the requirement boundary.
        if should_cancel is not None and should_cancel():
            return
        # Deterministic, race-free id block for this requirement (no shared counter).
        base_offset = idx * _TC_ID_BLOCK
        async with limiter.slot():
            if on_requirement_start is not None:
                started = on_requirement_start(idx)
                if asyncio.iscoroutine(started):
                    await started
            parsed = parsed_meta.get(req) if parsed_meta else None
            cases, retries, rag_chunks, coverage, error_info = await _generate_one(
                req, base_offset, prompt_version, provider, parsed=parsed, limiter=limiter
            )

            # Tally outcomes for run-status classification.
            error_count += error_info.get("attempts", 1) if (not cases and error_info) else retries
            if not cases:
                failed_reqs += 1
            if error_info and error_info.get("fatal") and fatal_error is None:
                fatal_error = error_info

            # ── Per-requirement generation status ──────────────────
            if cases:
                gen_status = {
                    "requirement_index": idx,
                    "generation_status": "generated",
                    "failure_type": None,
                    "failure_reason": None,
                    "last_attempt_at": datetime.now(timezone.utc).isoformat(),
                }
            else:
                gen_status = {
                    "requirement_index": idx,
                    "generation_status": "generation_failed",
                    "failure_type": (error_info or {}).get("failure_type", "unknown"),
                    "failure_reason": (error_info or {}).get("failure_reason"),
                    "last_attempt_at": (error_info or {}).get("last_attempt_at"),
                }
            jobs[job_id]["requirement_status"].append(gen_status)

            # Deduplicate WITHIN this requirement only. Each process() call owns
            # exactly one requirement's cases, so there is no cross-requirement
            # state — boundary/timing/safety/etc. variants are preserved, and a
            # case is dropped only when it genuinely repeats another (same slot
            # + near-identical steps/expected results), never on title alone.
            unique, removed = deduplicate(cases)
            unique_dumps = [tc.model_dump() for tc in unique]
            coverage_entry = {"requirement_index": idx, **coverage}

            jobs[job_id]["current"] = idx + 1
            jobs[job_id]["test_cases"].extend(unique_dumps)
            jobs[job_id]["rag_enabled"] = True
            jobs[job_id]["coverage"].append(coverage_entry)

            # Incremental persistence hook (durable jobs). Runs in its own DB
            # transaction inside the callback so partial work survives a crash.
            if on_requirement_done is not None:
                result = on_requirement_done(
                    idx, unique_dumps, coverage_entry, gen_status, error_info
                )
                if asyncio.iscoroutine(result):
                    await result

            logger.info(
                "Req %d/%d done — %d cases (%d dup removed), %d RAG chunks, %d retries, "
                "limit=%d, %d coverage warnings",
                idx + 1, len(requirements), len(unique), removed, len(rag_chunks), retries,
                limiter.limit, len(coverage.get("warnings", [])),
            )

    tasks = [process(req, i) for i, req in enumerate(requirements)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, Exception):
            logger.error("Task exception: %s", r)
            error_count += 1

    # ── Classify the run outcome ──────────────────────────────────
    total = len(requirements)
    job = jobs[job_id]
    produced = len(job.get("test_cases", []))
    job["generation_duration"] = round(time.perf_counter() - start_ts, 2)
    job["error_count"] = error_count
    job["failed_requirement_count"] = failed_reqs
    job["fallback_used"] = False  # strict BYOK — no fallback path exists

    if fatal_error is not None:
        outcome, reason = "failed", _fatal_reason(fatal_error)
        job["error_type"] = fatal_error.get("error_type")
    elif total and failed_reqs >= total:
        outcome, reason = "failed", f"All {total} requirements failed generation"
    elif failed_reqs > 0:
        outcome, reason = "warning", f"{failed_reqs} of {total} requirements failed generation"
    else:
        outcome, reason = "complete", None

    job["outcome"] = outcome
    job["reason"] = reason
    # SSE contract: surface results when any were produced ("complete"), otherwise
    # report a hard error so the UI shows the failure instead of an empty success.
    if produced > 0:
        job["status"] = "complete"
    else:
        job["status"] = "error"
        job["error"] = reason or "Generation produced no test cases"

    logger.info(
        "Run %s finished — outcome=%s, %d/%d reqs failed, %d errors, %d cases, %.2fs",
        job_id, outcome, failed_reqs, total, error_count, produced, job["generation_duration"],
    )


def _fatal_reason(error_info: dict) -> str:
    """Map a fatal provider error to a concise, user-facing run reason."""
    t = error_info.get("error_type")
    provider = error_info.get("provider") or "provider"
    return {
        "missing_key": f"No API key configured for {provider}",
        "authentication": f"Provider authentication failed ({provider})",
        "invalid_key": f"Invalid API key for {provider}",
        "quota_exhausted": f"Provider quota exhausted ({provider})",
    }.get(t, error_info.get("message") or "Provider error")
