"""add_time_based_lock_tables

Revision ID: daba34e2fea8
Revises: 37abe776bad2
Create Date: 2025-08-08

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "daba34e2fea8"
down_revision: str | None = "37abe776bad2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create lock_rule table
    op.create_table(
        "lock_rule",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_em_id", sa.Integer(), nullable=False),
        sa.Column("rule_name", sa.String(length=100), nullable=False),
        sa.Column("t_value", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_type", sa.String(length=50), nullable=False),
        sa.Column("start_offset", sa.Integer(), nullable=False),
        sa.Column("end_offset", sa.Integer(), nullable=False),
        sa.Column("permission_level", sa.String(length=20), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["order_em_id"], ["order_em.id"], name="fk_lock_rule_order_em"),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create lock_state table
    op.create_table(
        "lock_state",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("order_em_id", sa.Integer(), nullable=False),
        sa.Column("folder_path", sa.Text(), nullable=False),
        sa.Column("current_state", sa.String(length=50), nullable=False),
        sa.Column("permission_level", sa.String(length=20), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by_rule_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("is_manual_override", sa.Boolean(), nullable=False),
        sa.Column("override_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["order_em_id"], ["order_em.id"], name="fk_lock_state_order_em"),
        sa.ForeignKeyConstraint(
            ["locked_by_rule_id"], ["lock_rule.id"], name="fk_lock_state_lock_rule"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create lock_transition_log table
    op.create_table(
        "lock_transition_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("lock_rule_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("order_em_id", sa.Integer(), nullable=False),
        sa.Column("folder_path", sa.Text(), nullable=False),
        sa.Column("previous_state", sa.String(length=50), nullable=True),
        sa.Column("new_state", sa.String(length=50), nullable=False),
        sa.Column("previous_permission", sa.String(length=20), nullable=True),
        sa.Column("new_permission", sa.String(length=20), nullable=False),
        sa.Column("transition_reason", sa.Text(), nullable=True),
        sa.Column("transitioned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("evaluation_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("correlation_id", sa.String(length=100), nullable=True),
        sa.ForeignKeyConstraint(
            ["lock_rule_id"], ["lock_rule.id"], name="fk_lock_transition_log_lock_rule"
        ),
        sa.ForeignKeyConstraint(
            ["order_em_id"], ["order_em.id"], name="fk_lock_transition_log_order_em"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # Create lock_rule_template table
    op.create_table(
        "lock_rule_template",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_name", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("rules_config", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_name", name="uq_lock_rule_template_name"),
    )

    # Create indexes for better query performance
    op.create_index("ix_lock_rule_order_em_id", "lock_rule", ["order_em_id"])
    op.create_index("ix_lock_rule_is_active", "lock_rule", ["is_active"])
    op.create_index("ix_lock_state_order_em_id", "lock_state", ["order_em_id"])
    op.create_index("ix_lock_state_folder_path", "lock_state", ["folder_path"])
    op.create_index("ix_lock_transition_log_order_em_id", "lock_transition_log", ["order_em_id"])
    op.create_index(
        "ix_lock_transition_log_evaluation_run_id",
        "lock_transition_log",
        ["evaluation_run_id"],
    )


def downgrade() -> None:
    # Drop indexes
    op.drop_index("ix_lock_transition_log_evaluation_run_id", "lock_transition_log")
    op.drop_index("ix_lock_transition_log_order_em_id", "lock_transition_log")
    op.drop_index("ix_lock_state_folder_path", "lock_state")
    op.drop_index("ix_lock_state_order_em_id", "lock_state")
    op.drop_index("ix_lock_rule_is_active", "lock_rule")
    op.drop_index("ix_lock_rule_order_em_id", "lock_rule")

    # Drop tables in reverse order
    op.drop_table("lock_rule_template")
    op.drop_table("lock_transition_log")
    op.drop_table("lock_state")
    op.drop_table("lock_rule")
