"""Phase 2B — durable job queue: enqueue/claim/run/resume/cancel/reaper/SSE.

A fake provider stands in for the LLM, and the durable runner is driven via
``asyncio.run`` (no pytest-asyncio dependency). Each test sets up via its own
SessionLocal and closes it before running the job, so SQLite file locking never
contends with an open test transaction.
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta

import pytest

from database import SessionLocal
from db_models import GenerationJob, Requirement, Run
from db_models import TestCaseDB as TCDB  # aliased so pytest doesn't try to collect it
from providers import provider_manager
from services import db_service as svc
from services import jobs
from services.job_runner import run_generation_job

TWO_CASES = json.dumps([
    {"test_id": "", "requirement_id": "REQ_050", "title": "Nominal brake", "asil": "A",
     "test_type": "functional", "preconditions": ["ECU powered"], "steps": ["apply brake"],
     "expected_results": ["brake engages"]},
    {"test_id": "", "requirement_id": "REQ_050", "title": "Brake timing", "asil": "A",
     "test_type": "timing", "preconditions": ["ECU powered"], "steps": ["measure latency"],
     "expected_results": ["responds promptly"]},
])


class FakeProvider:
    provider_id = "fake"
    model_name = "fake-model"

    def __init__(self, payload=TWO_CASES):
        self._payload = payload
        self.last_usage = {"input": 10, "output": 20}

    def complete(self, system, user, temperature=0.0, max_tokens=4096):
        return self._payload


@pytest.fixture(autouse=True)
def _fake_provider(monkeypatch):
    """Worker resolves the run's provider from the DB — stub it to a fake."""
    monkeypatch.setattr(provider_manager, "resolve_for", lambda db, p, m, org_id=None: FakeProvider())


@pytest.fixture(autouse=True)
def _isolated_queue():
    """Start each test with an empty queue so claim ordering is deterministic
    (the test DB is shared across the session)."""
    s = SessionLocal()
    try:
        s.query(GenerationJob).delete()
        s.commit()
    finally:
        s.close()
    yield


def _new_run(reqs):
    """Create project + run + requirements + queued job; return (project_id, run_id)."""
    s = SessionLocal()
    try:
        pid = svc.create_project(s, name="Durable Test").id
        run_id = str(uuid.uuid4())
        svc.create_run(s, job_id=run_id, project_id=pid, requirements=reqs,
                       provider="fake", model="fake-model", prompt_version="v1")
        jobs.enqueue(s, run_id, total=len(reqs))
        return pid, run_id
    finally:
        s.close()


def _counts(run_id):
    s = SessionLocal()
    try:
        tcs = s.query(TCDB).filter(TCDB.run_id == run_id).count()
        reqs = s.query(Requirement).filter(Requirement.run_id == run_id).all()
        gen = sum(1 for r in reqs if r.generation_status == "generated")
        return tcs, gen, len(reqs)
    finally:
        s.close()


# ── Queue mechanics ───────────────────────────────────────────────────────────

def test_enqueue_creates_queued_job():
    _, run_id = _new_run(["REQ_050: apply the brake within 100 ms"])
    s = SessionLocal()
    try:
        job = s.get(GenerationJob, run_id)
        assert job is not None
        assert job.status == "queued"
        assert job.progress_total == 1
        assert job.attempt_count == 0
    finally:
        s.close()


def test_claim_marks_running_and_leases():
    _, run_id = _new_run(["REQ_050: apply the brake within 100 ms"])
    s = SessionLocal()
    try:
        claimed = jobs.claim_next(s, "worker-A")
        assert claimed == run_id
        job = s.get(GenerationJob, run_id)
        assert job.status == "running"
        assert job.claimed_by == "worker-A"
        assert job.attempt_count == 1
        assert job.lease_expires_at > datetime.utcnow()
        # Nothing left to claim.
        assert jobs.claim_next(s, "worker-B") is None
    finally:
        s.close()


# ── End-to-end execution ──────────────────────────────────────────────────────

def test_run_job_end_to_end():
    _, run_id = _new_run([
        "REQ_050: apply the brake within 100 ms",
        "REQ_051: release the brake within 80 ms",
    ])
    s = SessionLocal()
    try:
        jobs.claim_next(s, "worker-A")
    finally:
        s.close()

    outcome = asyncio.run(run_generation_job(run_id))
    assert outcome == "complete"

    tcs, gen, total = _counts(run_id)
    assert total == 2 and gen == 2
    assert tcs == 4  # 2 requirements × 2 cases

    s = SessionLocal()
    try:
        run = s.get(Run, run_id)
        job = s.get(GenerationJob, run_id)
        assert run.status == "complete"
        assert run.test_case_count == 4
        assert run.coverage_pct == 100.0
        assert job.status == "complete"
        assert job.progress_current == 2
    finally:
        s.close()


def test_incremental_persistence_marks_in_progress_then_generated():
    """Each requirement is persisted as it finishes (not only at the end), and
    transitions through the now-live in_progress -> generated states."""
    _, run_id = _new_run(["REQ_050: apply the brake within 100 ms"])
    asyncio.run(run_generation_job(run_id))
    s = SessionLocal()
    try:
        req = s.query(Requirement).filter(Requirement.run_id == run_id).first()
        assert req.generation_status == "generated"
        assert req.started_at is not None        # in_progress stamp survived
        assert req.attempt_count >= 1
        assert req.test_case_count == 2
    finally:
        s.close()


# ── Resume / idempotency ──────────────────────────────────────────────────────

def test_resume_skips_generated_and_is_idempotent():
    _, run_id = _new_run([
        "REQ_050: apply the brake within 100 ms",
        "REQ_051: release the brake within 80 ms",
    ])
    asyncio.run(run_generation_job(run_id))
    first_tcs, _, _ = _counts(run_id)
    assert first_tcs == 4

    # Re-drive the very same job (as a re-claim after a crash would). The unique
    # (run_id, test_id) index + deterministic ids mean no duplicates appear.
    asyncio.run(run_generation_job(run_id))
    second_tcs, gen, total = _counts(run_id)
    assert second_tcs == 4
    assert gen == total == 2


# ── Cancellation ──────────────────────────────────────────────────────────────

def test_cancel_before_start_marks_cancelled():
    _, run_id = _new_run(["REQ_050: apply the brake within 100 ms"])
    s = SessionLocal()
    try:
        assert jobs.request_cancel(s, run_id) is True
        job = s.get(GenerationJob, run_id)
        assert job.status == "cancelled"
        # A cancelled job is not claimable.
        assert jobs.claim_next(s, "worker-A") is None
    finally:
        s.close()


def test_cancel_during_run_retains_partial_and_stops():
    _, run_id = _new_run(["REQ_050: apply the brake within 100 ms"])
    # Simulate a claimed, running job that has a cancel request in flight.
    s = SessionLocal()
    try:
        job = s.get(GenerationJob, run_id)
        job.status = "running"
        job.cancel_requested = True
        job.lease_expires_at = datetime.utcnow() + timedelta(seconds=90)
        s.commit()
    finally:
        s.close()

    outcome = asyncio.run(run_generation_job(run_id))
    assert outcome == "cancelled"
    s = SessionLocal()
    try:
        assert s.get(Run, run_id).status == "cancelled"
        assert s.get(GenerationJob, run_id).status == "cancelled"
    finally:
        s.close()


# ── Reaper / recovery ─────────────────────────────────────────────────────────

def test_reaper_requeues_stale_job():
    _, run_id = _new_run(["REQ_050: apply the brake within 100 ms"])
    s = SessionLocal()
    try:
        job = s.get(GenerationJob, run_id)
        job.status = "running"
        job.attempt_count = 1
        job.claimed_by = "dead-worker"
        job.lease_expires_at = datetime.utcnow() - timedelta(seconds=5)  # expired
        s.commit()

        acted = jobs.reap_stale_jobs(s)
        assert acted == 1
        s.refresh(job)
        assert job.status == "queued"
        assert job.claimed_by is None
    finally:
        s.close()


def test_reaper_fails_job_out_of_attempts():
    _, run_id = _new_run(["REQ_050: apply the brake within 100 ms"])
    s = SessionLocal()
    try:
        job = s.get(GenerationJob, run_id)
        job.status = "running"
        job.attempt_count = 3
        job.max_attempts = 3
        job.lease_expires_at = datetime.utcnow() - timedelta(seconds=5)
        s.commit()

        jobs.reap_stale_jobs(s)
        s.refresh(job)
        assert job.status == "failed"
        assert s.get(Run, run_id).status == "error"
    finally:
        s.close()


# ── SSE snapshot ──────────────────────────────────────────────────────────────

def test_snapshot_shapes_across_lifecycle():
    _, run_id = _new_run(["REQ_050: apply the brake within 100 ms"])
    s = SessionLocal()
    try:
        snap = svc.get_job_snapshot(s, run_id)
        assert snap["type"] == "progress"   # queued reads as in-progress
        assert snap["total"] == 1
    finally:
        s.close()

    asyncio.run(run_generation_job(run_id))
    s = SessionLocal()
    try:
        snap = svc.get_job_snapshot(s, run_id)
        assert snap["type"] == "complete"
        assert len(snap["test_cases"]) == 2
        assert svc.get_job_snapshot(s, "nonexistent") is None
    finally:
        s.close()
