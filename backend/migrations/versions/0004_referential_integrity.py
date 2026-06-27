"""referential integrity

Adds ON DELETE CASCADE foreign keys across the project -> run -> {requirement,
test_case, review_event} tree. ``provider_keys`` and ``app_config`` are global
(not project-scoped) and intentionally stay outside the cascade.

Pre-existing orphan rows (e.g. left behind by the old ``delete_project`` which
removed only the project row) are deleted first, top-down, so FK creation cannot
fail. SQLite cannot add a constraint in place, so ``batch_alter_table`` is used —
it transparently rebuilds the table copying data on SQLite and emits a plain
ALTER on PostgreSQL.

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-21
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Order matters: clean from the leaves' parents downward so each delete removes
# rows whose parent is already known-missing.
_ORPHAN_CLEANUP = [
    "DELETE FROM runs WHERE project_id NOT IN (SELECT id FROM projects)",
    "DELETE FROM requirements WHERE run_id NOT IN (SELECT id FROM runs)",
    "DELETE FROM test_cases WHERE run_id NOT IN (SELECT id FROM runs)",
    "DELETE FROM review_events WHERE run_id NOT IN (SELECT id FROM runs)",
    "DELETE FROM review_events WHERE test_case_id NOT IN (SELECT id FROM test_cases)",
]

# (table, fk_name, referred_table, local_cols, referred_cols)
_FOREIGN_KEYS = [
    ("runs", "fk_runs_project_id", "projects", ["project_id"], ["id"]),
    ("requirements", "fk_requirements_run_id", "runs", ["run_id"], ["id"]),
    ("test_cases", "fk_test_cases_run_id", "runs", ["run_id"], ["id"]),
    ("review_events", "fk_review_events_run_id", "runs", ["run_id"], ["id"]),
    ("review_events", "fk_review_events_test_case_id", "test_cases", ["test_case_id"], ["id"]),
]


def upgrade() -> None:
    bind = op.get_bind()
    for stmt in _ORPHAN_CLEANUP:
        bind.execute(sa.text(stmt))

    for table, fk_name, ref_table, local, referred in _FOREIGN_KEYS:
        with op.batch_alter_table(table, schema=None) as batch:
            batch.create_foreign_key(
                fk_name, ref_table, local, referred, ondelete="CASCADE",
            )


def downgrade() -> None:
    for table, fk_name, *_ in reversed(_FOREIGN_KEYS):
        with op.batch_alter_table(table, schema=None) as batch:
            batch.drop_constraint(fk_name, type_="foreignkey")
