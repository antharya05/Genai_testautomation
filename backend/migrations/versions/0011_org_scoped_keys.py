"""org-scoped provider keys

Phase 4.5 (tenancy sweep). BYOK keys become unique per (organization, provider)
instead of globally unique per provider, so each tenant has its own keys.

Revision ID: 0011
Revises: 0010
Create Date: 2026-06-22
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _indexes(table: str) -> set:
    return {ix["name"] for ix in inspect(op.get_bind()).get_indexes(table)}


def upgrade() -> None:
    existing = _indexes("provider_keys")
    # Drop the old global-unique index on provider.
    if "ix_provider_keys_provider" in existing:
        op.drop_index("ix_provider_keys_provider", table_name="provider_keys")
    # Re-create provider as a NON-unique index (matches the ORM).
    if "ix_provider_keys_provider" not in _indexes("provider_keys"):
        op.create_index("ix_provider_keys_provider", "provider_keys", ["provider"])
    # Composite unique: one key per (org, provider).
    if "ix_provider_keys_org_provider" not in _indexes("provider_keys"):
        op.create_index("ix_provider_keys_org_provider", "provider_keys",
                        ["organization_id", "provider"], unique=True)


def downgrade() -> None:
    existing = _indexes("provider_keys")
    if "ix_provider_keys_org_provider" in existing:
        op.drop_index("ix_provider_keys_org_provider", table_name="provider_keys")
    if "ix_provider_keys_provider" in existing:
        op.drop_index("ix_provider_keys_provider", table_name="provider_keys")
    op.create_index("ix_provider_keys_provider", "provider_keys", ["provider"], unique=True)
