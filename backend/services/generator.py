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
) -> tuple[list, int, list[dict], dict]:
    """
    Generate test cases for a single requirement.
    Returns (test_cases, retry_count, rag_chunks, coverage_report).

    ``parsed`` is the optional ``ParsedRequirement.to_dict()`` record for this
    requirement. When present, structured parser fields (requirement_id, asil,
    category, …) are authoritative; when absent the legacy string-only path runs
    unchanged.
    """
    from prompts.manager import get_prompt
    from providers import get_provider
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
        return cases, 0, [], coverage

    if provider is None:
        provider = get_provider()
    system_prompt = get_prompt("generate", prompt_version)

    # ── RAG enrichment ────────────────────────────────────────────
    user_msg, rag_chunks = rag_pipeline.build_enriched_prompt(requirement)

    # ── Prepend authoritative extracted facts (anti-hallucination) ──
    user_msg = f"{facts_block}\n\n{'=' * 60}\n\n{user_msg}"

    # ── LLM call with retry ───────────────────────────────────────
    last_exc: Optional[Exception] = None
    for attempt in range(MAX_RETRIES + 1):
        try:
            loop = asyncio.get_event_loop()
            content = await loop.run_in_executor(
                None,
                lambda: provider.complete(
                    system_prompt, user_msg, temperature=TEMPERATURE, max_tokens=4096
                ),
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
            return cases, attempt, rag_chunks, coverage

        except Exception as exc:
            last_exc = exc
            logger.warning("Attempt %d/%d failed: %s", attempt + 1, MAX_RETRIES + 1, exc)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(0.3 * (attempt + 1))

    logger.error("All attempts failed for '%s...': %s", requirement[:40], last_exc)
    return [], MAX_RETRIES, [], validator.validate_coverage([], meta)


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

    jobs[job_id].setdefault("coverage", [])

    async def process(req: str, idx: int) -> None:
        nonlocal tc_offset
        async with semaphore:
            parsed = parsed_meta.get(req) if parsed_meta else None
            cases, retries, rag_chunks, coverage = await _generate_one(
                req, tc_offset, prompt_version, provider, parsed=parsed
            )
            tc_offset += len(cases)

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

    jobs[job_id]["status"] = "complete"
