"""
FastAPI application entry point.

THIN LAYER PRINCIPLE:
main.py defines routes and delegates to services. No business logic here.

LIFESPAN:
1. Creates DB tables (create_all — idempotent, safe for SQLite and PostgreSQL).
2. Ensures the Default Project row exists.
3. Initialises the RAG pipeline.

JOB PERSISTENCE (dual-read strategy):
  Active jobs  → _jobs dict  (in-memory, drives SSE streaming)
  Completed jobs → DB        (durable, survives restarts)

  GET /jobs/{job_id} checks _jobs first, falls back to DB.
  After run_batch completes, _run_and_persist writes the result to DB.
"""

import asyncio
import json
import logging
import os
import shutil
import uuid
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import BackgroundTasks, FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from database import Base, SessionLocal, engine
import db_models  # noqa: F401 — registers all ORM tables with Base
from models import ExportRequest, GenerateRequest, ProviderKeyRequest, TextRequest
from parsing import parse_document, parse_text
from providers import get_provider_from_db
from prompts.manager import get_current_version
from services import exporter
from services.db_service import (
    DEFAULT_PROJECT_ID,
    complete_run,
    create_project,
    create_run,
    delete_project,
    ensure_default_project,
    ensure_review_columns,
    fail_run,
    get_project,
    get_project_stats,
    get_requirements_for_run,
    get_run,
    get_runs_for_project,
    get_test_cases_for_run,
    list_projects,
    patch_test_case_review,
    project_to_dict,
    run_to_dict,
    sweep_interrupted_runs,
    tc_to_dict,
    update_project,
)
from services.generator import run_batch
from services.rag import rag_enabled, rag_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 1. Database ──────────────────────────────────────────────
    from database import _safe_db_url
    logger.info("Connecting to database: %s", _safe_db_url())
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_default_project(db)
        ensure_review_columns(db)
        swept = sweep_interrupted_runs(db)
        if swept:
            logger.warning("Swept %d interrupted run(s) → status=error.", swept)
    finally:
        db.close()
    logger.info("Database ready.")

    # ── 2. RAG pipeline ──────────────────────────────────────────
    # Opt-out via RAG_ENABLED=false (e.g. Render free tier) so the heavy
    # chromadb/sentence-transformers/torch stack is never loaded. The pipeline
    # then degrades gracefully to deterministic, non-RAG generation.
    if rag_enabled():
        logger.info("Initializing RAG pipeline...")
        await rag_pipeline.initialize()
        logger.info("RAG pipeline ready. Server accepting requests.")
    else:
        logger.info("RAG disabled (RAG_ENABLED=false). Skipping pipeline init — server accepting requests.")

    yield
    logger.info("Server shutting down.")


app = FastAPI(
    title="AI Automotive Test Case Generator",
    version="2.0.0",
    description="Enterprise-grade ISO 26262 test case generation with RAG",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

_jobs: dict[str, dict] = {}

# Formats the multi-stage parsing pipeline can ingest deterministically.
ALLOWED_EXTENSIONS = (".pdf", ".docx", ".xlsx", ".xlsm", ".csv", ".txt", ".md", ".markdown")


def _resolve_llm_provider():
    """Resolve the BYOK provider for the parser's LLM fallback (Stage 8).

    Returns None when no provider is configured — the pipeline then stays fully
    deterministic instead of erroring.
    """
    db = SessionLocal()
    try:
        return get_provider_from_db(db)
    except Exception as exc:
        logger.warning("No LLM provider available for parser fallback: %s", exc)
        return None
    finally:
        db.close()


# ─────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────

@app.get("/health")
def health():
    from services import cache

    db = SessionLocal()
    try:
        active_prov = db.query(db_models.AppConfig).filter(db_models.AppConfig.key == "active_provider").first()
        provider_name = (active_prov.value if active_prov else None) or os.getenv("PROVIDER", "anthropic")
    except Exception:
        provider_name = os.getenv("PROVIDER", "anthropic")
    finally:
        db.close()

    rag_chunks = 0
    rag_status = "disabled"
    if rag_pipeline.is_ready:
        try:
            rag_chunks = rag_pipeline._store.count()
            rag_status = "ready" if rag_chunks > 0 else "ready_empty"
        except Exception as exc:
            rag_status = "degraded"
            logger.debug("Health: RAG store unavailable — %s", exc)

    return {
        "status": "ok",
        "timestamp": datetime.utcnow().isoformat(),
        "provider": provider_name.lower(),
        "rag_status": rag_status,
        "rag_ready": rag_pipeline.is_ready,
        "rag_indexed_chunks": rag_chunks,
        "cache_entries": cache.size(),
        "active_jobs": len(_jobs),
    }


# ─────────────────────────────────────────────
# Upload & parse
# ─────────────────────────────────────────────

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename.lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        return {"error": f"Unsupported type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}

    save_path = os.path.join(UPLOAD_FOLDER, file.filename)
    with open(save_path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    try:
        result = parse_document(
            save_path,
            filename=file.filename,
            provider=_resolve_llm_provider(),
        )
    except Exception as exc:
        logger.error("Extraction failed: %s", exc)
        return {"error": f"Extraction failed: {exc}"}

    requirements = result.as_strings()
    return {
        "filename": file.filename,
        # `requirements` stays a list[str] for backward compatibility.
        "requirements": requirements,
        "requirement_count": len(requirements),
        # Additive: rich multi-stage parse metadata.
        "document_type": result.document_type.value,
        "parser_used": result.parser_used,
        "confidence": result.confidence,
        "issues": result.issues,
        "parsed": [r.to_dict() for r in result.requirements],
    }


@app.post("/parse-text")
async def parse_text_endpoint(request: TextRequest):
    if not request.text or not request.text.strip():
        return {"error": "No text provided", "requirements": []}

    result = parse_text(request.text, provider=_resolve_llm_provider())
    requirements = result.as_strings()
    return {
        "filename": "Pasted Text",
        "extracted_text": request.text,
        "requirements": requirements,
        "requirement_count": len(requirements),
        "document_type": result.document_type.value,
        "parser_used": result.parser_used,
        "confidence": result.confidence,
        "issues": result.issues,
        "parsed": [r.to_dict() for r in result.requirements],
    }


# ─────────────────────────────────────────────
# Generation — async job + SSE streaming
# ─────────────────────────────────────────────

def _parsed_text_key(p: dict) -> str:
    """Reproduce ParsedRequirement.as_text() so structured parser records can be
    correlated to the flattened requirement strings generation receives."""
    stmt = (p.get("statement") or "").strip()
    rid = (p.get("requirement_id") or "").strip()
    return f"{rid}: {stmt}".strip() if rid else stmt


async def _run_and_persist(
    requirements: list[str], job_id: str, provider=None, parsed_meta: dict | None = None
) -> None:
    """
    Wraps run_batch with DB persistence.
    run_batch streams incremental progress into _jobs[job_id].
    After completion this function writes the final state to the DB.
    """
    await run_batch(requirements, job_id, _jobs, provider=provider, parsed_meta=parsed_meta)

    db = SessionLocal()
    try:
        job = _jobs.get(job_id, {})
        if job.get("status") == "complete":
            complete_run(db, job_id, job.get("test_cases", []), job.get("rag_enabled", False))
            logger.info("Job %s persisted (%d test cases).", job_id, len(job.get("test_cases", [])))
        else:
            fail_run(db, job_id, job.get("error") or "Generation failed")
            logger.warning("Job %s persisted as failed.", job_id)
    except Exception as exc:
        logger.error("DB persistence failed for job %s: %s", job_id, exc)
        try:
            fail_run(db, job_id, f"Persistence error: {exc}")
        except Exception:
            pass
    finally:
        db.close()


@app.post("/generate")
async def generate(request: GenerateRequest, background_tasks: BackgroundTasks):
    if not request.requirements:
        return {"error": "No requirements provided"}

    project_id = request.project_id or DEFAULT_PROJECT_ID
    job_id = str(uuid.uuid4())

    # Resolve provider from DB settings (BYOK), fall back to env vars
    from providers import get_provider_from_db, get_provider
    db = SessionLocal()
    try:
        try:
            provider_instance = get_provider_from_db(db)
        except Exception:
            provider_instance = get_provider()

        provider_name = provider_instance.model_name  # reuse after assignment
        model_name = provider_instance.model_name

        # Extract the actual provider label (class name prefix) for the Run record
        provider_label = type(provider_instance).__name__.replace("Provider", "").lower()

        create_run(
            db,
            job_id=job_id,
            project_id=project_id,
            requirements=request.requirements,
            provider=provider_label,
            model=model_name,
            prompt_version=get_current_version(),
        )
    finally:
        db.close()

    # Seed in-memory job state (SSE consumers read this while running)
    _jobs[job_id] = {
        "job_id": job_id,
        "status": "running",
        "current": 0,
        "total": len(request.requirements),
        "test_cases": [],
        "rag_enabled": rag_pipeline.is_ready,
        "error": None,
    }

    # Correlate optional structured parser metadata to the requirement strings.
    # Keyed by the flattened "id: statement" text so reordering/editing/omission
    # on the client all degrade gracefully to the legacy string-only path.
    parsed_meta = None
    if request.parsed:
        parsed_meta = {}
        for p in request.parsed:
            key = _parsed_text_key(p)
            if key:
                parsed_meta[key] = p

    background_tasks.add_task(
        _run_and_persist, request.requirements, job_id, provider_instance, parsed_meta
    )
    return {"job_id": job_id, "total": len(request.requirements)}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    # Active job — serve directly from memory
    if job_id in _jobs:
        return _jobs[job_id]

    # Completed / historical job — read from DB
    db = SessionLocal()
    try:
        run = get_run(db, job_id)
        if not run:
            return {"error": f"Job {job_id} not found"}
        test_cases = get_test_cases_for_run(db, job_id)
        return {
            "job_id": run.id,
            "status": run.status,
            "current": run.requirement_count,
            "total": run.requirement_count,
            "test_cases": [tc_to_dict(tc) for tc in test_cases],
            "rag_enabled": run.rag_enabled,
            "error": run.error,
        }
    finally:
        db.close()


@app.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str):
    """SSE endpoint — streams job progress every 400ms."""
    async def event_gen():
        while True:
            job = _jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Job not found'})}\n\n"
                return

            payload = {
                "type": "progress" if job["status"] == "running" else job["status"],
                "current": job["current"],
                "total": job["total"],
                "test_cases": job["test_cases"],
                "rag_enabled": job.get("rag_enabled", False),
            }
            yield f"data: {json.dumps(payload)}\n\n"

            if job["status"] in ("complete", "error"):
                return
            await asyncio.sleep(0.4)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─────────────────────────────────────────────
# Projects
# ─────────────────────────────────────────────

@app.get("/projects")
def list_projects_route():
    db = SessionLocal()
    try:
        return [project_to_dict(p) for p in list_projects(db)]
    finally:
        db.close()


@app.post("/projects")
async def create_project_route(body: dict):
    name = (body.get("name") or "").strip()
    if not name:
        return {"error": "name is required"}
    db = SessionLocal()
    try:
        project = create_project(db, name=name, description=(body.get("description") or "").strip())
        return project_to_dict(project)
    finally:
        db.close()


@app.patch("/projects/{project_id}")
async def update_project_route(project_id: str, body: dict):
    db = SessionLocal()
    try:
        name = body.get("name")
        description = body.get("description")
        project = update_project(db, project_id, name=name, description=description)
        if not project:
            return {"error": f"Project {project_id} not found"}
        return project_to_dict(project)
    finally:
        db.close()


@app.delete("/projects/{project_id}")
def delete_project_route(project_id: str):
    if project_id == DEFAULT_PROJECT_ID:
        return {"error": "Cannot delete the default project"}
    db = SessionLocal()
    try:
        ok = delete_project(db, project_id)
        return {"ok": ok}
    finally:
        db.close()


@app.get("/projects/{project_id}")
def get_project_route(project_id: str):
    db = SessionLocal()
    try:
        project = get_project(db, project_id)
        if not project:
            return {"error": f"Project {project_id} not found"}
        return project_to_dict(project)
    finally:
        db.close()


@app.get("/projects/{project_id}/runs")
def get_project_runs(project_id: str, limit: int = 50):
    db = SessionLocal()
    try:
        return [run_to_dict(r) for r in get_runs_for_project(db, project_id, limit=limit)]
    finally:
        db.close()


@app.get("/projects/{project_id}/stats")
def get_project_stats_route(project_id: str):
    db = SessionLocal()
    try:
        return get_project_stats(db, project_id)
    finally:
        db.close()


# ─────────────────────────────────────────────
# Runs
# ─────────────────────────────────────────────

@app.get("/runs/{run_id}")
def get_run_route(run_id: str):
    db = SessionLocal()
    try:
        run = get_run(db, run_id)
        if not run:
            return {"error": f"Run {run_id} not found"}
        return run_to_dict(run)
    finally:
        db.close()


@app.get("/runs/{run_id}/test-cases")
def get_run_test_cases(run_id: str):
    db = SessionLocal()
    try:
        return [tc_to_dict(tc) for tc in get_test_cases_for_run(db, run_id)]
    finally:
        db.close()


@app.patch("/test-cases/{test_id}/review")
def patch_test_case_review_route(test_id: str, body: dict):
    db = SessionLocal()
    try:
        tc = patch_test_case_review(
            db,
            test_id=test_id,
            review_status=body.get("review_status"),
            review_note=body.get("review_note"),
        )
        if not tc:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Test case not found")
        return tc_to_dict(tc)
    finally:
        db.close()


@app.get("/runs/{run_id}/requirements")
def get_run_requirements(run_id: str):
    db = SessionLocal()
    try:
        reqs = get_requirements_for_run(db, run_id)
        return [{"id": r.id, "text": r.text, "position": r.position} for r in reqs]
    finally:
        db.close()


# ─────────────────────────────────────────────
# Exports
# ─────────────────────────────────────────────

@app.post("/export/excel")
async def export_excel_route(request: ExportRequest):
    try:
        data = exporter.export_excel(
            [tc.model_dump() for tc in request.test_cases],
            project_name=request.project_name,
        )
    except RuntimeError as exc:
        return {"error": str(exc)}

    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{request.project_name}_{timestamp}.xlsx"
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/export/csv")
async def export_csv_route(request: ExportRequest):
    csv_str = exporter.export_jira_csv([tc.model_dump() for tc in request.test_cases])
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"{request.project_name}_{timestamp}_jira.csv"
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─────────────────────────────────────────────
# Cache management
# ─────────────────────────────────────────────

@app.get("/cache/stats")
def cache_stats():
    from services import cache
    rag_chunks = 0
    try:
        if rag_pipeline.is_ready:
            rag_chunks = rag_pipeline._store.count()
    except Exception:
        pass
    return {"cached_entries": cache.size(), "rag_chunks": rag_chunks}


@app.delete("/cache")
def clear_cache():
    from services import cache
    cache.clear()
    return {"cleared": True}


# ─────────────────────────────────────────────
# Provider key management (BYOK)
# ─────────────────────────────────────────────

@app.get("/providers/active")
def get_active_provider():
    """Returns the currently active provider/model configuration."""
    db = SessionLocal()
    try:
        active_prov = db.query(db_models.AppConfig).filter(db_models.AppConfig.key == "active_provider").first()
        active_model = db.query(db_models.AppConfig).filter(db_models.AppConfig.key == "active_model").first()

        provider_name = (active_prov.value if active_prov else None) or os.getenv("PROVIDER", "anthropic")
        model = (active_model.value if active_model else None) or "claude-sonnet-4-6"

        pk = db.query(db_models.ProviderKey).filter(db_models.ProviderKey.provider == provider_name).first()

        # Provider-specific env var fallbacks (optional defaults, not required)
        _provider_env_keys = {
            "anthropic": "ANTHROPIC_API_KEY",
            "openai": "OPENAI_API_KEY",
            "gemini": "GOOGLE_API_KEY",
            "groq": "GROQ_API_KEY",
        }
        env_var = _provider_env_keys.get(provider_name, "")
        has_key = bool(pk and pk.api_key) or bool(env_var and os.getenv(env_var))

        return {"provider": provider_name, "model": model, "has_key": has_key}
    finally:
        db.close()


@app.get("/providers/keys")
def list_provider_keys():
    db = SessionLocal()
    try:
        keys = db.query(db_models.ProviderKey).all()
        return [{"provider": k.provider, "has_key": bool(k.api_key), "endpoint": k.endpoint} for k in keys]
    finally:
        db.close()


@app.post("/providers/keys")
def save_provider_key(request: ProviderKeyRequest):
    if not request.provider or not request.provider.strip():
        return {"error": "provider is required"}
    db = SessionLocal()
    try:
        existing = db.query(db_models.ProviderKey).filter(
            db_models.ProviderKey.provider == request.provider
        ).first()
        if existing:
            if request.api_key is not None:
                existing.api_key = request.api_key
            if request.endpoint is not None:
                existing.endpoint = request.endpoint
            existing.updated_at = datetime.utcnow()
        else:
            key = db_models.ProviderKey(
                provider=request.provider,
                api_key=request.api_key,
                endpoint=request.endpoint,
            )
            db.add(key)

        # Persist selected provider + model as the active configuration
        def _upsert_config(k: str, v: str) -> None:
            row = db.query(db_models.AppConfig).filter(db_models.AppConfig.key == k).first()
            if row:
                row.value = v
                row.updated_at = datetime.utcnow()
            else:
                db.add(db_models.AppConfig(key=k, value=v))

        _upsert_config("active_provider", request.provider)
        if request.model:
            _upsert_config("active_model", request.model)

        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/providers/keys/{provider}")
def delete_provider_key(provider: str):
    db = SessionLocal()
    try:
        db.query(db_models.ProviderKey).filter(
            db_models.ProviderKey.provider == provider
        ).delete()
        db.commit()
        return {"ok": True}
    finally:
        db.close()
