"""reconcile schema to ORM

Brings the Alembic head up to the live ORM. Before this revision the production
schema was built by ``create_all`` + a set of runtime ``ensure_*_columns`` shims
in db_service, so Alembic (head 0002) lagged the real schema by three tables and
~18 columns. This revision adds them.

Every change is GUARDED by an existence check, so the revision is idempotent on a
DB that was already shim-built (it no-ops) and complete on a fresh DB (it builds
everything). Foreign keys and the performance indexes are intentionally deferred
to 0004 and 0005 so both fresh and pre-existing databases converge through the
same later steps.

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _insp().get_table_names()


def _has_column(table: str, col: str) -> bool:
    if not _has_table(table):
        return False
    return col in {c["name"] for c in _insp().get_columns(table)}


def _add_column(table: str, column: sa.Column) -> None:
    if not _has_column(table, column.name):
        op.add_column(table, column)


# (table, column factory) — drifted columns that the ensure_* shims used to add.
_DRIFTED_COLUMNS = [
    # runs — provider observability + run coverage %
    ("runs", lambda: sa.Column("failed_requirement_count", sa.Integer(), nullable=True, server_default="0")),
    ("runs", lambda: sa.Column("error_count", sa.Integer(), nullable=True, server_default="0")),
    ("runs", lambda: sa.Column("generation_duration", sa.Float(), nullable=True)),
    # sa.false() renders the dialect-correct literal (``false`` on PostgreSQL,
    # ``0`` on SQLite) — a bare "0" would be rejected as an integer default on a
    # boolean column by PostgreSQL.
    ("runs", lambda: sa.Column("fallback_used", sa.Boolean(), nullable=True, server_default=sa.false())),
    ("runs", lambda: sa.Column("coverage_pct", sa.Float(), nullable=True)),
    # requirements — traceability/validation snapshot + parser metadata
    ("requirements", lambda: sa.Column("covered", sa.Boolean(), nullable=True)),
    ("requirements", lambda: sa.Column("test_case_count", sa.Integer(), nullable=True, server_default="0")),
    ("requirements", lambda: sa.Column("coverage_warnings", sa.JSON(), nullable=True)),
    ("requirements", lambda: sa.Column("validation_status", sa.String(20), nullable=True)),
    ("requirements", lambda: sa.Column("meta", sa.JSON(), nullable=True)),
    # test_cases — full TestCase round-trip + review workflow
    ("test_cases", lambda: sa.Column("asil_source", sa.String(20), nullable=True)),
    ("test_cases", lambda: sa.Column("asil_confidence", sa.Integer(), nullable=True)),
    ("test_cases", lambda: sa.Column("boundary_position", sa.String(10), nullable=True)),
    ("test_cases", lambda: sa.Column("coverage_warnings", sa.JSON(), nullable=True)),
    ("test_cases", lambda: sa.Column("review_status", sa.String(20), nullable=True, server_default="pending")),
    ("test_cases", lambda: sa.Column("review_note", sa.Text(), nullable=True)),
    ("test_cases", lambda: sa.Column("reviewed_at", sa.String(50), nullable=True)),
]


def upgrade() -> None:
    # ── 1. Drifted columns ────────────────────────────────────────────────────
    for table, factory in _DRIFTED_COLUMNS:
        _add_column(table, factory())

    # ── 2. Tables that only existed via create_all (no FKs here — added in 0004) ─
    if not _has_table("review_events"):
        op.create_table(
            "review_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("run_id", sa.String(36), nullable=False),
            sa.Column("test_case_id", sa.String(36), nullable=False),
            sa.Column("test_id", sa.String(50), nullable=True),
            sa.Column("from_status", sa.String(20), nullable=True),
            sa.Column("to_status", sa.String(20), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("actor", sa.String(100), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_review_events_run_id", "review_events", ["run_id"])
        op.create_index("ix_review_events_test_case_id", "review_events", ["test_case_id"])
        op.create_index("ix_review_events_created_at", "review_events", ["created_at"])

    if not _has_table("provider_keys"):
        op.create_table(
            "provider_keys",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("provider", sa.String(50), nullable=False),
            sa.Column("api_key", sa.Text(), nullable=True),
            sa.Column("endpoint", sa.String(500), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_provider_keys_provider", "provider_keys", ["provider"], unique=True)

    if not _has_table("app_config"):
        op.create_table(
            "app_config",
            sa.Column("key", sa.String(100), primary_key=True),
            sa.Column("value", sa.Text(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )


def downgrade() -> None:
    # Drop only what this revision owns. Tables first, then the drifted columns.
    for tbl in ("review_events", "provider_keys", "app_config"):
        if _has_table(tbl):
            op.drop_table(tbl)
    for table, factory in reversed(_DRIFTED_COLUMNS):
        col = factory().name
        if _has_column(table, col):
            op.drop_column(table, col)
