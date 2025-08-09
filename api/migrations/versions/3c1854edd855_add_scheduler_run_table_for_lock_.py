"""add_scheduler_run_table_for_lock_evaluation

Revision ID: 3c1854edd855
Revises: 070c85858b05
Create Date: 2025-08-09 07:10:50.921006

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "3c1854edd855"
down_revision: str | Sequence[str] | None = "070c85858b05"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "scheduler_run",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("run_type", sa.String(length=50), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ems_processed", sa.Integer(), nullable=True),
        sa.Column("ems_failed", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("lock_id", sa.String(length=100), nullable=True),
        sa.Column("worker_id", sa.String(length=100), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(
        "idx_scheduler_run_status", "scheduler_run", ["status", "started_at"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("idx_scheduler_run_status", table_name="scheduler_run")
    op.drop_table("scheduler_run")
