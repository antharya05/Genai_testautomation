"""Generation reliability & failure-visibility tests.

Covers the production hardening: retry/backoff policy, adaptive concurrency,
per-requirement failure classification & persistence, coverage-vs-generation
separation, and the deterministic (race-free) test-id scheme.
"""

import asyncio
import json

import pytest

from services import generator
from services.concurrency import AdaptiveLimiter, backoff_delay, limits_for
from services.generator import run_batch
from providers.errors import ProviderError, ProviderErrorType


# ── Fakes ─────────────────────────────────────────────────────────────────────

TWO_CASES = json.dumps([
    {"test_id": "", "requirement_id": "REQ_050", "title": "Nominal brake", "asil": "A",
     "test_type": "functional", "preconditions": ["ECU powered"], "steps": ["apply brake"],
     "expected_results": ["brake engages"]},
    {"test_id": "", "requirement_id": "REQ_050", "title": "Brake timing", "asil": "A",
     "test_type": "timing", "preconditions": ["ECU powered"], "steps": ["measure latency"],
     "expected_results": ["responds promptly"]},
])


class RateLimitProvider:
    provider_id = "groq"
    model_name = "groq-test"

    def __init__(self):
        self.calls = 0
        self.last_usage = {"input": 0, "output": 0}

    def complete(self, *a, **k):
        self.calls += 1
        raise ProviderError("429 too many requests", ProviderErrorType.RATE_LIMIT,
                            provider="groq", retry_after=0)


class GoodProvider:
    provider_id = "fake"
    model_name = "fake-model"

    def __init__(self, payload=TWO_CASES):
        self._payload = payload
        self.last_usage = {"input": 10, "output": 20}

    def complete(self, *a, **k):
        return self._payload


def _seed(job_id, total=1):
    return {job_id: {"job_id": job_id, "status": "running", "current": 0, "total": total,
                     "test_cases": [], "rag_enabled": False, "error": None,
                     "requirement_status": []}}


@pytest.fixture(autouse=True)
def _instant_backoff(monkeypatch):
    """Neutralise sleep delays so retry paths run instantly under test."""
    monkeypatch.setattr("services.concurrency.backoff_delay", lambda *a, **k: 0.0)


# ── Backoff ───────────────────────────────────────────────────────────────────

def test_backoff_honours_retry_after_and_caps():
    # Retry-After respected (plus small jitter), and capped.
    d = backoff_delay(0, retry_after=3.0)
    assert 3.0 <= d <= 3.5
    capped = backoff_delay(0, retry_after=10_000, cap=30.0)
    assert capped <= 30.5


def test_backoff_full_jitter_within_window():
    # Exponential window with full jitter: 0 <= delay <= base*2**attempt (<= cap).
    for attempt in range(5):
        d = backoff_delay(attempt, base=0.5, cap=30.0)
        assert 0.0 <= d <= min(30.0, 0.5 * (2 ** attempt))


# ── Adaptive concurrency ──────────────────────────────────────────────────────

def test_limiter_multiplicative_decrease_on_rate_limit():
    lim = AdaptiveLimiter(initial=8, min_limit=1, max_limit=8)
    asyncio.run(lim.on_rate_limit())
    assert lim.limit == 4
    asyncio.run(lim.on_rate_limit())
    assert lim.limit == 2
    for _ in range(5):
        asyncio.run(lim.on_rate_limit())
    assert lim.limit == 1  # never below the floor


def test_limiter_additive_increase_after_success_streak():
    lim = AdaptiveLimiter(initial=2, min_limit=1, max_limit=4, increase_after=3)

    async def drive():
        for _ in range(3):
            await lim.on_success()
    asyncio.run(drive())
    assert lim.limit == 3  # grew by one after the streak

    asyncio.run(drive())
    assert lim.limit == 4
    asyncio.run(drive())
    assert lim.limit == 4  # capped at max


def test_provider_specific_limits():
    assert limits_for("groq")["max"] <= limits_for("anthropic")["max"]
    assert limits_for("unknown-provider") == limits_for(None)


# ── Failure classification & visibility ───────────────────────────────────────

def test_rate_limit_requirement_marked_failed_with_reason():
    jobs = _seed("rl")
    provider = RateLimitProvider()
    asyncio.run(run_batch(["REQ_900: do a thing"], "rl", jobs, provider=provider))
    job = jobs["rl"]
    assert job["status"] == "error"
    assert job["failed_requirement_count"] == 1
    # Retryable failure → attempted MAX_RETRIES+1 times before giving up.
    assert provider.calls == generator.MAX_RETRIES + 1
    rs = job["requirement_status"]
    assert len(rs) == 1
    assert rs[0]["generation_status"] == "generation_failed"
    assert rs[0]["failure_type"] == "rate_limit"
    assert rs[0]["failure_reason"]


def test_parse_failure_is_not_retried():
    jobs = _seed("pf")
    provider = GoodProvider("not json at all")
    # Count calls via a wrapper.
    calls = {"n": 0}
    orig = provider.complete
    def counting(*a, **k):
        calls["n"] += 1
        return orig(*a, **k)
    provider.complete = counting
    asyncio.run(run_batch(["REQ_901: do a thing"], "pf", jobs, provider=provider))
    rs = jobs["pf"]["requirement_status"][0]
    assert rs["generation_status"] == "generation_failed"
    assert rs["failure_type"] == "parsing_failure"
    assert calls["n"] == 1  # deterministic → tried exactly once, never retried


def test_generated_requirement_has_clean_status():
    jobs = _seed("ok")
    asyncio.run(run_batch(["REQ_050: apply the brake within 100 ms"], "ok", jobs,
                          provider=GoodProvider()))
    rs = jobs["ok"]["requirement_status"][0]
    assert rs["generation_status"] == "generated"
    assert rs["failure_type"] is None


# ── Deterministic test-ids (tc_offset audit) ──────────────────────────────────

def test_test_ids_are_unique_and_namespaced_per_requirement():
    jobs = _seed("ids", total=3)
    reqs = [f"REQ_05{i}: apply the brake within 100 ms variant {i}" for i in range(3)]
    asyncio.run(run_batch(reqs, "ids", jobs, provider=GoodProvider()))
    ids = [tc["test_id"] for tc in jobs["ids"]["test_cases"]]
    assert len(ids) == len(set(ids)), f"duplicate test ids: {ids}"
    # Each requirement occupies its own id block (idx * _TC_ID_BLOCK).
    assert "TC_001" in ids                                       # req 0 → block 0
    assert f"TC_{generator._TC_ID_BLOCK + 1:03d}" in ids         # req 1 → block 1 (TC_1001)
    assert f"TC_{2 * generator._TC_ID_BLOCK + 1:03d}" in ids     # req 2 → block 2 (TC_2001)


# ── Persistence: coverage vs generation are separate axes ─────────────────────

def test_failed_requirement_persisted_as_failed_not_uncovered(db_session):
    """A rate-limited requirement persists as generation_failed with its cause,
    while its coverage remains 'uncovered' — the two axes are independent."""
    from services.db_service import (
        create_run, ensure_default_project, finalize_run,
        get_requirements_for_run, requirement_to_dict,
    )

    # runs.project_id is an enforced FK — make sure the default project row exists.
    ensure_default_project(db_session)
    job_id = "persist-fail"
    create_run(db_session, job_id=job_id, project_id="00000000-0000-0000-0000-000000000001",
               requirements=["REQ_910: emergency stop within 50 ms"],
               provider="groq", model="groq-test", prompt_version="v1")
    # Mid-run state: created as pending.
    pending = requirement_to_dict(get_requirements_for_run(db_session, job_id)[0])
    assert pending["generation_status"] == "pending"

    finalize_run(
        db_session, job_id, test_cases=[], rag_enabled=False,
        outcome="failed", reason="1 of 1 requirements failed generation",
        failed_requirement_count=1, coverage=[{"requirement_index": 0, "warnings": []}],
        requirement_status=[{
            "requirement_index": 0, "generation_status": "generation_failed",
            "failure_type": "rate_limit", "failure_reason": "429 too many requests",
            "last_attempt_at": "2026-06-19T00:00:00+00:00",
        }],
    )

    row = requirement_to_dict(get_requirements_for_run(db_session, job_id)[0])
    assert row["generation_status"] == "generation_failed"
    assert row["failure_type"] == "rate_limit"
    assert row["failure_reason"] == "429 too many requests"
    assert row["last_attempt_at"] is not None
    # Coverage axis is untouched/independent.
    assert row["validation_status"] == "uncovered"
    assert row["covered"] is False
