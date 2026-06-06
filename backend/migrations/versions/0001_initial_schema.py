"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-05
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("updated_at", sa.DateTime, nullable=False),
        sa.Column("last_run_at", sa.DateTime, nullable=True),
    )

    op.create_table(
        "runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("project_id", sa.String(36), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("provider", sa.String(50), nullable=True),
        sa.Column("model", sa.String(100), nullable=True),
        sa.Column("requirement_count", sa.Integer, default=0),
        sa.Column("test_case_count", sa.Integer, default=0),
        sa.Column("rag_enabled", sa.Boolean, default=False),
        sa.Column("prompt_version", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
        sa.Column("completed_at", sa.DateTime, nullable=True),
        sa.Column("error", sa.Text, nullable=True),
        sa.Column("functional_count", sa.Integer, default=0),
        sa.Column("boundary_count", sa.Integer, default=0),
        sa.Column("negative_count", sa.Integer, default=0),
        sa.Column("fault_injection_count", sa.Integer, default=0),
        sa.Column("timing_count", sa.Integer, default=0),
        sa.Column("recovery_count", sa.Integer, default=0),
        sa.Column("safety_count", sa.Integer, default=0),
    )
    op.create_index("ix_runs_project_id", "runs", ["project_id"])

    op.create_table(
        "requirements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("text", sa.Text, nullable=False),
        sa.Column("requirement_id", sa.String(50), nullable=True),
        sa.Column("position", sa.Integer, nullable=False),
    )
    op.create_index("ix_requirements_run_id", "requirements", ["run_id"])

    op.create_table(
        "test_cases",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("run_id", sa.String(36), nullable=False),
        sa.Column("test_id", sa.String(50), nullable=True),
        sa.Column("requirement_id", sa.String(50), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("asil", sa.String(5), nullable=True),
        sa.Column("test_type", sa.String(50), nullable=True),
        sa.Column("preconditions", sa.JSON, nullable=True),
        sa.Column("steps", sa.JSON, nullable=True),
        sa.Column("expected_results", sa.JSON, nullable=True),
        sa.Column("source_requirement_text", sa.Text, nullable=True),
        sa.Column("generation_timestamp", sa.String(50), nullable=True),
        sa.Column("model_version", sa.String(100), nullable=True),
        sa.Column("prompt_version", sa.String(20), nullable=True),
        sa.Column("retry_count", sa.Integer, default=0),
        sa.Column("validation_status", sa.String(50), nullable=True),
        sa.Column("rag_sources", sa.JSON, nullable=True),
        sa.Column("rag_top_score", sa.Float, default=0.0),
    )
    op.create_index("ix_test_cases_run_id", "test_cases", ["run_id"])


def downgrade() -> None:
    op.drop_index("ix_test_cases_run_id", table_name="test_cases")
    op.drop_table("test_cases")
    op.drop_index("ix_requirements_run_id", table_name="requirements")
    op.drop_table("requirements")
    op.drop_index("ix_runs_project_id", table_name="runs")
    op.drop_table("runs")
    op.drop_table("projects")
