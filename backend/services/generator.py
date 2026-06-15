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


async def _generate_one(
    requirement: str,
    tc_offset: int,
    prompt_version: str,
    provider=None,
) -> tuple[list, int, list[dict], dict]:
    """
    Generate test cases for a single requirement.
    Returns (test_cases, retry_count, rag_chunks, coverage_report).
    """
    from prompts.manager import get_prompt
    from providers import get_provider
    from services import cache
    from services import requirement_analyzer as analyzer
    from services import validator
    from services.rag import rag_pipeline

    # ── Deterministic metadata extraction (no LLM, cannot hallucinate) ──
    meta = analyzer.extract_metadata(requirement)
    req_id = meta["requirement_id"]

    # ── Cache check ──────────────────────────────────────────────
    cached = cache.get(requirement, prompt_version)
    if cached:
        cases, warnings = validator.validate_batch(cached, req_id=req_id, offset=tc_offset)
        for i, tc in enumerate(cases):
            tc.test_id = f"TC_{tc_offset + i + 1:03d}"
        _preserve_requirement_id(cases, req_id)
        coverage = validator.validate_coverage(cases, meta)
        return cases, 0, [], coverage

    if provider is None:
        provider = get_provider()
    system_prompt = get_prompt("generate", prompt_version)

    # ── RAG enrichment ────────────────────────────────────────────
    user_msg, rag_chunks = rag_pipeline.build_enriched_prompt(requirement)

    # ── Prepend authoritative extracted facts (anti-hallucination) ──
    facts_block = analyzer.format_metadata_block(meta)
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

            # ── Post-generation coverage validation ───────────────
            coverage = validator.validate_coverage(cases, meta)
            if coverage["warnings"]:
                logger.info("Coverage findings for %s: %s", req_id, coverage["warnings"])

            # ── Cache the result ──────────────────────────────────
            cache.set(requirement, prompt_version, [tc.model_dump() for tc in cases])
            return cases, attempt, rag_chunks, coverage

        except Exception as exc:
            last_exc = exc
            logger.warning("Attempt %d/%d failed: %s", attempt + 1, MAX_RETRIES + 1, exc)
            if attempt < MAX_RETRIES:
                await asyncio.sleep(0.3 * (attempt + 1))

    logger.error("All attempts failed for '%s...': %s", requirement[:40], last_exc)
    return [], MAX_RETRIES, [], validator.validate_coverage([], meta)


async def run_batch(requirements: list[str], job_id: str, jobs: dict, provider=None) -> None:
    """
    Process all requirements concurrently and stream results via jobs dict.
    The SSE endpoint reads jobs[job_id] every 400ms to stream progress to frontend.
    """
    from prompts.manager import get_current_version
    from services.dedup import is_duplicate

    prompt_version = get_current_version()
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    seen_titles: list[str] = []
    tc_offset = 0

    jobs[job_id].setdefault("coverage", [])

    async def process(req: str, idx: int) -> None:
        nonlocal tc_offset
        async with semaphore:
            cases, retries, rag_chunks, coverage = await _generate_one(
                req, tc_offset, prompt_version, provider
            )
            tc_offset += len(cases)

            unique = []
            for tc in cases:
                if not is_duplicate(tc.title, seen_titles):
                    seen_titles.append(tc.title)
                    unique.append(tc)

            jobs[job_id]["current"] = idx + 1
            jobs[job_id]["test_cases"].extend([tc.model_dump() for tc in unique])
            jobs[job_id]["rag_enabled"] = True
            jobs[job_id]["coverage"].append({"requirement_index": idx, **coverage})
            logger.info(
                "Req %d/%d done — %d cases, %d RAG chunks, %d retries, %d coverage warnings",
                idx + 1, len(requirements), len(unique), len(rag_chunks), retries,
                len(coverage.get("warnings", [])),
            )

    tasks = [process(req, i) for i, req in enumerate(requirements)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for r in results:
        if isinstance(r, Exception):
            logger.error("Task exception: %s", r)

    jobs[job_id]["status"] = "complete"
