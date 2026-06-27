"""email/password auth on users

Phase 4.6. Add a per-user password hash and an email-verification flag so users
can register with email + password alongside OAuth. Additive and backward
compatible: existing OAuth users get NULL password_hash (password login disabled
for them) and email_verified defaulting to false.

Revision ID: 0012
Revises: 0011
Create Date: 2026-06-27
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _has_column(table: str, col: str) -> bool:
    return col in {c["name"] for c in inspect(op.get_bind()).get_columns(table)}


def upgrade() -> None:
    if not _has_column("users", "password_hash"):
        op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    if not _has_column("users", "email_verified"):
        op.add_column(
            "users",
            sa.Column("email_verified", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        )


def downgrade() -> None:
    if _has_column("users", "email_verified"):
        op.drop_column("users", "email_verified")
    if _has_column("users", "password_hash"):
        op.drop_column("users", "password_hash")
