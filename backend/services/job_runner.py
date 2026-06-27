"""Durable-job orchestration (Phase 2B).

Drives one generation job to completion against the DB: rebuilds the provider and
inputs from persisted state, runs the existing ``run_batch`` with incremental-
persistence callbacks, heartbeats the lease, honours cancellation, and finalizes
the run artifact. Crash-safe and resumable — a re-claimed job skips requirements
already persisted as ``generated``.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime

from database import SessionLocal
from db_models import Run
from providers import provider_manager
from services import db_service, jobs
from services.generator import run_batch

logger = logging.getLogger(__name__)

_HEARTBEAT_INTERVAL = 15  # seconds; must be well under the lease window


async def _heartbeat_loop(job_id: str, stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            await asyncio.wait_for(stop.wait(), timeout=_HEARTBEAT_INTERVAL)
        except asyncio.TimeoutError:
            pass
        if stop.is_set():
            break
        s = SessionLocal()
        try:
            jobs.heartbeat(s, job_id)
        except Exception as exc:  # noqa: BLE001 — heartbeat must never kill the job
            logger.warning("Heartbeat failed for %s: %s", job_id, exc)
        finally:
            s.close()


async def run_generation_job(job_id: str) -> str:
    """Execute one claimed job. Returns the resolved outcome.

    Raises on unexpected failure so the worker loop can decide to requeue (lease
    will also expire as a backstop). Per-requirement failures are NOT raised —
    they are classified and persisted by the generator.
    """
    # ── Rebuild inputs from persisted state (no in-memory dependency) ──────────
    db = SessionLocal()
    try:
        run = db_service.get_run(db, job_id)
        if not run:
            logger.error("Job %s has no run row; nothing to do.", job_id)
            jobs.set_status(db, job_id, "failed", "missing run row")
            return "failed"
        # Resolve BYOK from the run's OWNING organization (tenancy isolation).
        from db_models import Project
        project = db.get(Project, run.project_id)
        org_id = project.organization_id if project else None
        provider = provider_manager.resolve_for(db, run.provider, run.model, org_id=org_id)
        reqs = db_service.get_requirements_for_run(db, job_id)
        requirements = [r.text for r in reqs]
        parsed_meta = {r.text: r.meta for r in reqs if r.meta}
        # Resume: requirements already persisted as generated are not re-run.
        skip = {r.position for r in reqs if r.generation_status == "generated"}
    finally:
        db.close()

    if skip:
        logger.info("Job %s resuming — skipping %d already-generated requirement(s).", job_id, len(skip))

    # ── Per-requirement callbacks (each in its own short transaction) ──────────
    def on_start(idx: int) -> None:
        s = SessionLocal()
        try:
            db_service.mark_requirement_in_progress(s, job_id, idx)
        finally:
            s.close()

    def on_done(idx, cases, coverage, gen_status, error_info) -> None:
        s = SessionLocal()
        try:
            db_service.persist_requirement_result(s, job_id, idx, cases, coverage, gen_status)
            jobs.bump_progress(s, job_id, 1)
        finally:
            s.close()

    def should_cancel() -> bool:
        s = SessionLocal()
        try:
            return jobs.is_cancelled(s, job_id)
        finally:
            s.close()

    # ── Run with heartbeat ─────────────────────────────────────────────────────
    start = time.perf_counter()
    stop = asyncio.Event()
    hb = asyncio.create_task(_heartbeat_loop(job_id, stop))
    throwaway: dict = {job_id: {
        "job_id": job_id, "status": "running", "current": 0,
        "total": len(requirements), "test_cases": [], "rag_enabled": False,
        "requirement_status": [],
    }}
    try:
        await run_batch(
            requirements, job_id, throwaway,
            provider=provider, parsed_meta=parsed_meta,
            on_requirement_start=on_start, on_requirement_done=on_done,
            should_cancel=should_cancel, skip_positions=skip,
        )
    finally:
        stop.set()
        await hb

    duration = round(time.perf_counter() - start, 2)

    # ── Finalize ───────────────────────────────────────────────────────────────
    s = SessionLocal()
    try:
        cancelled = jobs.is_cancelled(s, job_id)
        outcome = db_service.finalize_job(s, job_id, generation_duration=duration)
        if cancelled:
            run = s.get(Run, job_id)
            if run:
                run.status = "cancelled"
                run.error = "cancelled by user"
                run.completed_at = datetime.utcnow()
                s.commit()
            jobs.set_status(s, job_id, "cancelled")
            logger.info("Job %s cancelled (partial results retained).", job_id)
            return "cancelled"
        jobs.set_status(s, job_id, "complete")
        logger.info("Job %s finished — outcome=%s, %.2fs.", job_id, outcome, duration)
        return outcome or "complete"
    finally:
        s.close()
