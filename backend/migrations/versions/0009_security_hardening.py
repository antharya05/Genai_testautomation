"""security hardening

Phase 5. DB-backed rate-limit buckets + an immutable auth-event audit log.

Revision ID: 0009
Revises: 0008
Create Date: 2026-06-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _insp().get_table_names()


def _has_index(table: str, name: str) -> bool:
    return name in {ix["name"] for ix in _insp().get_indexes(table)}


def upgrade() -> None:
    if not _has_table("rate_limit_buckets"):
        op.create_table(
            "rate_limit_buckets",
            sa.Column("bucket_key", sa.String(160), primary_key=True),
            sa.Column("window_start", sa.DateTime(), nullable=False),
            sa.Column("count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("locked_until", sa.DateTime(), nullable=True),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        if not _has_index("rate_limit_buckets", "ix_rate_limit_buckets_locked_until"):
            op.create_index("ix_rate_limit_buckets_locked_until", "rate_limit_buckets", ["locked_until"])

    if not _has_table("auth_events"):
        op.create_table(
            "auth_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("event_type", sa.String(30), nullable=False),
            sa.Column("ip", sa.String(64), nullable=True),
            sa.Column("user_agent", sa.String(400), nullable=True),
            sa.Column("actor_hint", sa.String(255), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        if not _has_index("auth_events", "ix_auth_events_created"):
            op.create_index("ix_auth_events_created", "auth_events", ["created_at"])


def downgrade() -> None:
    if _has_table("auth_events"):
        op.drop_table("auth_events")
    if _has_table("rate_limit_buckets"):
        op.drop_table("rate_limit_buckets")
