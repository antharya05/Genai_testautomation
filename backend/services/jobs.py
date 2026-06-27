"""Durable generation-job queue (Phase 2B).

A thin queue over the ``generation_jobs`` table — the single seam the rest of the
platform uses to enqueue, claim, heartbeat, cancel, and reap generation work.
Keeping the mechanism here (and nowhere else) is what makes the later ARQ/SQS
off-ramp a localized change.

Claiming is transactional: on PostgreSQL it uses ``SELECT ... FOR UPDATE SKIP
LOCKED`` so N workers safely take distinct jobs; on SQLite (dev only) it degrades
to a plain select under the assumption of a single worker.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from db_models import GenerationJob, Run

logger = logging.getLogger(__name__)

DEFAULT_LEASE_SECONDS = 90
DEFAULT_MAX_ATTEMPTS = 3

# Execution statuses that mean "a worker should be (or is) on this".
_ACTIVE = ("claimed", "running", "finalizing")
_TERMINAL = ("complete", "failed", "cancelled")


def enqueue(db: Session, run_id: str, total: int, max_attempts: int = DEFAULT_MAX_ATTEMPTS) -> GenerationJob:
    """Create the queued job row for a freshly-created run."""
    now = datetime.utcnow()
    job = GenerationJob(
        id=run_id,
        status="queued",
        attempt_count=0,
        max_attempts=max_attempts,
        progress_current=0,
        progress_total=total,
        created_at=now,
        updated_at=now,
    )
    db.add(job)
    db.commit()
    return job


def _is_postgres(db: Session) -> bool:
    return db.bind.dialect.name == "postgresql"


def claim_next(db: Session, worker_id: str, lease_seconds: int = DEFAULT_LEASE_SECONDS) -> Optional[str]:
    """Atomically claim the next runnable job; return its id or None.

    Runnable = queued, or active-but-lease-expired (a dead worker's job), with
    attempts remaining. The whole select+update runs in one transaction so the
    row lock (Postgres) prevents a double claim.
    """
    now = datetime.utcnow()
    stmt = (
        select(GenerationJob)
        .where(
            GenerationJob.attempt_count < GenerationJob.max_attempts,
            (GenerationJob.status == "queued")
            | (
                GenerationJob.status.in_(_ACTIVE)
                & (GenerationJob.lease_expires_at < now)
            ),
        )
        .order_by(GenerationJob.created_at)
        .limit(1)
    )
    if _is_postgres(db):
        stmt = stmt.with_for_update(skip_locked=True)

    job = db.execute(stmt).scalars().first()
    if job is None:
        db.commit()  # release any txn/lock
        return None

    job.status = "running"
    job.claimed_by = worker_id
    job.claimed_at = now
    job.heartbeat_at = now
    job.lease_expires_at = now + timedelta(seconds=lease_seconds)
    job.attempt_count = (job.attempt_count or 0) + 1
    if job.started_at is None:
        job.started_at = now
    job.updated_at = now
    db.commit()
    return job.id


def heartbeat(db: Session, job_id: str, lease_seconds: int = DEFAULT_LEASE_SECONDS) -> None:
    """Extend a running job's lease so the reaper doesn't reclaim it."""
    now = datetime.utcnow()
    job = db.get(GenerationJob, job_id)
    if job and job.status in _ACTIVE:
        job.heartbeat_at = now
        job.lease_expires_at = now + timedelta(seconds=lease_seconds)
        job.updated_at = now
        db.commit()


def bump_progress(db: Session, job_id: str, delta: int = 1) -> None:
    """Atomically advance the denormalised progress counter."""
    job = db.get(GenerationJob, job_id)
    if job:
        job.progress_current = (job.progress_current or 0) + delta
        job.updated_at = datetime.utcnow()
        db.commit()


def set_status(db: Session, job_id: str, status: str, last_error: Optional[str] = None) -> None:
    job = db.get(GenerationJob, job_id)
    if not job:
        return
    job.status = status
    if last_error is not None:
        job.last_error = last_error
    if status in _TERMINAL:
        job.finished_at = datetime.utcnow()
    job.updated_at = datetime.utcnow()
    db.commit()


def is_cancelled(db: Session, job_id: str) -> bool:
    job = db.get(GenerationJob, job_id)
    return bool(job and job.cancel_requested)


def request_cancel(db: Session, job_id: str) -> bool:
    """Flag a job for cancellation.

    If it hasn't started yet (still queued), cancel it immediately so it's never
    picked up. If it's running, the worker observes the flag at the next
    requirement boundary and stops cooperatively.
    """
    job = db.get(GenerationJob, job_id)
    if not job or job.status in _TERMINAL:
        return False
    job.cancel_requested = True
    job.updated_at = datetime.utcnow()
    if job.status == "queued":
        job.status = "cancelled"
        job.finished_at = datetime.utcnow()
        run = db.get(Run, job_id)
        if run:
            run.status = "cancelled"
            run.completed_at = datetime.utcnow()
            run.error = "cancelled before generation started"
    db.commit()
    return True


def reap_stale_jobs(db: Session) -> int:
    """Requeue jobs whose lease expired (worker died); fail those out of attempts.

    Replaces the old blanket ``sweep_interrupted_runs`` "running -> error": work
    is now recovered, not discarded. Returns the number of jobs acted on.
    """
    now = datetime.utcnow()
    stale = (
        db.query(GenerationJob)
        .filter(
            GenerationJob.status.in_(_ACTIVE),
            GenerationJob.lease_expires_at < now,
        )
        .all()
    )
    acted = 0
    for job in stale:
        acted += 1
        if (job.attempt_count or 0) >= (job.max_attempts or DEFAULT_MAX_ATTEMPTS):
            job.status = "failed"
            job.last_error = "exceeded max attempts after worker interruption"
            job.finished_at = now
            run = db.get(Run, job.id)
            if run and run.status not in ("complete", "warning"):
                run.status = "error"
                run.completed_at = now
                run.error = job.last_error
        else:
            # Make it claimable again; lease cleared so it sorts as runnable.
            job.status = "queued"
            job.claimed_by = None
            job.lease_expires_at = None
        job.updated_at = now
    if acted:
        db.commit()
        logger.warning("Reaper acted on %d stale job(s).", acted)
    return acted
