"""Add manual locks and SharePoint sync fields

Revision ID: 070c85858b05
Revises: daba34e2fea8
Create Date: 2025-08-09 00:18:17.205852

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "070c85858b05"
down_revision: str | Sequence[str] | None = "daba34e2fea8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add new columns to permission_assignment table
    op.add_column("permission_assignment", sa.Column("resource_path", sa.Text(), nullable=True))
    op.add_column("permission_assignment", sa.Column("resource_id", sa.String(255), nullable=True))
    op.add_column(
        "permission_assignment",
        sa.Column("resource_type", sa.String(50), default="sharepoint_folder"),
    )
    op.add_column(
        "permission_assignment", sa.Column("granted_to_id", sa.String(255), nullable=True)
    )
    op.add_column(
        "permission_assignment", sa.Column("granted_to_type", sa.String(20), nullable=True)
    )
    op.add_column(
        "permission_assignment", sa.Column("permission_type", sa.String(20), nullable=True)
    )
    op.add_column(
        "permission_assignment",
        sa.Column("requires_unique_permissions", sa.Boolean(), default=False),
    )
    op.add_column(
        "permission_assignment", sa.Column("sharepoint_sync_status", sa.String(20), nullable=True)
    )
    op.add_column(
        "permission_assignment",
        sa.Column("last_sync_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("permission_assignment", sa.Column("sync_error", sa.Text(), nullable=True))
    op.add_column("permission_assignment", sa.Column("is_locked", sa.Boolean(), default=False))
    op.add_column(
        "permission_assignment",
        sa.Column("lock_applied_at", sa.DateTime(timezone=True), nullable=True),
    )

    # Update lock_state table for manual locks
    op.add_column("lock_state", sa.Column("folder_id", sa.UUID(), nullable=True))
    op.add_column("lock_state", sa.Column("locked_by", sa.UUID(), nullable=True))
    op.add_column(
        "lock_state",
        sa.Column("lock_type", sa.String(20), nullable=False, server_default="automatic"),
    )
    op.add_column("lock_state", sa.Column("lock_reason", sa.Text(), nullable=True))
    op.add_column("lock_state", sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "lock_state", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true")
    )
    op.add_column("lock_state", sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("lock_state", sa.Column("removed_by", sa.UUID(), nullable=True))
    op.add_column("lock_state", sa.Column("removal_reason", sa.Text(), nullable=True))
    op.add_column(
        "lock_state", sa.Column("last_extended_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("lock_state", sa.Column("last_extended_by", sa.UUID(), nullable=True))

    # Make order_em_id nullable for manual locks
    op.alter_column("lock_state", "order_em_id", nullable=True)
    op.alter_column("lock_state", "current_state", nullable=True)
    op.alter_column("lock_state", "permission_level", nullable=True)

    # Update existing data
    op.execute(
        "UPDATE permission_assignment SET resource_path = folder_path WHERE resource_path IS NULL"
    )
    op.execute("UPDATE lock_state SET folder_id = gen_random_uuid() WHERE folder_id IS NULL")

    # Now make required columns non-nullable
    op.alter_column("permission_assignment", "resource_path", nullable=False)
    op.alter_column("lock_state", "folder_id", nullable=False)

    # Create index for better query performance
    op.create_index(
        "ix_permission_assignment_sync_status", "permission_assignment", ["sharepoint_sync_status"]
    )
    op.create_index("ix_lock_state_folder_id_active", "lock_state", ["folder_id", "is_active"])


def downgrade() -> None:
    """Downgrade schema."""
    # Drop indexes
    op.drop_index("ix_lock_state_folder_id_active", "lock_state")
    op.drop_index("ix_permission_assignment_sync_status", "permission_assignment")

    # Remove columns from permission_assignment
    op.drop_column("permission_assignment", "lock_applied_at")
    op.drop_column("permission_assignment", "is_locked")
    op.drop_column("permission_assignment", "sync_error")
    op.drop_column("permission_assignment", "last_sync_at")
    op.drop_column("permission_assignment", "sharepoint_sync_status")
    op.drop_column("permission_assignment", "requires_unique_permissions")
    op.drop_column("permission_assignment", "permission_type")
    op.drop_column("permission_assignment", "granted_to_type")
    op.drop_column("permission_assignment", "granted_to_id")
    op.drop_column("permission_assignment", "resource_type")
    op.drop_column("permission_assignment", "resource_id")
    op.drop_column("permission_assignment", "resource_path")

    # Remove columns from lock_state
    op.drop_column("lock_state", "last_extended_by")
    op.drop_column("lock_state", "last_extended_at")
    op.drop_column("lock_state", "removal_reason")
    op.drop_column("lock_state", "removed_by")
    op.drop_column("lock_state", "removed_at")
    op.drop_column("lock_state", "is_active")
    op.drop_column("lock_state", "expires_at")
    op.drop_column("lock_state", "lock_reason")
    op.drop_column("lock_state", "lock_type")
    op.drop_column("lock_state", "locked_by")
    op.drop_column("lock_state", "folder_id")

    # Revert nullable columns
    op.alter_column("lock_state", "permission_level", nullable=False)
    op.alter_column("lock_state", "current_state", nullable=False)
    op.alter_column("lock_state", "order_em_id", nullable=False)
