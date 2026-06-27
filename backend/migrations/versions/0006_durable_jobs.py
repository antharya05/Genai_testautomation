"""durable generation jobs

Phase 2B. Adds the ``generation_jobs`` queue table (1:1 with runs), the
per-requirement execution columns, and tightens (run_id, test_id) to UNIQUE so
the worker's idempotent per-requirement re-drive can never duplicate a case.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _insp().get_table_names()


def _has_column(table: str, col: str) -> bool:
    return col in {c["name"] for c in _insp().get_columns(table)}


def _index_names(table: str) -> set:
    return {ix["name"] for ix in _insp().get_indexes(table)}


def upgrade() -> None:
    # ── generation_jobs queue table ───────────────────────────────────────────
    if not _has_table("generation_jobs"):
        op.create_table(
            "generation_jobs",
            sa.Column(
                "id", sa.String(36),
                sa.ForeignKey("runs.id", ondelete="CASCADE"),
                primary_key=True,
            ),
            sa.Column("status", sa.String(20), nullable=False, server_default="queued"),
            sa.Column("attempt_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
            sa.Column("claimed_by", sa.String(64), nullable=True),
            sa.Column("claimed_at", sa.DateTime(), nullable=True),
            sa.Column("heartbeat_at", sa.DateTime(), nullable=True),
            sa.Column("lease_expires_at", sa.DateTime(), nullable=True),
            sa.Column("cancel_requested", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("progress_current", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("progress_total", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("last_error", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("finished_at", sa.DateTime(), nullable=True),
        )
        op.create_index("ix_generation_jobs_status", "generation_jobs", ["status"])
        op.create_index(
            "ix_generation_jobs_status_lease", "generation_jobs",
            ["status", "lease_expires_at"],
        )

    # ── per-requirement execution columns ─────────────────────────────────────
    if not _has_column("requirements", "attempt_count"):
        op.add_column("requirements", sa.Column("attempt_count", sa.Integer(), nullable=True, server_default="0"))
    if not _has_column("requirements", "started_at"):
        op.add_column("requirements", sa.Column("started_at", sa.DateTime(), nullable=True))

    # ── tighten (run_id, test_id) to UNIQUE ───────────────────────────────────
    if "ix_test_cases_run_id_test_id" in _index_names("test_cases"):
        op.drop_index("ix_test_cases_run_id_test_id", table_name="test_cases")
    op.create_index(
        "ix_test_cases_run_id_test_id", "test_cases",
        ["run_id", "test_id"], unique=True,
    )


def downgrade() -> None:
    if "ix_test_cases_run_id_test_id" in _index_names("test_cases"):
        op.drop_index("ix_test_cases_run_id_test_id", table_name="test_cases")
    op.create_index("ix_test_cases_run_id_test_id", "test_cases", ["run_id", "test_id"])

    if _has_column("requirements", "started_at"):
        op.drop_column("requirements", "started_at")
    if _has_column("requirements", "attempt_count"):
        op.drop_column("requirements", "attempt_count")

    if _has_table("generation_jobs"):
        op.drop_table("generation_jobs")
