"""Durable-job worker (Phase 2B).

A standalone process — deployed as a separate Render worker / ECS service sharing
the same DATABASE_URL — that claims queued generation jobs, runs them, and reaps
jobs abandoned by dead workers. Generation no longer runs inside the API process.

Run with:  python -m worker     (or: python worker.py)
"""

from __future__ import annotations

import asyncio
import logging
import os
import socket
import uuid

from database import SessionLocal
from db_models import GenerationJob
from services import jobs
from services.job_runner import run_generation_job

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("worker")

WORKER_ID = f"{socket.gethostname()}:{os.getpid()}:{uuid.uuid4().hex[:8]}"
IDLE_POLL_SECONDS = float(os.getenv("WORKER_POLL_SECONDS", "2"))
REAP_EVERY_SECONDS = float(os.getenv("WORKER_REAP_SECONDS", "30"))


async def _handle_one() -> bool:
    """Claim and run a single job. Returns True if work was done."""
    db = SessionLocal()
    try:
        job_id = jobs.claim_next(db, WORKER_ID)
    finally:
        db.close()
    if not job_id:
        return False

    logger.info("Claimed job %s", job_id)
    try:
        await run_generation_job(job_id)
    except Exception as exc:  # noqa: BLE001 — decide retry vs fail, never crash the loop
        logger.exception("Job %s raised: %s", job_id, exc)
        _release_or_fail(job_id, str(exc))
    return True


def _release_or_fail(job_id: str, error: str) -> None:
    """On an unexpected job exception, requeue if attempts remain, else fail."""
    s = SessionLocal()
    try:
        job = s.get(GenerationJob, job_id)
        if not job:
            return
        if (job.attempt_count or 0) >= (job.max_attempts or jobs.DEFAULT_MAX_ATTEMPTS):
            jobs.set_status(s, job_id, "failed", error)
            from services import db_service
            db_service.fail_run(s, job_id, f"Generation failed: {error}")
        else:
            job.status = "queued"
            job.claimed_by = None
            job.lease_expires_at = None
            s.commit()
    finally:
        s.close()


async def main() -> None:
    logger.info("Worker %s starting (poll=%ss, reap=%ss).", WORKER_ID, IDLE_POLL_SECONDS, REAP_EVERY_SECONDS)
    # Generation runs HERE (not in the API), so RAG must be initialised in the
    # worker for retrieval enrichment to actually apply. Degrades gracefully when
    # RAG_ENABLED=false (no-op) or the RAG stack isn't installed.
    from services.rag import rag_enabled, rag_pipeline
    if rag_enabled():
        try:
            logger.info("Initializing RAG pipeline in worker...")
            await rag_pipeline.initialize()
            logger.info("RAG pipeline ready in worker.")
        except Exception as exc:  # noqa: BLE001 — never block generation on RAG
            logger.warning("RAG init failed (continuing without enrichment): %s", exc)
    last_reap = 0.0
    loop = asyncio.get_event_loop()
    while True:
        now = loop.time()
        if now - last_reap >= REAP_EVERY_SECONDS:
            s = SessionLocal()
            try:
                jobs.reap_stale_jobs(s)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Reaper error: %s", exc)
            finally:
                s.close()
            last_reap = now

        did_work = await _handle_one()
        if not did_work:
            await asyncio.sleep(IDLE_POLL_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Worker stopped.")
