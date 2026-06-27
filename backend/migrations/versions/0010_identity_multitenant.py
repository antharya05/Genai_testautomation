"""identity & multi-tenant foundation

Phase 4.5. Users, OAuth identities, organizations, memberships, invitations,
sessions; plus org-ownership columns on projects and provider_keys. Additive and
nullable so the single-tenant data keeps working until the tenancy-enforcement
increment assigns everything to a Default Organization (idempotent backfill).

Revision ID: 0010
Revises: 0009
Create Date: 2026-06-22
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0010"
down_revision: Union[str, None] = "0009"
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
    if not _has_table("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("primary_email", sa.String(255), nullable=False),
            sa.Column("display_name", sa.String(200), nullable=True),
            sa.Column("avatar_url", sa.String(500), nullable=True),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_login_at", sa.DateTime(), nullable=True),
        )
        _ci("ix_users_primary_email", "users", ["primary_email"], unique=True)

    if not _has_table("organizations"):
        op.create_table(
            "organizations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("slug", sa.String(80), nullable=False),
            sa.Column("created_by_user_id", sa.String(36),
                      sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        _ci("ix_organizations_slug", "organizations", ["slug"], unique=True)

    if not _has_table("user_identities"):
        op.create_table(
            "user_identities",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("provider", sa.String(20), nullable=False),
            sa.Column("provider_subject", sa.String(255), nullable=False),
            sa.Column("email_at_provider", sa.String(255), nullable=True),
            sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        _ci("ix_user_identities_user_id", "user_identities", ["user_id"])
        _ci("ix_user_identities_provider_subject", "user_identities",
            ["provider", "provider_subject"], unique=True)

    if not _has_table("memberships"):
        op.create_table(
            "memberships",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(20), nullable=False, server_default="member"),
            sa.Column("status", sa.String(20), nullable=False, server_default="active"),
            sa.Column("invited_by_user_id", sa.String(36), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        _ci("ix_memberships_org_id", "memberships", ["org_id"])
        _ci("ix_memberships_user_id", "memberships", ["user_id"])
        _ci("ix_memberships_org_user", "memberships", ["org_id", "user_id"], unique=True)

    if not _has_table("org_invitations"):
        op.create_table(
            "org_invitations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("org_id", sa.String(36), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("role", sa.String(20), nullable=False, server_default="member"),
            sa.Column("token_hash", sa.String(64), nullable=False),
            sa.Column("invited_by_user_id", sa.String(36), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("accepted_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
        )
        _ci("ix_org_invitations_org", "org_invitations", ["org_id"])

    if not _has_table("sessions"):
        op.create_table(
            "sessions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("active_org_id", sa.String(36),
                      sa.ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("user_agent", sa.String(400), nullable=True),
            sa.Column("ip", sa.String(64), nullable=True),
        )
        _ci("ix_sessions_user", "sessions", ["user_id"])

    # ── ownership columns (batch for SQLite FK adds) ──────────────────────────
    if not _has_column("projects", "organization_id"):
        with op.batch_alter_table("projects") as b:
            b.add_column(sa.Column("organization_id", sa.String(36), nullable=True))
            b.add_column(sa.Column("created_by_user_id", sa.String(36), nullable=True))
            b.create_foreign_key("fk_projects_org", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
            b.create_foreign_key("fk_projects_created_by", "users", ["created_by_user_id"], ["id"], ondelete="SET NULL")
    _ci("ix_projects_organization_id", "projects", ["organization_id"])

    if not _has_column("provider_keys", "organization_id"):
        with op.batch_alter_table("provider_keys") as b:
            b.add_column(sa.Column("organization_id", sa.String(36), nullable=True))
            b.create_foreign_key("fk_provider_keys_org", "organizations", ["organization_id"], ["id"], ondelete="CASCADE")
    _ci("ix_provider_keys_organization_id", "provider_keys", ["organization_id"])


def downgrade() -> None:
    if _has_column("provider_keys", "organization_id"):
        if _has_index("provider_keys", "ix_provider_keys_organization_id"):
            op.drop_index("ix_provider_keys_organization_id", table_name="provider_keys")
        with op.batch_alter_table("provider_keys") as b:
            b.drop_constraint("fk_provider_keys_org", type_="foreignkey")
            b.drop_column("organization_id")
    if _has_column("projects", "organization_id"):
        if _has_index("projects", "ix_projects_organization_id"):
            op.drop_index("ix_projects_organization_id", table_name="projects")
        with op.batch_alter_table("projects") as b:
            b.drop_constraint("fk_projects_created_by", type_="foreignkey")
            b.drop_constraint("fk_projects_org", type_="foreignkey")
            b.drop_column("created_by_user_id")
            b.drop_column("organization_id")
    for tbl in ("sessions", "org_invitations", "memberships", "user_identities",
                "organizations", "users"):
        if _has_table(tbl):
            op.drop_table(tbl)
