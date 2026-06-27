"""per-requirement generation status

Adds the generation-outcome columns to ``requirements`` so a failed generation is
recorded (with its cause) and kept distinct from coverage. Mirrors the runtime
zero-downtime migration ``ensure_generation_status_columns`` for alembic-managed
deployments.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-19
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("requirements", sa.Column("generation_status", sa.String(20), nullable=True))
    op.add_column("requirements", sa.Column("failure_type", sa.String(30), nullable=True))
    op.add_column("requirements", sa.Column("failure_reason", sa.Text, nullable=True))
    op.add_column("requirements", sa.Column("last_attempt_at", sa.DateTime, nullable=True))


def downgrade() -> None:
    op.drop_column("requirements", "last_attempt_at")
    op.drop_column("requirements", "failure_reason")
    op.drop_column("requirements", "failure_type")
    op.drop_column("requirements", "generation_status")
