"""Phase 1 guards: migration parity + referential-integrity cascade.

These tests are the safety net that keeps Alembic and the ORM from drifting again
(the exact failure mode Phase 1 fixed) and that proves ON DELETE CASCADE actually
removes children on the configured backend.
"""

import os
import tempfile
import uuid
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text

BACKEND = Path(__file__).resolve().parent.parent

# Tables Alembic owns and the ORM declares. alembic_version is Alembic-internal.
_IGNORE_TABLES = {"alembic_version"}


def _snapshot(engine) -> dict:
    """Structural snapshot: columns, FKs and index column-sets per table.

    Index *names* and column types/defaults are intentionally excluded — parity
    is about structure (what columns exist, what references what, what is
    indexed), not cosmetic naming that legitimately differs between a hand-written
    migration and ``create_all``.
    """
    insp = inspect(engine)
    snap: dict = {}
    for table in insp.get_table_names():
        if table in _IGNORE_TABLES:
            continue
        cols = {c["name"] for c in insp.get_columns(table)}
        fks = {
            (tuple(fk["constrained_columns"]), fk["referred_table"], tuple(fk["referred_columns"]))
            for fk in insp.get_foreign_keys(table)
        }
        idxs = {tuple(ix["column_names"]) for ix in insp.get_indexes(table)}
        snap[table] = {"columns": cols, "fks": fks, "indexes": idxs}
    return snap


def _alembic_built_db(tmp_path: Path) -> str:
    """Build a fresh DB by running every migration to head; return its URL."""
    from alembic import command
    from alembic.config import Config

    url = f"sqlite:///{(tmp_path / 'alembic.db').as_posix()}"
    prev = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = url  # env.py reads this at run time
    try:
        cfg = Config(str(BACKEND / "alembic.ini"))
        cfg.set_main_option("script_location", str(BACKEND / "migrations"))
        command.upgrade(cfg, "head")
    finally:
        if prev is not None:
            os.environ["DATABASE_URL"] = prev
        else:
            os.environ.pop("DATABASE_URL", None)
    return url


def _create_all_db(tmp_path: Path) -> str:
    """Build a fresh DB straight from the ORM metadata; return its URL."""
    from database import Base
    import db_models  # noqa: F401 — registers tables on Base.metadata

    url = f"sqlite:///{(tmp_path / 'metadata.db').as_posix()}"
    eng = create_engine(url)
    Base.metadata.create_all(bind=eng)
    eng.dispose()
    return url


def test_alembic_head_matches_orm_metadata():
    """`alembic upgrade head` must produce the same schema as the ORM models.

    If this fails, a migration is missing or has drifted from db_models.py.
    """
    with tempfile.TemporaryDirectory() as d:
        tmp = Path(d)
        alembic_url = _alembic_built_db(tmp)
        metadata_url = _create_all_db(tmp)

        a_eng = create_engine(alembic_url)
        m_eng = create_engine(metadata_url)
        try:
            alembic_snap = _snapshot(a_eng)
            metadata_snap = _snapshot(m_eng)
        finally:
            a_eng.dispose()
            m_eng.dispose()

    assert set(alembic_snap) == set(metadata_snap), (
        f"table mismatch: alembic-only={set(alembic_snap) - set(metadata_snap)}, "
        f"orm-only={set(metadata_snap) - set(alembic_snap)}"
    )
    for table in metadata_snap:
        assert alembic_snap[table]["columns"] == metadata_snap[table]["columns"], (
            f"column drift on {table}: "
            f"alembic-only={alembic_snap[table]['columns'] - metadata_snap[table]['columns']}, "
            f"orm-only={metadata_snap[table]['columns'] - alembic_snap[table]['columns']}"
        )
        assert alembic_snap[table]["fks"] == metadata_snap[table]["fks"], (
            f"foreign-key drift on {table}"
        )
        assert alembic_snap[table]["indexes"] == metadata_snap[table]["indexes"], (
            f"index drift on {table}: "
            f"alembic={alembic_snap[table]['indexes']}, orm={metadata_snap[table]['indexes']}"
        )


def _seed_full_tree(db_session, project_id: str, run_id: str) -> None:
    from services import db_service as svc

    svc.create_run(
        db_session, job_id=run_id, project_id=project_id,
        requirements=["REQ_1: the system shall do X"],
        provider="fake", model="fake", prompt_version="v1",
    )
    svc.finalize_run(
        db_session, run_id,
        test_cases=[{
            "test_id": "TC_001", "requirement_id": "REQ_1", "title": "x",
            "asil": "QM", "test_type": "functional",
            "steps": ["s"], "expected_results": ["e"],
            "source_requirement_text": "REQ_1: the system shall do X",
        }],
        rag_enabled=False, outcome="complete",
    )
    # One review event so the audit table is part of the tree.
    svc.patch_test_case_review(
        db_session, run_id=run_id, test_id="TC_001",
        review_status="approved", actor_id="tester@example.com", actor_display="Tester",
    )


def _child_counts(db_session, run_id: str) -> tuple[int, int, int]:
    req = db_session.execute(
        text("SELECT COUNT(*) FROM requirements WHERE run_id=:r"), {"r": run_id}
    ).scalar()
    tcs = db_session.execute(
        text("SELECT COUNT(*) FROM test_cases WHERE run_id=:r"), {"r": run_id}
    ).scalar()
    revs = db_session.execute(
        text("SELECT COUNT(*) FROM review_events WHERE run_id=:r"), {"r": run_id}
    ).scalar()
    return req, tcs, revs


def test_delete_project_cascades_service_layer(db_session):
    """delete_project removes the whole run subtree (no orphans)."""
    from services import db_service as svc

    project_id = svc.create_project(db_session, name="Cascade Test").id
    run_id = str(uuid.uuid4())
    _seed_full_tree(db_session, project_id, run_id)
    assert _child_counts(db_session, run_id) == (1, 1, 1)

    assert svc.delete_project(db_session, project_id) is True
    assert _child_counts(db_session, run_id) == (0, 0, 0)


def test_db_level_fk_cascade_on_run_delete(db_session):
    """Deleting a run at the DB level cascades to its children via ON DELETE
    CASCADE — proving the FK constraint and SQLite pragma are both active."""
    from services import db_service as svc

    project_id = svc.create_project(db_session, name="FK Cascade Test").id
    run_id = str(uuid.uuid4())
    _seed_full_tree(db_session, project_id, run_id)
    assert _child_counts(db_session, run_id) == (1, 1, 1)

    db_session.execute(text("DELETE FROM runs WHERE id=:r"), {"r": run_id})
    db_session.commit()

    assert _child_counts(db_session, run_id) == (0, 0, 0)
