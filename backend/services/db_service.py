"""
CRUD operations for Projects, Runs, Requirements, and TestCases.

Dual-read contract:
  Active jobs  → main._jobs  (in-memory, fast)
  Completed jobs → this module (DB, durable)

All functions accept a SQLAlchemy Session and are synchronous.
The FastAPI routes call them from a regular (non-async) context or
from a background async wrapper that creates its own session.
"""

import hashlib
import json
import re
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from db_models import Project, Requirement, Run, TestCaseDB
from services import asil as asil_resolver


class RunLockedError(Exception):
    """Raised when a write is attempted against an approved/locked run."""

# Trailing "[ASIL X]" tag that ParsedRequirement.as_text() appends — stripped so
# a flattened requirement string can be matched back to its parsed record.
_ASIL_TAG_RE = re.compile(r"\s*\[ASIL [^\]]*\]\s*$", re.IGNORECASE)
# Requirement id prefixes (kept in sync with the parser / requirement_analyzer).
_REQ_ID_RE = re.compile(
    r"\b((?:REQ|FR|SRS|UC|SWR|HWR|SYS|TST|FUNC|INT|NFR|SAF|HSR|FSR|PERF|SR)[-_]?\d+[A-Za-z0-9.\-_]*)",
    re.IGNORECASE,
)

DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_PROJECT_NAME = "Default Project"


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    """Parse an ISO-8601 timestamp (as produced by the generator) to a naive UTC
    datetime for the DateTime column. Returns ``None`` on missing/garbage input."""
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    except (TypeError, ValueError):
        return None


def ensure_encrypted_provider_keys(db: Session) -> int:
    """Encrypt any legacy plaintext provider keys at rest. Returns count migrated."""
    from db_models import ProviderKey
    from services.secrets import encrypt_secret, is_encrypted

    migrated = 0
    try:
        for pk in db.query(ProviderKey).all():
            if pk.api_key and not is_encrypted(pk.api_key):
                pk.api_key = encrypt_secret(pk.api_key)
                migrated += 1
        if migrated:
            db.commit()
    except Exception:
        db.rollback()
        return 0
    return migrated


# ─────────────────────────────────────────────
# Projects
# ─────────────────────────────────────────────

def ensure_default_project(db: Session) -> Project:
    project = db.query(Project).filter(Project.id == DEFAULT_PROJECT_ID).first()
    if not project:
        project = Project(
            id=DEFAULT_PROJECT_ID,
            name=DEFAULT_PROJECT_NAME,
            description="Default project for all generation runs",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(project)
        db.commit()
    return project


def list_projects(db: Session) -> list[Project]:
    return db.query(Project).order_by(desc(Project.created_at)).all()


def get_project(db: Session, project_id: str) -> Optional[Project]:
    return db.query(Project).filter(Project.id == project_id).first()


def create_project(db: Session, name: str, description: str = "",
                   organization_id: Optional[str] = None,
                   created_by_user_id: Optional[str] = None) -> Project:
    project = Project(
        id=str(uuid.uuid4()),
        name=name,
        description=description,
        organization_id=organization_id,
        created_by_user_id=created_by_user_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def update_project(db: Session, project_id: str, name: Optional[str] = None, description: Optional[str] = None) -> Optional[Project]:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return None
    if name is not None:
        project.name = name  # type: ignore[assignment]
    if description is not None:
        project.description = description  # type: ignore[assignment]
    project.updated_at = datetime.utcnow()  # type: ignore[assignment]
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: str) -> bool:
    """Delete a project and everything under it.

    DB-level ``ON DELETE CASCADE`` (with the SQLite FK pragma enabled) is the
    real guarantee, but we also delete the run subtree explicitly here so a
    project delete is correct even on a connection where FK enforcement is off —
    defence-in-depth against the orphaning bug this used to have.
    """
    from db_models import ReviewEvent

    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        return False

    run_ids = [r.id for r in db.query(Run.id).filter(Run.project_id == project_id).all()]
    if run_ids:
        db.query(ReviewEvent).filter(ReviewEvent.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(TestCaseDB).filter(TestCaseDB.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(Requirement).filter(Requirement.run_id.in_(run_ids)).delete(synchronize_session=False)
        db.query(Run).filter(Run.project_id == project_id).delete(synchronize_session=False)

    db.delete(project)
    db.commit()
    return True


# ─────────────────────────────────────────────
# Runs
# ─────────────────────────────────────────────

def _extract_requirement_id(text: str) -> Optional[str]:
    """Fallback requirement-id extraction for legacy / raw-text requirements."""
    m = _REQ_ID_RE.search(text or "")
    if not m:
        return None
    return m.group(1).strip().rstrip(".:,)").upper()


def _match_parsed(req_text: str, parsed_meta: dict) -> Optional[dict]:
    """Correlate a flattened requirement string to its parsed record.

    ``parsed_meta`` is keyed by the "id: statement" projection (see main._parsed_text_key).
    The flattened string may carry a trailing "[ASIL X]" tag, so we try the raw
    text first and then the tag-stripped form.
    """
    if req_text in parsed_meta:
        return parsed_meta[req_text]
    stripped = _ASIL_TAG_RE.sub("", req_text).strip()
    return parsed_meta.get(stripped)


def create_run(
    db: Session,
    job_id: str,
    project_id: str,
    requirements: list[str],
    provider: str,
    model: str,
    prompt_version: str,
    parsed_meta: Optional[dict] = None,
    author_id: Optional[str] = None,
    author_display: Optional[str] = None,
) -> Run:
    run = Run(
        id=job_id,
        project_id=project_id,
        status="running",
        provider=provider,
        model=model,
        requirement_count=len(requirements),
        test_case_count=0,
        rag_enabled=False,
        prompt_version=prompt_version,
        created_at=datetime.utcnow(),
    )
    db.add(run)
    # Flush the parent run before inserting its requirement children. The models
    # declare FK columns but no ORM relationship(), so the unit-of-work doesn't
    # know to order runs before requirements; under enforced FKs that ordering
    # must be made explicit or the child inserts violate the constraint.
    db.flush()

    from services import lifecycle  # lazy: avoid import cycle

    version_ids: list[str] = []
    for i, req_text in enumerate(requirements):
        meta = _match_parsed(req_text, parsed_meta) if parsed_meta else None
        requirement_id = None
        if meta:
            requirement_id = (meta.get("requirement_id") or "").strip() or None
        if not requirement_id:
            requirement_id = _extract_requirement_id(req_text)

        # Phase 4: resolve/record the exact requirement version this run uses.
        statement = (meta or {}).get("statement") or req_text
        version_id = None
        if requirement_id:
            version_id = lifecycle.link_run_requirement(
                db, project_id, requirement_id, statement, meta,
                author_id=author_id, author_display=author_display,
            )
            if version_id:
                version_ids.append(version_id)

        db.add(Requirement(
            id=str(uuid.uuid4()),
            run_id=job_id,
            text=req_text,
            requirement_id=requirement_id,
            position=i,
            meta=meta,
            requirement_version_id=version_id,
            # Submitted for generation but not yet attempted; finalize_run resolves
            # this to generated / generation_failed per requirement.
            generation_status="pending",
        ))

    # Bind the run to the set of requirement versions it generated from.
    if version_ids:
        run.requirement_versions_digest = hashlib.sha256(
            ",".join(sorted(version_ids)).encode("utf-8")
        ).hexdigest()

    db.commit()
    return run


def _build_tc_row(run_id: str, tc: dict) -> TestCaseDB:
    """Build a TestCaseDB row from a generator test-case dict (model_dump)."""
    return TestCaseDB(
        id=str(uuid.uuid4()),
        run_id=run_id,
        test_id=tc.get("test_id", ""),
        requirement_id=tc.get("requirement_id", ""),
        title=tc.get("title", ""),
        asil=tc.get("asil", "QM"),
        asil_source=tc.get("asil_source", "estimated"),
        asil_confidence=tc.get("asil_confidence", 100),
        test_type=tc.get("test_type", "functional"),
        boundary_position=tc.get("boundary_position", ""),
        preconditions=tc.get("preconditions", []),
        steps=tc.get("steps", []),
        expected_results=tc.get("expected_results", []),
        source_requirement_text=tc.get("source_requirement_text", ""),
        generation_timestamp=tc.get("generation_timestamp", ""),
        model_version=tc.get("model_version", ""),
        prompt_version=tc.get("prompt_version", "v1"),
        retry_count=tc.get("retry_count", 0),
        validation_status=tc.get("validation_status", "valid"),
        coverage_warnings=tc.get("coverage_warnings", []),
        rag_sources=tc.get("rag_sources", []),
        rag_top_score=tc.get("rag_top_score", 0.0),
    )


def finalize_run(
    db: Session,
    job_id: str,
    test_cases: list[dict],
    rag_enabled: bool,
    *,
    outcome: str = "complete",
    reason: Optional[str] = None,
    error_count: int = 0,
    failed_requirement_count: int = 0,
    generation_duration: Optional[float] = None,
    fallback_used: bool = False,
    coverage: Optional[list[dict]] = None,
    requirement_status: Optional[list[dict]] = None,
) -> None:
    """Persist the terminal state of a run.

    ``outcome`` is one of ``complete`` / ``warning`` / ``failed`` (see
    ``generator.run_batch``). Whatever test cases were produced are persisted in
    every case — a ``warning`` run keeps its partial results, a ``failed`` run
    records the reason and the observability counts even with zero cases.

    ``coverage`` is the per-requirement coverage report list produced during
    generation (``[{requirement_index, requirement_id, warnings, ...}]``). It is
    snapshotted onto the requirement rows so the run's validation/traceability
    can be reopened later without re-running analysis.
    """
    run = db.query(Run).filter(Run.id == job_id).first()
    if not run:
        return

    # Coverage counts
    counts: dict[str, int] = {}
    for tc in test_cases:
        t = tc.get("test_type", "functional")
        counts[t] = counts.get(t, 0) + 1

    run.status = outcome
    run.error = reason
    run.completed_at = datetime.utcnow()
    run.test_case_count = len(test_cases)
    run.rag_enabled = rag_enabled
    run.failed_requirement_count = failed_requirement_count
    run.error_count = error_count
    run.generation_duration = generation_duration
    run.fallback_used = fallback_used
    run.functional_count = counts.get("functional", 0)
    run.boundary_count = counts.get("boundary", 0)
    run.negative_count = counts.get("negative", 0)
    run.fault_injection_count = counts.get("fault_injection", 0)
    run.timing_count = counts.get("timing", 0)
    run.recovery_count = counts.get("recovery", 0)
    run.safety_count = counts.get("safety", 0)

    for tc in test_cases:
        db.add(_build_tc_row(job_id, tc))

    # ── Per-requirement traceability + validation snapshot ────────
    _snapshot_requirement_coverage(
        db, job_id, test_cases, coverage or [], run, requirement_status or [],
    )

    # Update project.last_run_at
    project = db.query(Project).filter(Project.id == run.project_id).first()
    if project:
        project.last_run_at = datetime.utcnow()
        project.updated_at = datetime.utcnow()

    db.commit()


def _snapshot_requirement_coverage(
    db: Session,
    run_id: str,
    test_cases: list[dict],
    coverage: list[dict],
    run: Run,
    requirement_status: Optional[list[dict]] = None,
) -> None:
    """Write the coverage/validation + generation-status snapshot onto this run's
    requirement rows.

    Linkage is by ``source_requirement_text`` (the generator stamps each case
    with the exact requirement string it was generated from — unique per
    requirement within a run). Coverage warnings come from the generation-time
    validation report, keyed by requirement position. Computes ``run.coverage_pct``.

    ``requirement_status`` is the per-requirement generation outcome
    (``{requirement_index, generation_status, failure_type, failure_reason,
    last_attempt_at}``) so a failed requirement is recorded as *generation_failed*
    with its cause — kept distinct from coverage, which only describes test depth.
    """
    cov_by_pos: dict[int, dict] = {}
    for c in coverage:
        idx = c.get("requirement_index")
        if idx is not None:
            cov_by_pos[idx] = c

    status_by_pos: dict[int, dict] = {}
    for s in requirement_status or []:
        idx = s.get("requirement_index")
        if idx is not None:
            status_by_pos[idx] = s

    tc_by_text: dict[str, list] = {}
    for tc in test_cases:
        srt = tc.get("source_requirement_text") or ""
        if srt:
            tc_by_text.setdefault(srt, []).append(tc)

    reqs = (
        db.query(Requirement)
        .filter(Requirement.run_id == run_id)
        .order_by(Requirement.position)
        .all()
    )
    covered_count = 0
    for req in reqs:
        linked = tc_by_text.get(req.text, [])
        cov = cov_by_pos.get(req.position, {})
        warnings = cov.get("warnings", []) or []
        is_covered = len(linked) > 0
        if is_covered:
            covered_count += 1
        req.covered = is_covered
        req.test_case_count = len(linked)
        req.coverage_warnings = warnings
        if not is_covered:
            req.validation_status = "uncovered"
        elif warnings:
            req.validation_status = "warning"
        else:
            req.validation_status = "valid"

        # ── Generation outcome (separate from coverage) ───────────
        status = status_by_pos.get(req.position)
        if status:
            req.generation_status = status.get("generation_status") or (
                "generated" if is_covered else "generation_failed"
            )
            req.failure_type = status.get("failure_type")
            req.failure_reason = status.get("failure_reason")
            req.last_attempt_at = _parse_iso(status.get("last_attempt_at"))
        else:
            # No explicit status (e.g. legacy caller): infer from whether cases landed.
            req.generation_status = "generated" if is_covered else "generation_failed"
            if not is_covered and not req.failure_reason:
                req.failure_type = req.failure_type or "unknown"
        # A produced requirement is unambiguously generated, regardless of any stale
        # failure metadata from an earlier attempt.
        if is_covered:
            req.failure_type = None
            req.failure_reason = None

        # Backfill requirement_id from the generation report when create_run
        # could not extract one up front.
        if not req.requirement_id:
            rid = cov.get("requirement_id")
            if rid and rid != "REQ_UNKNOWN":
                req.requirement_id = rid

    run.coverage_pct = round((covered_count / len(reqs)) * 100, 1) if reqs else 0.0


def fail_run(db: Session, job_id: str, error: str) -> None:
    run = db.query(Run).filter(Run.id == job_id).first()
    if run:
        run.status = "error"
        run.completed_at = datetime.utcnow()
        run.error = error
        db.commit()


# ─────────────────────────────────────────────
# Durable jobs (Phase 2B): incremental persistence + finalize + snapshot
# ─────────────────────────────────────────────

def mark_requirement_in_progress(db: Session, run_id: str, position: int) -> None:
    """Flip a requirement to ``in_progress`` (and stamp started_at) as the worker
    begins it — the live state the in-memory model could never show."""
    req = (
        db.query(Requirement)
        .filter(Requirement.run_id == run_id, Requirement.position == position)
        .first()
    )
    if req:
        req.generation_status = "in_progress"
        if req.started_at is None:
            req.started_at = datetime.utcnow()
        db.commit()


def persist_requirement_result(
    db: Session,
    run_id: str,
    position: int,
    cases: list[dict],
    coverage: dict,
    gen_status: dict,
) -> None:
    """Persist ONE requirement's result in its own transaction (incremental).

    Idempotent: this requirement's existing test cases are cleared first, so a
    resume/re-drive cannot duplicate them (deterministic ids + the unique
    (run_id, test_id) index make the rewrite exact).
    """
    req = (
        db.query(Requirement)
        .filter(Requirement.run_id == run_id, Requirement.position == position)
        .first()
    )
    if not req:
        return

    # Clear any prior cases for this requirement (linkage by the exact, per-
    # requirement-unique source_requirement_text), then re-insert.
    db.query(TestCaseDB).filter(
        TestCaseDB.run_id == run_id,
        TestCaseDB.source_requirement_text == req.text,
    ).delete(synchronize_session=False)
    for tc in cases:
        db.add(_build_tc_row(run_id, tc))

    warnings = (coverage or {}).get("warnings", []) or []
    is_covered = len(cases) > 0
    req.covered = is_covered
    req.test_case_count = len(cases)
    req.coverage_warnings = warnings
    req.validation_status = (
        "uncovered" if not is_covered else ("warning" if warnings else "valid")
    )

    gs = gen_status or {}
    req.generation_status = gs.get("generation_status") or (
        "generated" if is_covered else "generation_failed"
    )
    req.failure_type = gs.get("failure_type")
    req.failure_reason = gs.get("failure_reason")
    req.last_attempt_at = _parse_iso(gs.get("last_attempt_at"))
    req.attempt_count = (req.attempt_count or 0) + 1
    if is_covered:
        req.failure_type = None
        req.failure_reason = None

    if not req.requirement_id:
        rid = (coverage or {}).get("requirement_id")
        if rid and rid != "REQ_UNKNOWN":
            req.requirement_id = rid

    db.commit()


def finalize_job(db: Session, run_id: str, generation_duration: Optional[float] = None) -> Optional[str]:
    """Compute the run-level artifact state from the already-persisted rows.

    Unlike ``finalize_run`` (the legacy single terminal write), this re-derives
    aggregates from the incrementally-persisted requirements/test cases, so it is
    correct after a resume. Returns the resolved outcome.
    """
    run = db.get(Run, run_id)
    if not run:
        return None
    reqs = get_requirements_for_run(db, run_id)
    tcs = get_test_cases_for_run(db, run_id)

    total = len(reqs)
    failed = sum(1 for r in reqs if r.generation_status == "generation_failed")
    covered = sum(1 for r in reqs if r.covered)

    counts: dict[str, int] = {}
    for tc in tcs:
        t = tc.test_type or "functional"
        counts[t] = counts.get(t, 0) + 1

    if total and failed >= total:
        outcome, reason = "failed", f"All {total} requirements failed generation"
    elif failed > 0:
        outcome, reason = "warning", f"{failed} of {total} requirements failed generation"
    else:
        outcome, reason = "complete", None

    run.status = outcome
    run.error = reason
    run.completed_at = datetime.utcnow()
    run.test_case_count = len(tcs)
    run.rag_enabled = any((tc.rag_sources or []) for tc in tcs)
    run.failed_requirement_count = failed
    run.error_count = sum(
        (r.attempt_count or 0) for r in reqs if r.generation_status == "generation_failed"
    )
    run.generation_duration = generation_duration
    run.functional_count = counts.get("functional", 0)
    run.boundary_count = counts.get("boundary", 0)
    run.negative_count = counts.get("negative", 0)
    run.fault_injection_count = counts.get("fault_injection", 0)
    run.timing_count = counts.get("timing", 0)
    run.recovery_count = counts.get("recovery", 0)
    run.safety_count = counts.get("safety", 0)
    run.coverage_pct = round((covered / total) * 100, 1) if total else 0.0

    project = db.query(Project).filter(Project.id == run.project_id).first()
    if project:
        project.last_run_at = datetime.utcnow()
        project.updated_at = datetime.utcnow()

    db.commit()
    return outcome


# Maps execution status → the SSE event shape the frontend already consumes.
_SSE_RUNNING = ("queued", "claimed", "running", "finalizing")


def get_job_snapshot(db: Session, run_id: str) -> Optional[dict]:
    """Build a full, reconnect-safe progress snapshot from the DB.

    Source of truth for both the SSE stream and ``GET /jobs/{id}`` — works across
    workers/instances and after restarts because it reads shared state, never an
    in-process dict.
    """
    from db_models import GenerationJob

    run = db.get(Run, run_id)
    job = db.get(GenerationJob, run_id)
    if not run and not job:
        return None

    tcs = get_test_cases_for_run(db, run_id)

    exec_status = job.status if job else (
        "complete" if (run and run.status in ("complete", "warning")) else "failed"
    )
    if exec_status in _SSE_RUNNING:
        sse_type, status = "progress", "running"
    elif exec_status == "complete":
        ok = run and run.status in ("complete", "warning")
        sse_type, status = ("complete", run.status) if ok else ("error", "error")
    elif exec_status == "cancelled":
        sse_type, status = "error", "cancelled"
    else:  # failed
        sse_type, status = "error", "error"

    current = job.progress_current if job else (run.requirement_count if run else 0)
    total = job.progress_total if job else (run.requirement_count if run else 0)
    message = (run.error if run else None) or (job.last_error if job else None)

    return {
        "job_id": run_id,
        "type": sse_type,
        "status": status,
        "current": current,
        "total": total,
        "test_cases": [tc_to_dict(tc) for tc in tcs],
        "rag_enabled": bool(run.rag_enabled) if run else False,
        "outcome": run.status if (run and sse_type in ("complete", "error")) else None,
        "reason": run.error if run else None,
        "error": message if sse_type == "error" else None,
        "message": message,
    }


def sweep_interrupted_runs(db: Session) -> int:
    """
    Mark any run left in status='running' from a prior server session as
    status='error'. These cannot be recovered after restart.
    Returns the number of runs swept.
    """
    stale = db.query(Run).filter(Run.status == "running").all()
    if not stale:
        return 0
    for run in stale:
        run.status = "error"
        run.error = "interrupted by server restart"
        run.completed_at = datetime.utcnow()
    db.commit()
    return len(stale)


def get_run(db: Session, run_id: str) -> Optional[Run]:
    return db.query(Run).filter(Run.id == run_id).first()


def get_runs_for_project(db: Session, project_id: str, limit: int = 50) -> list[Run]:
    return (
        db.query(Run)
        .filter(Run.project_id == project_id)
        .order_by(desc(Run.created_at))
        .limit(limit)
        .all()
    )


def get_project_stats(db: Session, project_id: str) -> dict:
    runs = db.query(Run).filter(Run.project_id == project_id).all()
    total_runs = len(runs)
    completed = [r for r in runs if r.status == "complete"]
    total_test_cases = sum(r.test_case_count for r in completed)
    total_requirements = sum(r.requirement_count for r in completed)
    return {
        "total_runs": total_runs,
        "completed_runs": len(completed),
        "total_test_cases": total_test_cases,
        "total_requirements": total_requirements,
    }


# ─────────────────────────────────────────────
# Test cases and requirements
# ─────────────────────────────────────────────

def get_test_cases_for_run(db: Session, run_id: str) -> list[TestCaseDB]:
    return db.query(TestCaseDB).filter(TestCaseDB.run_id == run_id).all()


def patch_test_case_review(
    db: Session,
    run_id: str,
    test_id: str,
    review_status: Optional[str] = None,
    review_note: Optional[str] = None,
    actor_id: Optional[str] = None,
    actor_display: Optional[str] = None,
) -> Optional[TestCaseDB]:
    """Update a test case's review state, scoped to its run.

    ``test_id`` (e.g. TC_001) restarts per run and is NOT globally unique, so the
    lookup MUST be scoped by ``run_id``. Every status change (and any note write)
    is recorded as an immutable :class:`ReviewEvent` with the *trusted* reviewer
    identity (from the session, not the request body).

    Raises :class:`RunLockedError` if the run has been approved/rejected and
    locked — governance forbids silently mutating a signed-off artifact.
    """
    from db_models import ReviewEvent

    run = db.query(Run).filter(Run.id == run_id).first()
    if run is not None and run.locked:
        raise RunLockedError(f"Run {run_id} is locked ({run.review_state}); re-open it to make changes.")

    tc = (
        db.query(TestCaseDB)
        .filter(TestCaseDB.run_id == run_id, TestCaseDB.test_id == test_id)
        .first()
    )
    if not tc:
        return None

    display = actor_display or "Operator"
    old_status = tc.review_status or "pending"
    status_changed = review_status is not None and review_status != old_status
    note_changed = review_note is not None and (review_note or "") != (tc.review_note or "")

    if review_status is not None:
        tc.review_status = review_status  # type: ignore[assignment]
    if review_note is not None:
        tc.review_note = review_note  # type: ignore[assignment]
    tc.reviewed_at = datetime.utcnow().isoformat()  # type: ignore[assignment]

    # Audit trail: log the transition (status change, or a note-only edit).
    if status_changed or note_changed:
        db.add(ReviewEvent(
            id=str(uuid.uuid4()),
            run_id=run_id,
            test_case_id=tc.id,
            test_id=tc.test_id,
            from_status=old_status,
            to_status=(review_status if review_status is not None else old_status),
            note=review_note if note_changed else None,
            actor=display,                # legacy display alias
            actor_id=actor_id,
            actor_display=display,
            created_at=datetime.utcnow(),
        ))

    db.commit()
    # Keep the run-level governance state in sync (draft ⇄ reviewed).
    _recompute_review_state(db, run_id)
    db.refresh(tc)
    return tc


def get_review_events(db: Session, run_id: str, test_id: Optional[str] = None) -> list:
    """Return review audit events for a run (optionally one test case), newest first."""
    from db_models import ReviewEvent

    q = db.query(ReviewEvent).filter(ReviewEvent.run_id == run_id)
    if test_id:
        q = q.filter(ReviewEvent.test_id == test_id)
    return q.order_by(desc(ReviewEvent.created_at)).all()


def review_event_to_dict(ev) -> dict:
    return {
        "id": ev.id,
        "run_id": ev.run_id,
        "test_case_id": ev.test_case_id,
        "test_id": ev.test_id,
        "from_status": ev.from_status,
        "to_status": ev.to_status,
        "note": ev.note,
        "actor": ev.actor,
        "actor_id": getattr(ev, "actor_id", None),
        "actor_display": getattr(ev, "actor_display", None) or ev.actor,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
    }


def get_run_review_summary(db: Session, run_id: str) -> dict:
    """Aggregate review status counts for a run, reconstructed from persisted data."""
    tcs = get_test_cases_for_run(db, run_id)
    summary = {"pending": 0, "approved": 0, "rejected": 0, "needs_revision": 0}
    latest: Optional[str] = None
    for tc in tcs:
        st = (tc.review_status or "pending")
        summary[st] = summary.get(st, 0) + 1
        if tc.reviewed_at and (latest is None or tc.reviewed_at > latest):
            latest = tc.reviewed_at
    total = len(tcs)
    reviewed = total - summary["pending"]
    return {
        "run_id": run_id,
        "total": total,
        "reviewed": reviewed,
        "pending": summary["pending"],
        "approved": summary["approved"],
        "rejected": summary["rejected"],
        "needs_revision": summary["needs_revision"],
        "review_complete": total > 0 and summary["pending"] == 0,
        "approved_pct": round((summary["approved"] / total) * 100, 1) if total else 0.0,
        "last_reviewed_at": latest,
    }


# ─────────────────────────────────────────────
# Run-level review governance (Phase 3)
# ─────────────────────────────────────────────

# Run-level governance states.
REVIEW_DRAFT = "draft"
REVIEW_REVIEWED = "reviewed"
REVIEW_APPROVED = "approved"
REVIEW_REJECTED = "rejected"


def run_content_digest(test_cases: list[dict]) -> str:
    """Stable SHA-256 over the substantive content of a run's test cases.

    Binds a sign-off to exactly what was approved: if any case's content or
    review status later changes, the recomputed digest differs and the approval
    is detectably stale.
    """
    canonical = sorted(
        (
            {
                "test_id": tc.get("test_id", ""),
                "requirement_id": tc.get("requirement_id", ""),
                "title": tc.get("title", ""),
                "asil": tc.get("asil", ""),
                "test_type": tc.get("test_type", ""),
                "preconditions": tc.get("preconditions", []),
                "steps": tc.get("steps", []),
                "expected_results": tc.get("expected_results", []),
                "review_status": tc.get("review_status", "pending"),
            }
            for tc in test_cases
        ),
        key=lambda d: d["test_id"],
    )
    blob = json.dumps(canonical, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def _current_digest(db: Session, run_id: str) -> str:
    return run_content_digest([tc_to_dict(tc) for tc in get_test_cases_for_run(db, run_id)])


def _recompute_review_state(db: Session, run_id: str) -> None:
    """Keep ``runs.review_state`` in sync with per-case review while a run is not
    signed off. Approved/rejected are terminal (and locked), so they are never
    overwritten here."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run or run.review_state in (REVIEW_APPROVED, REVIEW_REJECTED):
        return
    summary = get_run_review_summary(db, run_id)
    run.review_state = REVIEW_REVIEWED if summary["review_complete"] else REVIEW_DRAFT
    db.commit()


def _log_approval_event(
    db: Session, run_id: str, from_state: str, to_state: str,
    actor_id: Optional[str], actor_display: str, note: Optional[str],
    summary: dict, digest: Optional[str],
) -> None:
    from db_models import RunApprovalEvent

    db.add(RunApprovalEvent(
        id=str(uuid.uuid4()),
        run_id=run_id,
        from_state=from_state,
        to_state=to_state,
        actor_id=actor_id,
        actor_display=actor_display,
        note=note,
        approved_count=summary.get("approved", 0),
        total_count=summary.get("total", 0),
        coverage_pct=summary.get("approved_pct", 0.0),
        test_cases_digest=digest,
        created_at=datetime.utcnow(),
    ))


def approve_run(
    db: Session, run_id: str, actor_id: Optional[str], actor_display: str, note: Optional[str] = None,
) -> dict:
    """Sign off a run as approved (locks it). Requires every case approved."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return {"error": "run not found"}
    summary = get_run_review_summary(db, run_id)
    if summary["total"] == 0:
        return {"error": "Run has no test cases to approve."}
    if summary["pending"] > 0:
        return {"error": f"Cannot approve: {summary['pending']} case(s) still pending review."}
    not_approved = summary["total"] - summary["approved"]
    if not_approved > 0:
        return {"error": f"Cannot approve: {not_approved} case(s) are not approved (rejected/needs changes)."}

    digest = _current_digest(db, run_id)
    from_state = run.review_state
    run.review_state = REVIEW_APPROVED
    run.locked = True
    run.approved_by_id = actor_id
    run.approved_by_display = actor_display
    run.approved_at = datetime.utcnow()
    run.review_digest = digest
    _log_approval_event(db, run_id, from_state, REVIEW_APPROVED, actor_id, actor_display, note, summary, digest)
    db.commit()
    return get_run_governance(db, run_id)


def reject_run(
    db: Session, run_id: str, actor_id: Optional[str], actor_display: str, note: Optional[str] = None,
) -> dict:
    """Sign off a run as rejected (locks it; re-openable). Requires review complete."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return {"error": "run not found"}
    summary = get_run_review_summary(db, run_id)
    if summary["total"] == 0:
        return {"error": "Run has no test cases to reject."}
    if summary["pending"] > 0:
        return {"error": f"Cannot reject: {summary['pending']} case(s) still pending review."}

    digest = _current_digest(db, run_id)
    from_state = run.review_state
    run.review_state = REVIEW_REJECTED
    run.locked = True
    run.approved_by_id = actor_id
    run.approved_by_display = actor_display
    run.approved_at = datetime.utcnow()
    run.review_digest = digest
    _log_approval_event(db, run_id, from_state, REVIEW_REJECTED, actor_id, actor_display, note, summary, digest)
    db.commit()
    return get_run_governance(db, run_id)


def reopen_run(
    db: Session, run_id: str, actor_id: Optional[str], actor_display: str, note: Optional[str] = None,
) -> dict:
    """Re-open a signed-off run for changes (unlocks it). Logged as a transition."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return {"error": "run not found"}
    if run.review_state not in (REVIEW_APPROVED, REVIEW_REJECTED):
        return {"error": "Only an approved or rejected run can be re-opened."}

    from_state = run.review_state
    summary = get_run_review_summary(db, run_id)
    run.locked = False
    run.approved_by_id = None
    run.approved_by_display = None
    run.approved_at = None
    run.review_digest = None
    run.review_state = REVIEW_REVIEWED if summary["review_complete"] else REVIEW_DRAFT
    _log_approval_event(db, run_id, from_state, run.review_state, actor_id, actor_display, note, summary, None)
    db.commit()
    return get_run_governance(db, run_id)


def get_run_governance(db: Session, run_id: str) -> dict:
    """Current governance state + staleness check for a run."""
    run = db.query(Run).filter(Run.id == run_id).first()
    if not run:
        return {"error": "run not found"}
    summary = get_run_review_summary(db, run_id)
    state = run.review_state or REVIEW_DRAFT
    stale = False
    if state == REVIEW_APPROVED and run.review_digest:
        stale = run.review_digest != _current_digest(db, run_id)
    # Phase 4: requirement-version drift (approval invalidation), modulated by
    # change_class — editorial-only drift does not supersede.
    from services import lifecycle
    supersede = lifecycle.run_supersede_info(db, run_id)
    return {
        "run_id": run_id,
        "review_state": state,
        "locked": bool(run.locked),
        "approved_by_id": run.approved_by_id,
        "approved_by_display": run.approved_by_display,
        "approved_at": run.approved_at.isoformat() if run.approved_at else None,
        "review_digest": run.review_digest,
        "stale": stale,  # approved content changed since sign-off
        "requirement_superseded": supersede["superseded"],
        "supersede_severity": supersede["supersede_severity"],
        "requirement_drift": supersede["drift"],
        "summary": summary,
    }


def list_run_approval_events(db: Session, run_id: str) -> list:
    from db_models import RunApprovalEvent

    return (
        db.query(RunApprovalEvent)
        .filter(RunApprovalEvent.run_id == run_id)
        .order_by(desc(RunApprovalEvent.created_at))
        .all()
    )


def run_approval_event_to_dict(ev) -> dict:
    return {
        "id": ev.id,
        "run_id": ev.run_id,
        "from_state": ev.from_state,
        "to_state": ev.to_state,
        "actor_id": ev.actor_id,
        "actor_display": ev.actor_display,
        "note": ev.note,
        "approved_count": ev.approved_count,
        "total_count": ev.total_count,
        "coverage_pct": ev.coverage_pct,
        "test_cases_digest": ev.test_cases_digest,
        "created_at": ev.created_at.isoformat() if ev.created_at else None,
    }


def get_requirements_for_run(db: Session, run_id: str) -> list[Requirement]:
    return (
        db.query(Requirement)
        .filter(Requirement.run_id == run_id)
        .order_by(Requirement.position)
        .all()
    )


def _generation_status_of(req: Requirement) -> str:
    """Resolve a requirement's generation status, inferring for legacy rows.

    New runs persist ``generation_status`` directly. Rows written before this
    feature have it ``None``: we infer ``generated`` when cases landed and
    ``not_generated`` otherwise (never a false ``generation_failed``, since old
    data carries no failure provenance to justify that claim)."""
    stored = getattr(req, "generation_status", None)
    if stored:
        return stored
    return "generated" if (req.test_case_count or 0) > 0 else "not_generated"


def requirement_to_dict(req: Requirement) -> dict:
    """Serialise a requirement with its persisted coverage/validation snapshot."""
    return {
        "id": req.id,
        "run_id": req.run_id,
        "requirement_id": req.requirement_id or "REQ_UNKNOWN",
        "text": req.text,
        "statement": _statement_of(req),
        "position": req.position,
        "covered": req.covered,
        "test_case_count": req.test_case_count or 0,
        "validation_status": req.validation_status,
        "coverage_warnings": req.coverage_warnings or [],
        # Generation outcome (distinct from coverage)
        "generation_status": _generation_status_of(req),
        "failure_type": req.failure_type,
        "failure_reason": req.failure_reason,
        "last_attempt_at": req.last_attempt_at.isoformat() if req.last_attempt_at else None,
    }


def requirement_to_dict_versioned(db: Session, req: Requirement) -> dict:
    """Run requirement serialised with its Phase 4 version context."""
    from services import lifecycle

    d = requirement_to_dict(req)
    d.update(lifecycle.requirement_row_version_info(db, req))
    return d


def build_run_traceability(db: Session, run_id: str) -> dict:
    """Reconstruct the requirement→test-case matrix for a run from persisted data.

    Works for historical runs (linkage is recomputed from the run's own immutable
    test cases) and uses the persisted validation snapshot when present. Linkage
    is by ``source_requirement_text`` first (exact, unique per requirement) and
    falls back to ``requirement_id`` for older data.
    """
    reqs = get_requirements_for_run(db, run_id)
    tcs = get_test_cases_for_run(db, run_id)

    by_text: dict[str, list] = {}
    by_rid: dict[str, list] = {}
    for tc in tcs:
        if tc.source_requirement_text:
            by_text.setdefault(tc.source_requirement_text, []).append(tc)
        rid = (tc.requirement_id or "").strip().upper()
        if rid and rid != "REQ_UNKNOWN":
            by_rid.setdefault(rid, []).append(tc)

    rows: list[dict] = []
    covered = 0
    for req in reqs:
        linked = by_text.get(req.text)
        if not linked:
            rid = (req.requirement_id or "").strip().upper()
            linked = by_rid.get(rid, []) if rid and rid != "REQ_UNKNOWN" else []
        is_covered = len(linked) > 0
        if is_covered:
            covered += 1
        # Use the persisted snapshot when available, else derive on the fly.
        warnings = req.coverage_warnings if req.coverage_warnings is not None else []
        status = req.validation_status or (
            "uncovered" if not is_covered else ("warning" if warnings else "valid")
        )
        rows.append({
            **requirement_to_dict(req),
            "covered": is_covered,
            "test_case_count": len(linked),
            "validation_status": status,
            "coverage_warnings": warnings,
            "linked_test_ids": [tc.test_id for tc in linked],
            "linked_test_cases": [tc_to_dict(tc) for tc in linked],
        })

    total = len(reqs)
    return {
        "run_id": run_id,
        "total": total,
        "covered": covered,
        "uncovered": total - covered,
        "coverage_pct": round((covered / total) * 100, 1) if total else 0.0,
        "requirements": rows,
    }


def build_run_validation(db: Session, run_id: str) -> dict:
    """Persisted validation summary for a run (no re-analysis).

    Aggregates the per-requirement snapshot and the per-test-case validation
    status that were captured at generation time.
    """
    trace = build_run_traceability(db, run_id)
    tcs = get_test_cases_for_run(db, run_id)

    req_summary = {"valid": 0, "warning": 0, "uncovered": 0}
    total_req_warnings = 0
    for r in trace["requirements"]:
        st = r["validation_status"]
        req_summary[st] = req_summary.get(st, 0) + 1
        total_req_warnings += len(r["coverage_warnings"])

    tc_summary = {"valid": 0, "warning": 0}
    for tc in tcs:
        st = (tc.validation_status or "valid").lower()
        tc_summary[st] = tc_summary.get(st, 0) + 1

    return {
        "run_id": run_id,
        "total": trace["total"],
        "covered": trace["covered"],
        "uncovered": trace["uncovered"],
        "coverage_pct": trace["coverage_pct"],
        "requirement_summary": req_summary,
        "test_case_summary": tc_summary,
        "total_requirement_warnings": total_req_warnings,
        "requirements": [
            {
                "requirement_id": r["requirement_id"],
                "statement": r["statement"],
                "position": r["position"],
                "covered": r["covered"],
                "test_case_count": r["test_case_count"],
                "validation_status": r["validation_status"],
                "coverage_warnings": r["coverage_warnings"],
            }
            for r in trace["requirements"]
        ],
    }


# ─────────────────────────────────────────────
# Requirements Workspace (requirement-centric view)
# ─────────────────────────────────────────────

# Only runs that produced results contribute to the workspace; running/errored
# runs would otherwise mark requirements uncovered while generation is in flight.
_WORKSPACE_RUN_STATUSES = ("complete", "warning")


def _req_dedupe_key(req: Requirement) -> str:
    rid = (req.requirement_id or "").strip().upper()
    if rid and rid != "REQ_UNKNOWN":
        return rid
    return f"__row__{req.id}"


def _statement_of(req: Requirement) -> str:
    """Best human statement: the parsed statement, else the flattened text with
    the leading 'ID: ' prefix and any '[ASIL X]' tag removed."""
    meta = req.meta or {}
    stmt = (meta.get("statement") or "").strip()
    if stmt:
        return stmt
    txt = _ASIL_TAG_RE.sub("", req.text or "").strip()
    rid = (req.requirement_id or "").strip()
    if rid and txt.upper().startswith(rid.upper()):
        txt = txt[len(rid):].lstrip(" :")
    return txt


def _collect_project_requirements(db: Session, project_id: str):
    """Gather workspace inputs for a project.

    Returns ``(requirements_latest_first, test_cases_by_run_and_reqid)``. Only
    runs in ``_WORKSPACE_RUN_STATUSES`` are included. Requirements are ordered
    most-recent-run first so callers can keep the latest record per requirement.
    """
    runs = (
        db.query(Run)
        .filter(Run.project_id == project_id, Run.status.in_(_WORKSPACE_RUN_STATUSES))
        .order_by(desc(Run.created_at))
        .all()
    )
    run_ids = [r.id for r in runs]
    run_order = {rid: idx for idx, rid in enumerate(run_ids)}  # 0 == latest
    if not run_ids:
        return [], {}

    reqs = db.query(Requirement).filter(Requirement.run_id.in_(run_ids)).all()
    reqs.sort(key=lambda r: (run_order.get(r.run_id, 1 << 30), r.position))

    tcs = db.query(TestCaseDB).filter(TestCaseDB.run_id.in_(run_ids)).all()
    by_run: dict[tuple, list] = {}
    for tc in tcs:
        key = (tc.run_id, (tc.requirement_id or "").strip().upper())
        by_run.setdefault(key, []).append(tc)
    return reqs, by_run


def _linked_cases(req: Requirement, by_run: dict) -> list:
    """Test cases generated for this requirement within its own run.

    Linkage is by requirement_id. REQ_UNKNOWN cannot be disambiguated when a run
    has several unidentified requirements, so it is treated as unlinked."""
    rid = (req.requirement_id or "").strip().upper()
    if not rid or rid == "REQ_UNKNOWN":
        return []
    return by_run.get((req.run_id, rid), [])


def requirement_overview_dict(req: Requirement, by_run: dict) -> dict:
    meta = req.meta or {}
    asil_info = asil_resolver.resolve_asil(_statement_of(req), parsed_asil=meta.get("asil"))
    linked = _linked_cases(req, by_run)
    present_types = {(tc.test_type or "functional") for tc in linked}
    quality = meta.get("quality") or {}
    return {
        "key": _req_dedupe_key(req),
        "row_id": req.id,
        "run_id": req.run_id,
        "requirement_id": req.requirement_id or "REQ_UNKNOWN",
        "statement": _statement_of(req),
        "asil": asil_info["asil"],
        "asil_source": asil_info["asil_source"],
        "category": meta.get("category") or "uncategorized",
        "quality_score": quality.get("quality_score"),
        "quality_level": quality.get("quality_level"),
        "coverage_count": len(linked),
        "coverage_status": asil_resolver.coverage_status(asil_info["asil"], present_types, len(linked)),
        # Generation outcome — a separate axis from coverage. A failed requirement
        # surfaces as "Failed", never as a bare "Uncovered".
        "generation_status": _generation_status_of(req),
        "failure_type": req.failure_type,
        "failure_reason": req.failure_reason,
        "last_attempt_at": req.last_attempt_at.isoformat() if req.last_attempt_at else None,
        "has_metadata": bool(meta),
    }


def get_requirements_overview(db: Session, project_id: str) -> list[dict]:
    """Project requirements deduped by id (latest run wins), with coverage."""
    reqs, by_run = _collect_project_requirements(db, project_id)
    seen: set[str] = set()
    out: list[dict] = []
    for req in reqs:  # already latest-run-first
        key = _req_dedupe_key(req)
        if key in seen:
            continue
        seen.add(key)
        out.append(requirement_overview_dict(req, by_run))
    return out


def get_coverage_summary(db: Session, project_id: str) -> dict:
    overview = get_requirements_overview(db, project_id)
    total = len(overview)
    covered = sum(1 for r in overview if r["coverage_status"] == "covered")
    partial = sum(1 for r in overview if r["coverage_status"] == "partial")
    uncovered = sum(1 for r in overview if r["coverage_status"] == "uncovered")
    return {
        "total": total,
        "covered": covered,
        "partially_covered": partial,
        "uncovered": uncovered,
        "coverage_pct": round((covered / total) * 100) if total else 0,
    }


def get_requirement_detail(db: Session, project_id: str, key: str) -> Optional[dict]:
    """Full requirement intelligence for the drawer. ``key`` is a requirement_id
    or, for unidentified requirements, the requirement row id."""
    reqs, by_run = _collect_project_requirements(db, project_id)
    ukey = (key or "").strip().upper()
    target: Optional[Requirement] = None
    for req in reqs:  # latest-run-first
        rid = (req.requirement_id or "").strip().upper()
        if ukey not in ("", "REQ_UNKNOWN") and rid == ukey:
            target = req
            break
        if req.id == key:
            target = req
            break
    if target is None:
        return None

    meta = target.meta or {}
    asil_info = asil_resolver.resolve_asil(_statement_of(target), parsed_asil=meta.get("asil"))
    linked = _linked_cases(target, by_run)
    present_types = {(tc.test_type or "functional") for tc in linked}
    return {
        "requirement_id": target.requirement_id or "REQ_UNKNOWN",
        "row_id": target.id,
        "run_id": target.run_id,
        "statement": _statement_of(target),
        "title": meta.get("title"),
        "description": meta.get("description"),
        "area": meta.get("area"),
        "test_focus": meta.get("test_focus"),
        "category": meta.get("category") or "uncategorized",
        "asil": asil_info["asil"],
        "asil_source": asil_info["asil_source"],
        "asil_confidence": asil_info["asil_confidence"],
        "quality": meta.get("quality") or None,
        "thresholds": meta.get("thresholds") or [],
        "timing_constraints": meta.get("timing_constraints") or [],
        "entities": meta.get("entities") or [],
        "units": meta.get("units") or [],
        "logical_operators": meta.get("logical_operators") or [],
        "coverage_count": len(linked),
        "coverage_status": asil_resolver.coverage_status(asil_info["asil"], present_types, len(linked)),
        "generation_status": _generation_status_of(target),
        "failure_type": target.failure_type,
        "failure_reason": target.failure_reason,
        "last_attempt_at": target.last_attempt_at.isoformat() if target.last_attempt_at else None,
        "has_metadata": bool(meta),
        "linked_test_cases": [tc_to_dict(tc) for tc in linked],
    }


# ─────────────────────────────────────────────
# Serialisers
# ─────────────────────────────────────────────

def run_to_dict(run: Run) -> dict:
    return {
        "id": run.id,
        "project_id": run.project_id,
        "status": run.status,
        "provider": run.provider,
        "model": run.model,
        "requirement_count": run.requirement_count,
        "test_case_count": run.test_case_count,
        "rag_enabled": run.rag_enabled,
        "prompt_version": run.prompt_version,
        "created_at": run.created_at.isoformat() if run.created_at else None,
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
        "error": run.error,
        "reason": run.error,
        "failed_requirement_count": getattr(run, "failed_requirement_count", 0) or 0,
        "error_count": getattr(run, "error_count", 0) or 0,
        "generation_duration": getattr(run, "generation_duration", None),
        "fallback_used": bool(getattr(run, "fallback_used", False)),
        "coverage_pct": getattr(run, "coverage_pct", None),
        # Run-level review governance (Phase 3)
        "review_state": getattr(run, "review_state", None) or "draft",
        "locked": bool(getattr(run, "locked", False)),
        "approved_by_display": getattr(run, "approved_by_display", None),
        "approved_at": run.approved_at.isoformat() if getattr(run, "approved_at", None) else None,
        "functional_count": run.functional_count or 0,
        "boundary_count": run.boundary_count or 0,
        "negative_count": run.negative_count or 0,
        "fault_injection_count": run.fault_injection_count or 0,
        "timing_count": run.timing_count or 0,
        "recovery_count": run.recovery_count or 0,
        "safety_count": run.safety_count or 0,
    }


def project_to_dict(project: Project) -> dict:
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "last_run_at": project.last_run_at.isoformat() if project.last_run_at else None,
    }


def tc_to_dict(tc: TestCaseDB) -> dict:
    return {
        "id": tc.id,
        "run_id": tc.run_id,
        "test_id": tc.test_id or "",
        "requirement_id": tc.requirement_id or "",
        "title": tc.title,
        "asil": tc.asil or "QM",
        "asil_source": getattr(tc, "asil_source", None) or "estimated",
        "asil_confidence": getattr(tc, "asil_confidence", None) if getattr(tc, "asil_confidence", None) is not None else 100,
        "test_type": tc.test_type or "functional",
        "boundary_position": getattr(tc, "boundary_position", None) or "",
        "preconditions": tc.preconditions or [],
        "steps": tc.steps or [],
        "expected_results": tc.expected_results or [],
        "source_requirement_text": tc.source_requirement_text or "",
        "generation_timestamp": tc.generation_timestamp or "",
        "model_version": tc.model_version or "",
        "prompt_version": tc.prompt_version or "v1",
        "retry_count": tc.retry_count or 0,
        "validation_status": tc.validation_status or "valid",
        "coverage_warnings": getattr(tc, "coverage_warnings", None) or [],
        "rag_sources": tc.rag_sources or [],
        "rag_top_score": tc.rag_top_score or 0.0,
        "review_status": tc.review_status or "pending",
        "review_note": tc.review_note or "",
        "reviewed_at": tc.reviewed_at or None,
    }
