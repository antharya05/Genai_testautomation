"""Async batch generator — happy path, ASIL/ID propagation, failure handling.

Uses a fake provider so no network/LLM is involved. ``run_batch`` is driven via
``asyncio.run`` to avoid a pytest-asyncio dependency.
"""

import asyncio
import json

from services.generator import run_batch


class FakeProvider:
    provider_id = "fake"
    model_name = "fake-model"

    def __init__(self, payload):
        self._payload = payload
        self.last_usage = {"input": 10, "output": 20}

    def complete(self, system, user, temperature=0.0, max_tokens=4096):
        return self._payload


TWO_CASES = json.dumps([
    {"test_id": "", "requirement_id": "REQ_050", "title": "Nominal brake", "asil": "A",
     "test_type": "functional", "preconditions": ["ECU powered"], "steps": ["apply brake"],
     "expected_results": ["brake engages"]},
    {"test_id": "", "requirement_id": "REQ_050", "title": "Brake timing", "asil": "A",
     "test_type": "timing", "preconditions": ["ECU powered"], "steps": ["measure latency"],
     "expected_results": ["responds promptly"]},
])


def _seed(job_id, total=1):
    return {job_id: {"job_id": job_id, "status": "running", "current": 0,
                     "total": total, "test_cases": [], "rag_enabled": False, "error": None}}


def test_run_batch_happy_path():
    jobs = _seed("job1")
    asyncio.run(run_batch(["REQ_050: apply the brake within 100 ms"], "job1", jobs,
                          provider=FakeProvider(TWO_CASES)))
    job = jobs["job1"]
    assert job["status"] == "complete"
    assert job["outcome"] == "complete"
    assert len(job["test_cases"]) >= 2


def test_requirement_id_and_asil_propagated():
    jobs = _seed("job2")
    asyncio.run(run_batch(["REQ_050: apply the brake within 100 ms"], "job2", jobs,
                          provider=FakeProvider(TWO_CASES)))
    cases = jobs["job2"]["test_cases"]
    # Regex-extracted id forced onto every case.
    assert all(tc["requirement_id"] == "REQ_050" for tc in cases)
    # ASIL resolved deterministically ("brake" → estimated D) overrides the LLM's "A".
    assert all(tc["asil"] == "D" for tc in cases)
    assert all(tc["asil_source"] == "estimated" for tc in cases)


def test_no_provider_fails_run():
    jobs = _seed("job3")
    asyncio.run(run_batch(["REQ_060: do something"], "job3", jobs, provider=None))
    job = jobs["job3"]
    # No provider → no cases produced → the run surfaces as an error to the UI.
    assert job["status"] == "error"
    assert job["test_cases"] == []


def test_invalid_json_from_provider_fails_gracefully():
    jobs = _seed("job4")
    asyncio.run(run_batch(["REQ_070: do something"], "job4", jobs,
                          provider=FakeProvider("not json at all")))
    job = jobs["job4"]
    assert job["status"] == "error"
    assert job["failed_requirement_count"] == 1


def test_cache_used_on_second_run():
    from services import cache

    jobs = _seed("job5")
    asyncio.run(run_batch(["REQ_050: apply the brake within 100 ms"], "job5", jobs,
                          provider=FakeProvider(TWO_CASES)))
    assert cache.size() >= 1
    # Second run with a provider that would error — a cache hit means it's never called.
    jobs2 = _seed("job6")
    asyncio.run(run_batch(["REQ_050: apply the brake within 100 ms"], "job6", jobs2,
                          provider=FakeProvider("BROKEN")))
    assert jobs2["job6"]["status"] == "complete"
