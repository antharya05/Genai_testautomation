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
asyncio.Semaphore(MAX_CONCURRENCY) limits parallel LLM calls.
run_in_executor moves blocking SDK calls off the event loop.
asyncio.gather runs all requirement tasks concurrently within the semaphore limit.
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

MAX_RETRIES = 2
MAX_CONCURRENCY = 5
TEMPERATURE = 0.0


def _strip_fences(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return text.strip()


def _parse(content: str) -> list[dict]:
    content = _strip_fences(content)
    parsed = json.loads(content)
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        return [parsed]
    raise ValueError(f"Unexpected JSON type: {type(parsed).__name__}")


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
) -> tuple[list, int, list[dict], dict, Optional[dict]]:
    """
    Generate test cases for a single requirement.
    Returns (test_cases, retry_count, rag_chunks, coverage_report, error_info).

    ``error_info`` is ``None`` on success, or a classified ``ProviderError`` dict
    when the requirement produced no test cases (so the batch can classify the
    overall run outcome and surface a clear reason).

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
    for attempt in range(MAX_RETRIES + 1):
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
            raw_list = _parse(content)
            cases, warnings = validator.validate_batch(raw_list, req_id=req_id, offset=tc_offset)

            if warnings:
                logger.warning("Validation warnings for '%s...': %s", requirement[:40], warnings)
            if not cases:
                raise ValueError("Zero valid test cases after validation")

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
            return cases, attempt, rag_chunks, coverage, None

        except Exception as exc:
            latency_ms = (time.perf_counter() - t0) * 1000
            perr = classify_exception(exc, provider=provider_id)
            # A provider call that returned but failed validation/parsing is not a
            # transport failure — the successful request was already recorded above,
            # so only count provider-side faults (where complete() itself raised).
            if isinstance(exc, ProviderError):
                provider_manager.record_usage(
                    provider_id,
                    latency_ms=latency_ms,
                    success=False,
                    error_type=perr.error_type.value,
                )
            last_error_info = perr.to_dict()
            logger.warning(
                "Attempt %d/%d failed (%s): %s",
                attempt + 1, MAX_RETRIES + 1, perr.error_type.value, perr.message,
            )
            # Fatal errors (bad/missing key, quota) hit every requirement identically
            # — stop retrying immediately so the run fails fast with a clear reason.
            if perr.fatal:
                break
            if attempt < MAX_RETRIES:
                await asyncio.sleep(0.3 * (attempt + 1))

    logger.error("All attempts failed for '%s...': %s", requirement[:40], last_error_info)
    return [], MAX_RETRIES, [], validator.validate_coverage([], meta), last_error_info


async def run_batch(
    requirements: list[str],
    job_id: str,
    jobs: dict,
    provider=None,
    parsed_meta: Optional[dict] = None,
) -> None:
    """
    Process all requirements concurrently and stream results via jobs dict.
    The SSE endpoint reads jobs[job_id] every 400ms to stream progress to frontend.

    ``parsed_meta`` optionally maps a requirement string (the flattened
    ``"id: statement"`` text) to its ``ParsedRequirement.to_dict()`` record, so
    structured parser metadata flows into generation. ``None`` keeps the legacy
    list[str]-only behaviour for raw-text / backward-compatible callers.
    """
    from prompts.manager import get_current_version
    from services.dedup import deduplicate

    prompt_version = get_current_version()
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    tc_offset = 0
    start_ts = time.perf_counter()

    # ── Run-outcome accumulators ──────────────────────────────────
    failed_reqs = 0       # requirements that produced zero test cases
    error_count = 0       # total failed LLM attempts across the run
    fatal_error: Optional[dict] = None  # first fatal provider error, if any

    jobs[job_id].setdefault("coverage", [])

    async def process(req: str, idx: int) -> None:
        nonlocal tc_offset, failed_reqs, error_count, fatal_error
        async with semaphore:
            parsed = parsed_meta.get(req) if parsed_meta else None
            cases, retries, rag_chunks, coverage, error_info = await _generate_one(
                req, tc_offset, prompt_version, provider, parsed=parsed
            )
            tc_offset += len(cases)

            # Tally outcomes for run-status classification.
            error_count += (MAX_RETRIES + 1) if not cases else retries
            if not cases:
                failed_reqs += 1
            if error_info and error_info.get("fatal") and fatal_error is None:
                fatal_error = error_info

            # Deduplicate WITHIN this requirement only. Each process() call owns
            # exactly one requirement's cases, so there is no cross-requirement
            # state — boundary/timing/safety/etc. variants are preserved, and a
            # case is dropped only when it genuinely repeats another (same slot
            # + near-identical steps/expected results), never on title alone.
            unique, removed = deduplicate(cases)

            jobs[job_id]["current"] = idx + 1
            jobs[job_id]["test_cases"].extend([tc.model_dump() for tc in unique])
            jobs[job_id]["rag_enabled"] = True
            jobs[job_id]["coverage"].append({"requirement_index": idx, **coverage})
            logger.info(
                "Req %d/%d done — %d cases (%d dup removed), %d RAG chunks, %d retries, %d coverage warnings",
                idx + 1, len(requirements), len(unique), removed, len(rag_chunks), retries,
                len(coverage.get("warnings", [])),
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
