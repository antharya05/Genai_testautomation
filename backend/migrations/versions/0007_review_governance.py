"""review governance

Phase 3. Adds run-level review governance: the governance state machine columns
on ``runs``, future-proof identity columns on ``review_events``, and the immutable
``run_approval_events`` ledger.

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _insp().get_table_names()


def _has_column(table: str, col: str) -> bool:
    return col in {c["name"] for c in _insp().get_columns(table)}


def _add(table: str, column: sa.Column) -> None:
    if not _has_column(table, column.name):
        op.add_column(table, column)


def upgrade() -> None:
    # ── runs: governance state machine ────────────────────────────────────────
    _add("runs", sa.Column("review_state", sa.String(20), nullable=False, server_default="draft"))
    _add("runs", sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.false()))
    _add("runs", sa.Column("approved_by_id", sa.String(120), nullable=True))
    _add("runs", sa.Column("approved_by_display", sa.String(120), nullable=True))
    _add("runs", sa.Column("approved_at", sa.DateTime(), nullable=True))
    _add("runs", sa.Column("review_digest", sa.String(64), nullable=True))

    # ── review_events: future-proof identity ──────────────────────────────────
    _add("review_events", sa.Column("actor_id", sa.String(120), nullable=True))
    _add("review_events", sa.Column("actor_display", sa.String(120), nullable=True))

    # ── run_approval_events: governance ledger ────────────────────────────────
    if not _has_table("run_approval_events"):
        op.create_table(
            "run_approval_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("run_id", sa.String(36),
                      sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
            sa.Column("from_state", sa.String(20), nullable=True),
            sa.Column("to_state", sa.String(20), nullable=True),
            sa.Column("actor_id", sa.String(120), nullable=True),
            sa.Column("actor_display", sa.String(120), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("approved_count", sa.Integer(), nullable=True),
            sa.Column("total_count", sa.Integer(), nullable=True),
            sa.Column("coverage_pct", sa.Float(), nullable=True),
            sa.Column("test_cases_digest", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        op.create_index("ix_run_approval_events_run_id", "run_approval_events", ["run_id"])
        op.create_index(
            "ix_run_approval_events_run_created", "run_approval_events",
            ["run_id", "created_at"],
        )


def downgrade() -> None:
    if _has_table("run_approval_events"):
        op.drop_table("run_approval_events")
    for col in ("actor_display", "actor_id"):
        if _has_column("review_events", col):
            op.drop_column("review_events", col)
    for col in ("review_digest", "approved_at", "approved_by_display",
                "approved_by_id", "locked", "review_state"):
        if _has_column("runs", col):
            op.drop_column("runs", col)
