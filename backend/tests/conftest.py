"""Shared pytest fixtures and test-time environment.

Environment variables are set HERE, at import time, before any application
module is imported — ``database.py`` reads ``DATABASE_URL`` at module import,
and the auth/secrets modules read their secrets lazily but we pin them anyway
for determinism. Tests therefore run against an isolated temp SQLite DB with a
known app password and RAG disabled.
"""

import os
import tempfile
from pathlib import Path

# ── Test environment (must be set before importing app modules) ───────────────
# Default: isolated temp SQLite. Opt-in override (e.g. to validate against a real
# PostgreSQL) via TESTGEN_TEST_DATABASE_URL — used for Postgres verification runs.
_override = os.environ.get("TESTGEN_TEST_DATABASE_URL")
if _override:
    os.environ["DATABASE_URL"] = _override
else:
    _TMPDIR = tempfile.mkdtemp(prefix="testgen_tests_")
    os.environ["DATABASE_URL"] = f"sqlite:///{Path(_TMPDIR).as_posix()}/test.db"
os.environ["APP_PASSWORD"] = "test-pass"
os.environ["AUTH_SECRET"] = "test-auth-secret"
os.environ["KEY_ENCRYPTION_SECRET"] = "test-enc-secret"
os.environ["RAG_ENABLED"] = "false"
os.environ["ALLOWED_ORIGINS"] = "http://localhost:5173"
# Make provider defaults deterministic regardless of the host shell.
os.environ.pop("PROVIDER", None)

import pytest
from fastapi.testclient import TestClient

APP_PASSWORD = "test-pass"


@pytest.fixture(scope="session", autouse=True)
def _init_db():
    """Build the schema the SAME way production does — ``alembic upgrade head`` —
    so the test suite exercises the migrations, not a parallel ``create_all`` path
    that could silently drift from them."""
    from pathlib import Path

    from alembic import command
    from alembic.config import Config

    backend = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend / "migrations"))
    command.upgrade(cfg, "head")
    yield


@pytest.fixture(autouse=True)
def _clear_cache():
    """The generation cache is a process-global dict — isolate every test."""
    from services import cache

    cache.clear()
    yield
    cache.clear()


@pytest.fixture(scope="session")
def app():
    import main

    return main.app


@pytest.fixture
def client(app):
    """TestClient with the app lifespan run (ensures default project, migrations)."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def token(client):
    res = client.post("/auth/login", json={"password": APP_PASSWORD})
    assert res.status_code == 200, res.text
    return res.json()["token"]


@pytest.fixture
def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def db_session():
    """A raw DB session for tests that drive db_service directly."""
    from database import SessionLocal

    s = SessionLocal()
    try:
        yield s
    finally:
        s.close()
