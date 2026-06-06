"""
CRUD operations for Projects, Runs, Requirements, and TestCases.

Dual-read contract:
  Active jobs  → main._jobs  (in-memory, fast)
  Completed jobs → this module (DB, durable)

All functions accept a SQLAlchemy Session and are synchronous.
The FastAPI routes call them from a regular (non-async) context or
from a background async wrapper that creates its own session.
"""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import desc
from sqlalchemy.orm import Session

from db_models import Project, Requirement, Run, TestCaseDB

DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_PROJECT_NAME = "Default Project"


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


def create_project(db: Session, name: str, description: str = "") -> Project:
    project = Project(
        id=str(uuid.uuid4()),
        name=name,
        description=description,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


# ─────────────────────────────────────────────
# Runs
# ─────────────────────────────────────────────

def create_run(
    db: Session,
    job_id: str,
    project_id: str,
    requirements: list[str],
    provider: str,
    model: str,
    prompt_version: str,
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

    for i, text in enumerate(requirements):
        db.add(Requirement(
            id=str(uuid.uuid4()),
            run_id=job_id,
            text=text,
            position=i,
        ))

    db.commit()
    return run


def complete_run(
    db: Session,
    job_id: str,
    test_cases: list[dict],
    rag_enabled: bool,
) -> None:
    run = db.query(Run).filter(Run.id == job_id).first()
    if not run:
        return

    # Coverage counts
    counts: dict[str, int] = {}
    for tc in test_cases:
        t = tc.get("test_type", "functional")
        counts[t] = counts.get(t, 0) + 1

    run.status = "complete"
    run.completed_at = datetime.utcnow()
    run.test_case_count = len(test_cases)
    run.rag_enabled = rag_enabled
    run.functional_count = counts.get("functional", 0)
    run.boundary_count = counts.get("boundary", 0)
    run.negative_count = counts.get("negative", 0)
    run.fault_injection_count = counts.get("fault_injection", 0)
    run.timing_count = counts.get("timing", 0)
    run.recovery_count = counts.get("recovery", 0)
    run.safety_count = counts.get("safety", 0)

    for tc in test_cases:
        db.add(TestCaseDB(
            id=str(uuid.uuid4()),
            run_id=job_id,
            test_id=tc.get("test_id", ""),
            requirement_id=tc.get("requirement_id", ""),
            title=tc.get("title", ""),
            asil=tc.get("asil", "QM"),
            test_type=tc.get("test_type", "functional"),
            preconditions=tc.get("preconditions", []),
            steps=tc.get("steps", []),
            expected_results=tc.get("expected_results", []),
            source_requirement_text=tc.get("source_requirement_text", ""),
            generation_timestamp=tc.get("generation_timestamp", ""),
            model_version=tc.get("model_version", ""),
            prompt_version=tc.get("prompt_version", "v1"),
            retry_count=tc.get("retry_count", 0),
            validation_status=tc.get("validation_status", "valid"),
            rag_sources=tc.get("rag_sources", []),
            rag_top_score=tc.get("rag_top_score", 0.0),
        ))

    # Update project.last_run_at
    project = db.query(Project).filter(Project.id == run.project_id).first()
    if project:
        project.last_run_at = datetime.utcnow()
        project.updated_at = datetime.utcnow()

    db.commit()


def fail_run(db: Session, job_id: str, error: str) -> None:
    run = db.query(Run).filter(Run.id == job_id).first()
    if run:
        run.status = "error"
        run.completed_at = datetime.utcnow()
        run.error = error
        db.commit()


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


def get_requirements_for_run(db: Session, run_id: str) -> list[Requirement]:
    return (
        db.query(Requirement)
        .filter(Requirement.run_id == run_id)
        .order_by(Requirement.position)
        .all()
    )


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
        "test_id": tc.test_id or "",
        "requirement_id": tc.requirement_id or "",
        "title": tc.title,
        "asil": tc.asil or "QM",
        "test_type": tc.test_type or "functional",
        "preconditions": tc.preconditions or [],
        "steps": tc.steps or [],
        "expected_results": tc.expected_results or [],
        "source_requirement_text": tc.source_requirement_text or "",
        "generation_timestamp": tc.generation_timestamp or "",
        "model_version": tc.model_version or "",
        "prompt_version": tc.prompt_version or "v1",
        "retry_count": tc.retry_count or 0,
        "validation_status": tc.validation_status or "valid",
        "rag_sources": tc.rag_sources or [],
        "rag_top_score": tc.rag_top_score or 0.0,
    }
