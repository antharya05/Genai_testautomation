"""requirements lifecycle

Phase 4. Canonical requirement catalog + immutable version chain, change-event
ledger, baselines, and the run↔version / run↔baseline linkage columns.

Schema only — the data backfill of legacy per-run requirements into the catalog
is an idempotent service step (db_service.backfill_requirement_catalog), run at
startup, mirroring how encrypted-key migration is handled.

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _insp():
    return inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _insp().get_table_names()


def _has_column(table: str, col: str) -> bool:
    return col in {c["name"] for c in _insp().get_columns(table)}


def _has_index(table: str, name: str) -> bool:
    return name in {ix["name"] for ix in _insp().get_indexes(table)}


def _ci(name: str, table: str, cols: list, unique: bool = False) -> None:
    if not _has_index(table, name):
        op.create_index(name, table, cols, unique=unique)


def upgrade() -> None:
    # ── requirements_catalog ──────────────────────────────────────────────────
    if not _has_table("requirements_catalog"):
        op.create_table(
            "requirements_catalog",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36),
                      sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("requirement_key", sa.String(80), nullable=False),
            sa.Column("title", sa.String(500), nullable=True),
            sa.Column("current_version_id", sa.String(36), nullable=True),
            sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )
        _ci("ix_requirements_catalog_project_id", "requirements_catalog", ["project_id"])
        _ci("ix_requirements_catalog_project_key", "requirements_catalog",
            ["project_id", "requirement_key"], unique=True)

    # ── requirement_versions ──────────────────────────────────────────────────
    if not _has_table("requirement_versions"):
        op.create_table(
            "requirement_versions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("requirement_id", sa.String(36),
                      sa.ForeignKey("requirements_catalog.id", ondelete="CASCADE"), nullable=False),
            sa.Column("version_no", sa.Integer(), nullable=False),
            sa.Column("statement", sa.Text(), nullable=False),
            sa.Column("meta", sa.JSON(), nullable=True),
            sa.Column("content_hash", sa.String(64), nullable=False),
            sa.Column("change_class", sa.String(12), nullable=False, server_default="major"),
            sa.Column("change_reason", sa.Text(), nullable=True),
            sa.Column("supersedes_version_id", sa.String(36), nullable=True),
            sa.Column("author_id", sa.String(120), nullable=True),
            sa.Column("author_display", sa.String(120), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        _ci("ix_requirement_versions_requirement_id", "requirement_versions", ["requirement_id"])
        _ci("ix_requirement_versions_req_no", "requirement_versions",
            ["requirement_id", "version_no"], unique=True)
        _ci("ix_requirement_versions_req_hash", "requirement_versions",
            ["requirement_id", "content_hash"])

    # ── requirement_change_events ─────────────────────────────────────────────
    if not _has_table("requirement_change_events"):
        op.create_table(
            "requirement_change_events",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("requirement_id", sa.String(36),
                      sa.ForeignKey("requirements_catalog.id", ondelete="CASCADE"), nullable=False),
            sa.Column("event_type", sa.String(20), nullable=False),
            sa.Column("from_version_id", sa.String(36), nullable=True),
            sa.Column("to_version_id", sa.String(36), nullable=True),
            sa.Column("change_class", sa.String(12), nullable=True),
            sa.Column("actor_id", sa.String(120), nullable=True),
            sa.Column("actor_display", sa.String(120), nullable=True),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("impact_snapshot", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        _ci("ix_requirement_change_events_requirement_id", "requirement_change_events", ["requirement_id"])
        _ci("ix_requirement_change_events_req_created", "requirement_change_events",
            ["requirement_id", "created_at"])

    # ── baselines ─────────────────────────────────────────────────────────────
    if not _has_table("baselines"):
        op.create_table(
            "baselines",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("project_id", sa.String(36),
                      sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(80), nullable=False),
            sa.Column("note", sa.Text(), nullable=True),
            sa.Column("created_by_id", sa.String(120), nullable=True),
            sa.Column("created_by_display", sa.String(120), nullable=True),
            sa.Column("content_digest", sa.String(64), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        _ci("ix_baselines_project_id", "baselines", ["project_id"])
        _ci("ix_baselines_project_name", "baselines", ["project_id", "name"], unique=True)

    # ── baseline_items ────────────────────────────────────────────────────────
    if not _has_table("baseline_items"):
        op.create_table(
            "baseline_items",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("baseline_id", sa.String(36),
                      sa.ForeignKey("baselines.id", ondelete="CASCADE"), nullable=False),
            sa.Column("requirement_id", sa.String(36),
                      sa.ForeignKey("requirements_catalog.id", ondelete="SET NULL"), nullable=True),
            sa.Column("requirement_version_id", sa.String(36),
                      sa.ForeignKey("requirement_versions.id", ondelete="SET NULL"), nullable=True),
            sa.Column("requirement_key", sa.String(80), nullable=True),
            sa.Column("version_no", sa.Integer(), nullable=True),
            sa.Column("statement", sa.Text(), nullable=True),
            sa.Column("source_run_id", sa.String(36),
                      sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
            sa.Column("approval_state", sa.String(20), nullable=True),
            sa.Column("coverage_pct", sa.Float(), nullable=True),
            sa.Column("test_case_count", sa.Integer(), nullable=True),
            sa.Column("test_cases_snapshot", sa.JSON(), nullable=True),
            sa.Column("items_digest", sa.String(64), nullable=True),
        )
        _ci("ix_baseline_items_baseline_id", "baseline_items", ["baseline_id"])

    # ── linkage columns on existing tables (batch for SQLite FK adds) ──────────
    if not _has_column("requirements", "requirement_version_id"):
        with op.batch_alter_table("requirements") as b:
            b.add_column(sa.Column("requirement_version_id", sa.String(36), nullable=True))
            b.create_foreign_key("fk_requirements_req_version", "requirement_versions",
                                 ["requirement_version_id"], ["id"], ondelete="SET NULL")
    _ci("ix_requirements_requirement_version_id", "requirements", ["requirement_version_id"])

    if not _has_column("runs", "source_baseline_id"):
        with op.batch_alter_table("runs") as b:
            b.add_column(sa.Column("source_baseline_id", sa.String(36), nullable=True))
            b.add_column(sa.Column("requirement_versions_digest", sa.String(64), nullable=True))
            b.create_foreign_key("fk_runs_source_baseline", "baselines",
                                 ["source_baseline_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    if _has_column("runs", "source_baseline_id"):
        with op.batch_alter_table("runs") as b:
            b.drop_constraint("fk_runs_source_baseline", type_="foreignkey")
            b.drop_column("requirement_versions_digest")
            b.drop_column("source_baseline_id")
    if _has_column("requirements", "requirement_version_id"):
        if _has_index("requirements", "ix_requirements_requirement_version_id"):
            op.drop_index("ix_requirements_requirement_version_id", table_name="requirements")
        with op.batch_alter_table("requirements") as b:
            b.drop_constraint("fk_requirements_req_version", type_="foreignkey")
            b.drop_column("requirement_version_id")
    for tbl in ("baseline_items", "baselines", "requirement_change_events",
                "requirement_versions", "requirements_catalog"):
        if _has_table(tbl):
            op.drop_table(tbl)
