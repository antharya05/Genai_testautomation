"""
FastAPI application entry point.

THIN LAYER PRINCIPLE:
main.py defines routes and delegates to services. No business logic here.

LIFESPAN:
1. Seeds data only — ensures the Default Project row exists and encrypts any
   legacy plaintext provider keys. Schema is owned by Alembic and applied as a
   release-phase ``alembic upgrade head`` before the server starts (see
   render.yaml); the app performs no DDL at boot.
2. Initialises the RAG pipeline.

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

from fastapi import Depends, FastAPI, File, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

from auth import actor_from_token, router as auth_router, validate_token
from database import SessionLocal
import db_models  # noqa: F401 — registers all ORM tables with Base
from models import ExportRequest, GenerateRequest, ProviderKeyRequest, TextRequest
from parsing import parse_document, parse_text
from providers import ProviderError, provider_manager
from prompts.manager import get_current_version
from services import exporter
from services.secrets import encrypt_secret
from services.db_service import (
    DEFAULT_PROJECT_ID,
    RunLockedError,
    approve_run,
    build_run_traceability,
    build_run_validation,
    create_project,
    create_run,
    ensure_encrypted_provider_keys,
    delete_project,
    ensure_default_project,
    get_coverage_summary,
    get_job_snapshot,
    get_project,
    get_project_stats,
    get_requirement_detail,
    get_requirements_for_run,
    get_requirements_overview,
    get_review_events,
    get_run,
    get_run_governance,
    get_run_review_summary,
    get_runs_for_project,
    get_test_cases_for_run,
    list_projects,
    list_run_approval_events,
    patch_test_case_review,
    reject_run,
    reopen_run,
    review_event_to_dict,
    project_to_dict,
    requirement_to_dict,
    requirement_to_dict_versioned,
    run_approval_event_to_dict,
    run_to_dict,
    tc_to_dict,
    update_project,
)
from services import jobs as job_queue
from services import lifecycle
from auth.principal import (
    Principal,
    authorize_baseline,
    authorize_org,
    authorize_project,
    authorize_run,
    current_principal,
    visible_to,
)
from auth.roles import P_MANAGE_KEYS, P_READ, P_REVIEW, P_WRITE_PROJECT
from services.rag import rag_enabled, rag_pipeline

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 0. Config validation (fail closed in production) ─────────
    import config
    config.validate_config()

    # ── 1. Database ──────────────────────────────────────────────
    # Schema is owned by Alembic and applied as a release-phase step
    # (``alembic upgrade head`` runs before the server starts — see render.yaml).
    # The app no longer evolves the schema at boot: no create_all, no ad-hoc
    # ``ensure_*_columns`` ALTER TABLE shims. Only data seeding / data migrations
    # remain here.
    from database import _safe_db_url
    logger.info("Connecting to database: %s", _safe_db_url())
    db = SessionLocal()
    try:
        ensure_default_project(db)
        migrated = ensure_encrypted_provider_keys(db)
        if migrated:
            logger.info("Encrypted %d legacy plaintext provider key(s) at rest.", migrated)
        # Phase 4: catalogue legacy per-run requirements into the version chain.
        from services import lifecycle
        linked = lifecycle.backfill_requirement_catalog(db)
        if linked:
            logger.info("Backfilled %d legacy requirement row(s) into the catalog.", linked)
        # Phase 4.5: attach pre-multi-tenant projects/keys to a Default Organization.
        from services import identity
        assigned = identity.backfill_default_org(db)
        if assigned:
            logger.info("Assigned %d project(s) to the Default Organization.", assigned)
        # Interrupted runs are NOT blanket-errored here anymore — the durable-job
        # worker's lease-based reaper recovers them (requeue or fail), so an API
        # restart while a worker is mid-run no longer destroys live work.
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

# CORS — restrict to explicitly allowed origins. Set ALLOWED_ORIGINS to a
# comma-separated list of frontend origins in production (e.g.
# "https://app.example.com"). Defaults to local dev origins.
_default_origins = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", _default_origins).split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Security headers (Phase 5) ────────────────────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    # API is JSON/attachments only — lock the CSP right down.
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    import config as _cfg
    if _cfg.is_production():
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/auth/"):
        response.headers["Cache-Control"] = "no-store"
    return response


# ── Authentication gate (single-tenant) ──────────────────────────────────────
# Every route requires a valid bearer token except the public ones below. The
# token comes from POST /auth/login (Authorization: Bearer …, or ?token= for the
# SSE EventSource which cannot set headers). Preflight OPTIONS is always allowed
# so CORS keeps working.
_PUBLIC_PATHS = {
    "/health", "/auth/login", "/auth/providers", "/docs", "/redoc", "/openapi.json",
    # Email/password identity (Phase 4.6) — reachable before a session exists.
    "/auth/register", "/auth/login/email",
    "/auth/password/forgot", "/auth/password/reset",
    "/auth/verify-email", "/auth/verify-email/request",
}
# OAuth start/callback are public (the user isn't authenticated yet).
_PUBLIC_PREFIXES = ("/auth/oauth/",)


def _request_token(request: Request) -> str | None:
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.query_params.get("token")


def _is_authenticated(token: str | None) -> bool:
    """Accept a legacy password token (during transition) or a live DB session."""
    from auth.security import decode_token
    data = decode_token(token)
    if data is None:
        return False
    if data.get("typ") == "session":
        from services import identity
        db = SessionLocal()
        try:
            return identity.resolve_session(db, data.get("sid", "")) is not None
        finally:
            db.close()
    # Legacy shared-password token.
    import config as _cfg
    return _cfg.LEGACY_PASSWORD_AUTH


@app.middleware("http")
async def auth_gate(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or path in _PUBLIC_PATHS or path.startswith(_PUBLIC_PREFIXES):
        return await call_next(request)
    if not _is_authenticated(_request_token(request)):
        return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    return await call_next(request)


app.include_router(auth_router)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Formats the multi-stage parsing pipeline can ingest deterministically.
ALLOWED_EXTENSIONS = (".pdf", ".docx", ".xlsx", ".xlsm", ".csv", ".txt", ".md", ".markdown")


def _resolve_llm_provider(org_id: str | None = None):
    """Resolve the BYOK provider for the parser's LLM fallback (Stage 8), scoped
    to the caller's organization.

    Returns None when no provider is configured — the pipeline then stays fully
    deterministic instead of erroring.
    """
    db = SessionLocal()
    try:
        return provider_manager.try_get_active_provider(db, org_id)
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
        "active_jobs": _active_job_count(),
    }


def _active_job_count() -> int:
    """Number of jobs currently queued or running (durable, DB-backed)."""
    db = SessionLocal()
    try:
        return (
            db.query(db_models.GenerationJob)
            .filter(db_models.GenerationJob.status.in_(("queued", "claimed", "running", "finalizing")))
            .count()
        )
    except Exception:
        return 0
    finally:
        db.close()


# ─────────────────────────────────────────────
# Upload & parse
# ─────────────────────────────────────────────

# Magic-byte signatures for the binary formats we accept (content validation,
# not extension-trust). zip-backed = docx/xlsx/xlsm.
_MAGIC = {".pdf": (b"%PDF",), ".docx": (b"PK\x03\x04",),
          ".xlsx": (b"PK\x03\x04",), ".xlsm": (b"PK\x03\x04",)}
_TEXT_EXTS = {".csv", ".txt", ".md", ".markdown"}


def _save_upload_limited(file: UploadFile, dest: str, max_bytes: int) -> int:
    """Stream an upload to ``dest`` enforcing a hard size cap. Raises ValueError
    if the cap is exceeded. Returns bytes written."""
    written = 0
    with open(dest, "wb") as buf:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            written += len(chunk)
            if written > max_bytes:
                buf.close()
                raise ValueError("file too large")
            buf.write(chunk)
    return written


def _content_ok(ext: str, head: bytes) -> bool:
    sigs = _MAGIC.get(ext)
    if sigs is None:
        return ext in _TEXT_EXTS  # text formats: no binary signature to check
    return any(head.startswith(s) for s in sigs)


@app.post("/upload")
async def upload_file(file: UploadFile = File(...), principal: Principal = Depends(current_principal)):
    import config

    # Extension allowlist (content is verified below — never trusted by name).
    ext = os.path.splitext((file.filename or "").lower())[1]
    if ext not in ALLOWED_EXTENSIONS:
        return {"error": f"Unsupported type '{ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}

    # Never use the client filename for the path — generate a server-side name so
    # "../", absolute paths and NUL bytes can't escape the upload dir.
    display_name = os.path.basename(file.filename or "upload")[:255]
    save_path = os.path.join(UPLOAD_FOLDER, f"{uuid.uuid4().hex}{ext}")

    try:
        size = _save_upload_limited(file, save_path, config.MAX_UPLOAD_BYTES)
        if size == 0:
            return {"error": "Empty file."}
        with open(save_path, "rb") as fh:
            head = fh.read(8)
        if not _content_ok(ext, head):
            return {"error": "File content does not match its extension."}

        result = parse_document(save_path, filename=display_name,
                                provider=_resolve_llm_provider(principal.active_org_id))
    except ValueError:
        return {"error": f"File exceeds the {config.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit."}
    except Exception as exc:
        logger.error("Extraction failed for %s: %s", display_name, exc)
        return {"error": "Could not extract requirements from this document."}
    finally:
        # Uploads are transient — never accumulate them on disk.
        try:
            os.remove(save_path)
        except OSError:
            pass

    requirements = result.as_strings()[:config.MAX_REQUIREMENTS]
    parsed = [r.to_dict() for r in result.requirements][:config.MAX_REQUIREMENTS]
    return {
        "filename": display_name,
        "requirements": requirements,
        "requirement_count": len(requirements),
        "document_type": result.document_type.value,
        "parser_used": result.parser_used,
        "confidence": result.confidence,
        "issues": result.issues,
        "parsed": parsed,
    }


@app.post("/parse-text")
async def parse_text_endpoint(request: TextRequest, principal: Principal = Depends(current_principal)):
    import config

    if not request.text or not request.text.strip():
        return {"error": "No text provided", "requirements": []}
    if len(request.text) > config.MAX_UPLOAD_BYTES:
        return {"error": "Text is too large.", "requirements": []}

    result = parse_text(request.text, provider=_resolve_llm_provider(principal.active_org_id))
    requirements = result.as_strings()[:config.MAX_REQUIREMENTS]
    return {
        "filename": "Pasted Text",
        "extracted_text": request.text,
        "requirements": requirements,
        "requirement_count": len(requirements),
        "document_type": result.document_type.value,
        "parser_used": result.parser_used,
        "confidence": result.confidence,
        "issues": result.issues,
        "parsed": [r.to_dict() for r in result.requirements][:config.MAX_REQUIREMENTS],
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


@app.post("/generate")
async def generate(request: GenerateRequest, http_request: Request,
                  principal: Principal = Depends(current_principal)):
    """Create a durable generation job and enqueue it.

    Generation runs in a separate worker process (see worker.py), not here — the
    API only validates BYOK, persists the run + requirement rows, and enqueues.
    """
    if not request.requirements:
        return {"error": "No requirements provided"}

    project_id = request.project_id or DEFAULT_PROJECT_ID
    job_id = str(uuid.uuid4())

    parsed_meta = None
    if request.parsed:
        parsed_meta = {}
        for p in request.parsed:
            key = _parsed_text_key(p)
            if key:
                parsed_meta[key] = p

    db = SessionLocal()
    try:
        # Tenancy: caller must be able to write this project; BYOK is resolved
        # from the project's OWNING organization.
        authorize_project(db, principal, project_id, P_WRITE_PROJECT)
        project = get_project(db, project_id)
        org_id = project.organization_id if project else None
        try:
            provider_instance = provider_manager.get_active_provider(db, org_id=org_id)
        except ProviderError as exc:
            logger.warning("Generation rejected — %s", exc)
            return {
                "error": exc.message,
                "error_type": exc.error_type.value,
                "provider": exc.provider,
            }

        create_run(
            db,
            job_id=job_id,
            project_id=project_id,
            requirements=request.requirements,
            provider=provider_instance.provider_id,
            model=provider_instance.model_name,
            prompt_version=get_current_version(),
            parsed_meta=parsed_meta,
            author_id=principal.actor_id,
            author_display=principal.actor_display,
        )
        job_queue.enqueue(db, job_id, total=len(request.requirements))
    finally:
        db.close()

    return {"job_id": job_id, "total": len(request.requirements)}


@app.get("/jobs/{job_id}")
def get_job(job_id: str, principal: Principal = Depends(current_principal)):
    """Current job/run snapshot, read from the DB (source of truth)."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, job_id, P_READ)
        snapshot = get_job_snapshot(db, job_id)
        if snapshot is None:
            return {"error": f"Job {job_id} not found"}
        return snapshot
    finally:
        db.close()


@app.post("/jobs/{job_id}/cancel")
def cancel_job(job_id: str, principal: Principal = Depends(current_principal)):
    """Request cooperative cancellation of a job (partial results are retained)."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, job_id, P_WRITE_PROJECT)
        ok = job_queue.request_cancel(db, job_id)
        return {"ok": ok, "cancel_requested": ok}
    finally:
        db.close()


@app.get("/jobs/{job_id}/stream")
async def stream_job(job_id: str, principal: Principal = Depends(current_principal)):
    """SSE endpoint — streams DB-backed job snapshots.

    Each message is a full snapshot read from shared state, so the stream is
    correct across workers/instances and survives reconnects with no replay.
    """
    db0 = SessionLocal()
    try:
        authorize_run(db0, principal, job_id, P_READ)
    finally:
        db0.close()

    async def event_gen():
        while True:
            db = SessionLocal()
            try:
                snapshot = get_job_snapshot(db, job_id)
            finally:
                db.close()

            if snapshot is None:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Job not found'})}\n\n"
                return

            yield f"data: {json.dumps(snapshot)}\n\n"
            if snapshot["type"] in ("complete", "error"):
                return
            await asyncio.sleep(0.8)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─────────────────────────────────────────────
# Projects
# ─────────────────────────────────────────────

@app.get("/projects")
def list_projects_route(principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        # Tenancy: only projects in the caller's active org (legacy sees all).
        return [project_to_dict(p) for p in list_projects(db)
                if visible_to(principal, p.organization_id)]
    finally:
        db.close()


@app.post("/projects")
async def create_project_route(body: dict, principal: Principal = Depends(current_principal)):
    name = (body.get("name") or "").strip()
    if not name:
        return {"error": "name is required"}
    if not principal.can(P_WRITE_PROJECT):
        return JSONResponse({"detail": "Insufficient permissions"}, status_code=403)
    db = SessionLocal()
    try:
        project = create_project(
            db, name=name, description=(body.get("description") or "").strip(),
            organization_id=principal.active_org_id, created_by_user_id=principal.user_id,
        )
        return project_to_dict(project)
    finally:
        db.close()


@app.patch("/projects/{project_id}")
async def update_project_route(project_id: str, body: dict, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_WRITE_PROJECT)
        name = body.get("name")
        description = body.get("description")
        project = update_project(db, project_id, name=name, description=description)
        if not project:
            return {"error": f"Project {project_id} not found"}
        return project_to_dict(project)
    finally:
        db.close()


@app.delete("/projects/{project_id}")
def delete_project_route(project_id: str, principal: Principal = Depends(current_principal)):
    if project_id == DEFAULT_PROJECT_ID:
        return {"error": "Cannot delete the default project"}
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_WRITE_PROJECT)
        ok = delete_project(db, project_id)
        return {"ok": ok}
    finally:
        db.close()


@app.get("/projects/{project_id}")
def get_project_route(project_id: str, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        project = get_project(db, project_id)
        return project_to_dict(project)
    finally:
        db.close()


@app.get("/projects/{project_id}/runs")
def get_project_runs(project_id: str, limit: int = 50, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        return [run_to_dict(r) for r in get_runs_for_project(db, project_id, limit=limit)]
    finally:
        db.close()


@app.get("/projects/{project_id}/stats")
def get_project_stats_route(project_id: str, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        return get_project_stats(db, project_id)
    finally:
        db.close()


# ─────────────────────────────────────────────
# Requirements Workspace (requirement-centric view)
# ─────────────────────────────────────────────

@app.get("/projects/{project_id}/requirements")
def get_project_requirements_route(project_id: str, principal: Principal = Depends(current_principal)):
    """Requirement-centric overview: one row per requirement (deduped across the
    project's runs, latest wins) with ASIL, quality score, category and coverage."""
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        return get_requirements_overview(db, project_id)
    finally:
        db.close()


@app.get("/projects/{project_id}/coverage")
def get_project_coverage_route(project_id: str, principal: Principal = Depends(current_principal)):
    """Coverage summary cards: total / covered / partially covered / uncovered / %."""
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        return get_coverage_summary(db, project_id)
    finally:
        db.close()


@app.get("/projects/{project_id}/requirements/{requirement_key}")
def get_requirement_detail_route(project_id: str, requirement_key: str, principal: Principal = Depends(current_principal)):
    """Full requirement intelligence for the detail drawer: quality analysis,
    thresholds, timing constraints, entities, and linked test cases."""
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        detail = get_requirement_detail(db, project_id, requirement_key)
        if not detail:
            return {"error": f"Requirement '{requirement_key}' not found in project {project_id}"}
        return detail
    finally:
        db.close()


# ─────────────────────────────────────────────
# Requirements lifecycle: catalog, versions, baselines (Phase 4)
# ─────────────────────────────────────────────

@app.get("/projects/{project_id}/catalog")
def list_catalog_route(project_id: str, principal: Principal = Depends(current_principal)):
    """Canonical requirements with their current version."""
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        return lifecycle.list_catalog(db, project_id)
    finally:
        db.close()


@app.get("/projects/{project_id}/catalog/{requirement_key}")
def get_catalog_detail_route(project_id: str, requirement_key: str, principal: Principal = Depends(current_principal)):
    """Requirement detail: full version timeline + change history."""
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        detail = lifecycle.get_catalog_detail(db, project_id, requirement_key)
        if not detail:
            return {"error": f"Requirement '{requirement_key}' not found in catalog."}
        return detail
    finally:
        db.close()


@app.post("/projects/{project_id}/catalog/{requirement_key}/revise")
def revise_requirement_route(project_id: str, requirement_key: str, body: dict, request: Request,
                            principal: Principal = Depends(current_principal)):
    """Create a new immutable requirement version (with change classification) and
    return it plus the computed impact."""
    statement = (body.get("statement") or "").strip()
    if not statement:
        return {"error": "statement is required"}
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_WRITE_PROJECT)
        return lifecycle.revise_requirement(
            db, project_id, requirement_key, statement, body.get("meta"),
            change_reason=(body.get("change_reason") or "").strip() or None,
            change_class=body.get("change_class"),
            actor_id=principal.actor_id, actor_display=principal.actor_display,
        )
    finally:
        db.close()


@app.get("/projects/{project_id}/baselines")
def list_baselines_route(project_id: str, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        return lifecycle.list_baselines(db, project_id)
    finally:
        db.close()


@app.post("/projects/{project_id}/baselines")
def create_baseline_route(project_id: str, body: dict, request: Request,
                         principal: Principal = Depends(current_principal)):
    """Cut an immutable baseline snapshot of the project's current requirement
    versions + their approved/latest test cases."""
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_REVIEW)
        return lifecycle.create_baseline(
            db, project_id, (body.get("name") or "").strip(), (body.get("note") or "").strip() or None,
            principal.actor_id, principal.actor_display,
        )
    finally:
        db.close()


@app.get("/projects/{project_id}/baselines/diff")
def diff_baselines_route(project_id: str, a: str, b: str, principal: Principal = Depends(current_principal)):
    """Diff two baselines: added / removed / modified requirements."""
    db = SessionLocal()
    try:
        authorize_project(db, principal, project_id, P_READ)
        authorize_baseline(db, principal, a, P_READ)
        authorize_baseline(db, principal, b, P_READ)
        return lifecycle.diff_baselines(db, a, b)
    finally:
        db.close()


@app.get("/baselines/{baseline_id}")
def get_baseline_route(baseline_id: str, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_baseline(db, principal, baseline_id, P_READ)
        detail = lifecycle.get_baseline_detail(db, baseline_id)
        if not detail:
            return {"error": f"Baseline {baseline_id} not found"}
        return detail
    finally:
        db.close()


@app.get("/baselines/{baseline_id}/export/excel")
def export_baseline_excel(baseline_id: str, principal: Principal = Depends(current_principal)):
    """Export a baseline as a self-contained Excel artifact (from its snapshot)."""
    db = SessionLocal()
    try:
        authorize_baseline(db, principal, baseline_id, P_READ)
        detail = lifecycle.get_baseline_detail(db, baseline_id)
        if not detail:
            return {"error": f"Baseline {baseline_id} not found"}
        cases = [tc for item in detail["items"] for tc in item.get("test_cases", [])]
        manifest = {
            "run_id": baseline_id, "project_name": f"Baseline {detail['name']}",
            "review_state": "baseline", "locked": True,
            "approved_by_display": detail.get("created_by_display"),
            "approved_at": detail.get("created_at"), "review_digest": detail.get("content_digest"),
            "stale": False,
            "summary": {"approved": detail.get("approved_count", 0), "total": detail.get("requirement_count", 0)},
        }
        try:
            data = exporter.export_excel(cases, project_name=f"Baseline_{detail['name']}", manifest=manifest)
        except RuntimeError as exc:
            return {"error": str(exc)}
        filename = f"baseline_{detail['name'].replace(' ', '_')}.xlsx"
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    finally:
        db.close()


# ─────────────────────────────────────────────
# Runs
# ─────────────────────────────────────────────

@app.get("/runs/{run_id}")
def get_run_route(run_id: str, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        return run_to_dict(get_run(db, run_id))
    finally:
        db.close()


@app.get("/runs/{run_id}/test-cases")
def get_run_test_cases(run_id: str, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        return [tc_to_dict(tc) for tc in get_test_cases_for_run(db, run_id)]
    finally:
        db.close()


@app.patch("/runs/{run_id}/test-cases/{test_id}/review")
def patch_test_case_review_route(run_id: str, test_id: str, body: dict, request: Request,
                                principal: Principal = Depends(current_principal)):
    """Update a test case's review state, scoped to its run.

    Run-scoped because ``test_id`` (TC_001…) is only unique *within* a run. The
    reviewer is the authenticated session principal (not the request body), so the
    audit trail is trustworthy. Writes to a locked run are rejected with 409.
    """
    from fastapi import HTTPException

    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_REVIEW)
        try:
            tc = patch_test_case_review(
                db, run_id=run_id, test_id=test_id,
                review_status=body.get("review_status"),
                review_note=body.get("review_note"),
                actor_id=principal.actor_id, actor_display=principal.actor_display,
            )
        except RunLockedError as exc:
            raise HTTPException(status_code=409, detail=str(exc))
        if not tc:
            raise HTTPException(status_code=404, detail="Test case not found in this run")
        return tc_to_dict(tc)
    finally:
        db.close()


@app.get("/runs/{run_id}/governance")
def get_run_governance_route(run_id: str, principal: Principal = Depends(current_principal)):
    """Current run-level review governance state (+ staleness)."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        return get_run_governance(db, run_id)
    finally:
        db.close()


def _governance_action(run_id: str, body: dict, principal: Principal, fn):
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_REVIEW)
        return fn(db, run_id, principal.actor_id, principal.actor_display, (body or {}).get("note"))
    finally:
        db.close()


@app.post("/runs/{run_id}/approve")
def approve_run_route(run_id: str, body: dict, principal: Principal = Depends(current_principal)):
    """Sign off a run as approved (locks it). Requires every case approved."""
    return _governance_action(run_id, body, principal, approve_run)


@app.post("/runs/{run_id}/reject")
def reject_run_route(run_id: str, body: dict, principal: Principal = Depends(current_principal)):
    """Sign off a run as rejected (locks it; re-openable)."""
    return _governance_action(run_id, body, principal, reject_run)


@app.post("/runs/{run_id}/reopen")
def reopen_run_route(run_id: str, body: dict, principal: Principal = Depends(current_principal)):
    """Re-open a signed-off run for changes (unlocks it)."""
    return _governance_action(run_id, body, principal, reopen_run)


@app.get("/runs/{run_id}/approval/events")
def get_run_approval_events_route(run_id: str, principal: Principal = Depends(current_principal)):
    """Immutable run-level governance ledger (newest first)."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        events = list_run_approval_events(db, run_id)
        return {"events": [run_approval_event_to_dict(e) for e in events]}
    finally:
        db.close()


@app.get("/runs/{run_id}/review/summary")
def get_run_review_summary_route(run_id: str, principal: Principal = Depends(current_principal)):
    """Aggregate review status counts for a run (for run artifacts/overview)."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        return get_run_review_summary(db, run_id)
    finally:
        db.close()


@app.get("/runs/{run_id}/review/events")
def get_run_review_events_route(run_id: str, test_id: str | None = None,
                               principal: Principal = Depends(current_principal)):
    """Immutable review audit trail for a run (optionally one test case)."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        events = get_review_events(db, run_id, test_id=test_id)
        return {"events": [review_event_to_dict(e) for e in events]}
    finally:
        db.close()


@app.get("/runs/{run_id}/requirements")
def get_run_requirements(run_id: str, principal: Principal = Depends(current_principal)):
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        reqs = get_requirements_for_run(db, run_id)
        return [requirement_to_dict_versioned(db, r) for r in reqs]
    finally:
        db.close()


@app.get("/runs/{run_id}/traceability")
def get_run_traceability(run_id: str, principal: Principal = Depends(current_principal)):
    """Requirement→test-case matrix + coverage % for a run, reconstructed from
    persisted data (works for historical runs, no regeneration)."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        return build_run_traceability(db, run_id)
    finally:
        db.close()


@app.get("/runs/{run_id}/validation")
def get_run_validation(run_id: str, principal: Principal = Depends(current_principal)):
    """Persisted validation summary for a run (valid/warning/uncovered + messages).
    Does not re-run validation."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        return build_run_validation(db, run_id)
    finally:
        db.close()


def _run_export_filename(db, run_id: str, ext: str, suffix: str = "") -> tuple[str, str]:
    """Return (project_name, filename) for a run export."""
    run = get_run(db, run_id)
    project = get_project(db, run.project_id) if run else None
    base = (project.name if project else "automotive_project").replace(" ", "_")
    stamp = (run.created_at.strftime("%Y%m%d_%H%M%S") if run and run.created_at
             else datetime.utcnow().strftime("%Y%m%d_%H%M%S"))
    return base, f"{base}_run_{run_id[:8]}{suffix}_{stamp}.{ext}"


def _reviewer_by_test_id(db, run_id: str) -> dict[str, str]:
    """Map test_id → latest reviewer display, from the immutable review events."""
    out: dict[str, str] = {}
    for ev in get_review_events(db, run_id):  # newest first
        if ev.test_id and ev.test_id not in out:
            out[ev.test_id] = (ev.actor_display or ev.actor or "")
    return out


def _run_export_cases(db, run_id: str, status: str | None) -> list[dict]:
    """Persisted test cases for a run, optionally filtered by review status, each
    enriched with the latest reviewer (for the export's Reviewer column)."""
    cases = [tc_to_dict(tc) for tc in get_test_cases_for_run(db, run_id)]
    reviewers = _reviewer_by_test_id(db, run_id)
    for c in cases:
        c["reviewer"] = reviewers.get(c.get("test_id", ""), "")
    if status:
        wanted = status.strip().lower()
        cases = [c for c in cases if (c.get("review_status") or "pending").lower() == wanted]
    return cases


def _export_manifest(db, run_id: str, project_name: str) -> dict:
    """Governance provenance embedded into an exported artifact."""
    gov = get_run_governance(db, run_id)
    return {
        "run_id": run_id,
        "project_name": project_name,
        "review_state": gov.get("review_state"),
        "locked": gov.get("locked"),
        "approved_by_display": gov.get("approved_by_display"),
        "approved_at": gov.get("approved_at"),
        "review_digest": gov.get("review_digest"),
        "stale": gov.get("stale"),
        "summary": gov.get("summary", {}),
    }


def _approved_export_guard(db, run_id: str, status: str | None) -> dict | None:
    """Governance gate: the approved-only artifact requires a signed-off run."""
    if status and status.strip().lower() == "approved":
        gov = get_run_governance(db, run_id)
        if gov.get("review_state") != "approved":
            return {"error": "Run is not approved. Sign off the run before exporting the approved artifact."}
        if gov.get("stale"):
            return {"error": "Approved content changed since sign-off. Re-open and re-approve before exporting."}
    return None


@app.get("/runs/{run_id}/export/excel")
def export_run_excel(run_id: str, status: str | None = None,
                    principal: Principal = Depends(current_principal)):
    """Export a historical run to Excel, reconstructed from persisted test cases.

    ``status`` optionally filters by review status. ``status=approved`` is gated
    on a signed-off (and non-stale) run and embeds an Approval Manifest sheet.
    """
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        guard = _approved_export_guard(db, run_id, status)
        if guard:
            return guard
        test_cases = _run_export_cases(db, run_id, status)
        suffix = f"_{status.lower()}" if status else ""
        project_name, filename = _run_export_filename(db, run_id, "xlsx", suffix)
        manifest = _export_manifest(db, run_id, project_name) if status else None
        try:
            data = exporter.export_excel(test_cases, project_name=project_name, manifest=manifest)
        except RuntimeError as exc:
            return {"error": str(exc)}
        return Response(
            content=data,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    finally:
        db.close()


@app.get("/runs/{run_id}/export/csv")
def export_run_csv(run_id: str, status: str | None = None,
                  principal: Principal = Depends(current_principal)):
    """Export a historical run to JIRA/Xray CSV, reconstructed from persisted data.

    ``status=approved`` is gated on a signed-off run and prepends a provenance
    manifest header."""
    db = SessionLocal()
    try:
        authorize_run(db, principal, run_id, P_READ)
        guard = _approved_export_guard(db, run_id, status)
        if guard:
            return guard
        test_cases = _run_export_cases(db, run_id, status)
        suffix = f"_{status.lower()}" if status else ""
        project_name, filename = _run_export_filename(db, run_id, "csv", suffix)
        manifest = _export_manifest(db, run_id, project_name) if status else None
        csv_str = exporter.export_jira_csv(test_cases, manifest=manifest)
        return Response(
            content=csv_str,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
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
def get_active_provider(principal: Principal = Depends(current_principal)):
    """The active provider/model for the caller's organization (strict BYOK)."""
    org_id = principal.active_org_id
    db = SessionLocal()
    try:
        provider_name, model = provider_manager.get_active_config(db, org_id)
        pk = db.query(db_models.ProviderKey).filter(
            db_models.ProviderKey.provider == provider_name,
            db_models.ProviderKey.organization_id == org_id,
        ).first()
        if provider_name in provider_manager.ENDPOINT_PROVIDERS:
            has_key = bool(pk and pk.endpoint)
        else:
            has_key = bool(pk and pk.api_key)
        return {"provider": provider_name, "model": model, "has_key": has_key}
    finally:
        db.close()


@app.get("/providers/health")
def providers_health(principal: Principal = Depends(current_principal)):
    """Live health/quota status for every registered provider (caller's org)."""
    db = SessionLocal()
    try:
        return {"providers": provider_manager.health_check_all(db, principal.active_org_id)}
    finally:
        db.close()


@app.get("/providers/health/{provider}")
def provider_health(provider: str, principal: Principal = Depends(current_principal)):
    """Live health status for a single provider (caller's org)."""
    db = SessionLocal()
    try:
        return provider_manager.health_check(db, provider, principal.active_org_id)
    finally:
        db.close()


@app.get("/providers/metrics")
def providers_metrics(principal: Principal = Depends(current_principal)):
    """In-process usage metrics (requests/failures/tokens/latency) per provider."""
    return {"metrics": provider_manager.get_metrics()}


@app.get("/providers/keys")
def list_provider_keys(principal: Principal = Depends(current_principal)):
    """List BYOK keys for the caller's organization only."""
    org_id = principal.active_org_id
    db = SessionLocal()
    try:
        keys = db.query(db_models.ProviderKey).filter(
            db_models.ProviderKey.organization_id == org_id
        ).all()
        return [{"provider": k.provider, "has_key": bool(k.api_key), "endpoint": k.endpoint} for k in keys]
    finally:
        db.close()


@app.post("/providers/keys")
def save_provider_key(request: ProviderKeyRequest, principal: Principal = Depends(current_principal)):
    if not request.provider or not request.provider.strip():
        return {"error": "provider is required"}
    if not principal.can(P_MANAGE_KEYS):
        return JSONResponse({"detail": "Insufficient permissions"}, status_code=403)
    org_id = principal.active_org_id
    db = SessionLocal()
    try:
        existing = db.query(db_models.ProviderKey).filter(
            db_models.ProviderKey.provider == request.provider,
            db_models.ProviderKey.organization_id == org_id,
        ).first()
        if existing:
            if request.api_key is not None:
                existing.api_key = encrypt_secret(request.api_key)
            if request.endpoint is not None:
                existing.endpoint = request.endpoint
            existing.updated_at = datetime.utcnow()
        else:
            key = db_models.ProviderKey(
                provider=request.provider,
                api_key=encrypt_secret(request.api_key),
                endpoint=request.endpoint,
                organization_id=org_id,
            )
            db.add(key)

        # Active provider/model selection is namespaced per organization.
        suffix = f":{org_id}" if org_id else ""

        def _upsert_config(k: str, v: str) -> None:
            row = db.query(db_models.AppConfig).filter(db_models.AppConfig.key == k).first()
            if row:
                row.value = v
                row.updated_at = datetime.utcnow()
            else:
                db.add(db_models.AppConfig(key=k, value=v))

        _upsert_config(f"active_provider{suffix}", request.provider)
        if request.model:
            _upsert_config(f"active_model{suffix}", request.model)

        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/providers/keys/{provider}")
def delete_provider_key(provider: str, principal: Principal = Depends(current_principal)):
    if not principal.can(P_MANAGE_KEYS):
        return JSONResponse({"detail": "Insufficient permissions"}, status_code=403)
    db = SessionLocal()
    try:
        db.query(db_models.ProviderKey).filter(
            db_models.ProviderKey.provider == provider,
            db_models.ProviderKey.organization_id == principal.active_org_id,
        ).delete()
        db.commit()
        return {"ok": True}
    finally:
        db.close()
