"""performance indexes

Adds composite/secondary indexes for the queries that actually run today:
review patch lookups (run_id, test_id), workspace linkage (requirement_id), and
the project run list filtered by status and ordered by created_at. Single-column
FK indexes already exist from 0001 and the ORM.

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-21
"""

from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (index_name, table, columns)
_INDEXES = [
    ("ix_test_cases_run_id_test_id", "test_cases", ["run_id", "test_id"]),
    ("ix_test_cases_requirement_id", "test_cases", ["requirement_id"]),
    ("ix_runs_project_status_created", "runs", ["project_id", "status", "created_at"]),
    ("ix_requirements_requirement_id", "requirements", ["requirement_id"]),
]


def _existing(table: str) -> set:
    insp = inspect(op.get_bind())
    if table not in insp.get_table_names():
        return set()
    return {ix["name"] for ix in insp.get_indexes(table)}


def upgrade() -> None:
    for name, table, cols in _INDEXES:
        if name not in _existing(table):
            op.create_index(name, table, cols)


def downgrade() -> None:
    for name, table, _cols in reversed(_INDEXES):
        if name in _existing(table):
            op.drop_index(name, table_name=table)
