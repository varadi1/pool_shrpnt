"""add_change_request_tables_for_cr_unlock

Revision ID: fe4b8845e25c
Revises: c3e034e43ebd
Create Date: 2025-08-09 13:37:00.229182

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "fe4b8845e25c"
down_revision: str | Sequence[str] | None = "c3e034e43ebd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create change_request table
    op.create_table(
        "change_request",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("em_id", sa.Integer(), nullable=False),
        sa.Column("scope", sa.String(50), nullable=False),  # 'experts' or 'deliverables'
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("closed_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "status", sa.String(20), nullable=False, server_default="active"
        ),  # 'active', 'expired', 'closed'
        sa.Column("audit_correlation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("duration_hours", sa.Integer(), nullable=False, server_default="48"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["em_id"], ["order_em.id"], ondelete="CASCADE")
        # TODO: Re-enable FKs when user_account table is properly set up
        # sa.ForeignKeyConstraint(['created_by'], ['user_account.id']),
        # sa.ForeignKeyConstraint(['closed_by'], ['user_account.id'])
    )

    # Create indexes for change_request table
    op.create_index(
        "idx_cr_expiry",
        "change_request",
        ["expires_at"],
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_index("idx_cr_em", "change_request", ["em_id"])
    op.create_index("idx_cr_status", "change_request", ["status"])
    op.create_index("idx_cr_em_scope_status", "change_request", ["em_id", "scope", "status"])

    # Extend lock_state table with CR-specific fields
    op.add_column("lock_state", sa.Column("cr_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column(
        "lock_state", sa.Column("cr_expires_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("lock_state", sa.Column("cr_reason", sa.Text(), nullable=True))

    # Add foreign key constraint for cr_id
    op.create_foreign_key(
        "fk_lock_state_cr_id",
        "lock_state",
        "change_request",
        ["cr_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Create index for CR-related lock states
    op.create_index(
        "idx_lock_state_cr_id",
        "lock_state",
        ["cr_id"],
        postgresql_where=sa.text("cr_id IS NOT NULL"),
    )

    # Create CR audit event types in audit_log if not exists
    # This assumes audit_log table exists from previous stories
    # NOTE: Commented out as audit_event_type table doesn't exist yet
    # op.execute("""
    #     INSERT INTO audit_event_type (code, description, category)
    #     VALUES
    #         ('CR_OPENED', 'Change request opened for temporary unlock', 'lock'),
    #         ('CR_EXPIRES', 'Change request expired and folders re-locked', 'lock'),
    #         ('CR_CLOSED', 'Change request manually closed', 'lock')
    #     ON CONFLICT (code) DO NOTHING
    # """)


def downgrade() -> None:
    """Downgrade schema."""
    # Remove CR audit event types
    # NOTE: Commented out as audit_event_type table doesn't exist yet
    # op.execute("""
    #     DELETE FROM audit_event_type
    #     WHERE code IN ('CR_OPENED', 'CR_EXPIRES', 'CR_CLOSED')
    # """)

    # Drop indexes from lock_state
    op.drop_index("idx_lock_state_cr_id", "lock_state")

    # Drop foreign key and columns from lock_state
    op.drop_constraint("fk_lock_state_cr_id", "lock_state", type_="foreignkey")
    op.drop_column("lock_state", "cr_reason")
    op.drop_column("lock_state", "cr_expires_at")
    op.drop_column("lock_state", "cr_id")

    # Drop indexes from change_request
    op.drop_index("idx_cr_em_scope_status", "change_request")
    op.drop_index("idx_cr_status", "change_request")
    op.drop_index("idx_cr_em", "change_request")
    op.drop_index("idx_cr_expiry", "change_request")

    # Drop change_request table
    op.drop_table("change_request")
