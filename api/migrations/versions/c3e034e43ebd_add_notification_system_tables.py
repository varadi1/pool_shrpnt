"""add notification system tables

Revision ID: c3e034e43ebd
Revises: 3c1854edd855
Create Date: 2025-08-09 08:42:06.737586

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3e034e43ebd"
down_revision: str | Sequence[str] | None = "3c1854edd855"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create notification_template table
    op.create_table(
        "notification_template",
        sa.Column("id", sa.UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("template_key", sa.String(50), unique=True, nullable=False),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("subject_template", sa.Text),
        sa.Column("body_template", sa.Text, nullable=False),
        sa.Column("teams_card_template", sa.JSON),
        sa.Column("locale", sa.String(10), server_default="hu-HU"),
        sa.Column("active", sa.Boolean, server_default=sa.text("true")),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")
        ),
        sa.Column(
            "updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")
        ),
    )

    # Create notification_queue table
    op.create_table(
        "notification_queue",
        sa.Column("id", sa.UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "template_id", sa.UUID, sa.ForeignKey("notification_template.id"), nullable=False
        ),
        sa.Column("recipient_email", sa.String(255)),
        sa.Column("recipient_teams_id", sa.String(255)),
        sa.Column("recipient_role", sa.String(50)),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("variables", sa.JSON),
        sa.Column("priority", sa.Integer, server_default="5"),
        sa.Column("scheduled_for", sa.TIMESTAMP(timezone=True)),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("retry_count", sa.Integer, server_default="0"),
        sa.Column(
            "created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")
        ),
    )

    # Create notification_history table for de-duplication
    op.create_table(
        "notification_history",
        sa.Column("id", sa.UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("event_id", sa.UUID),
        sa.Column("recipient_id", sa.UUID),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column(
            "sent_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")
        ),
        sa.Column("dedup_key", sa.String(255), nullable=False),
        sa.Column("content_hash", sa.String(64)),
    )

    # Create notification_log table for delivery tracking
    op.create_table(
        "notification_log",
        sa.Column("id", sa.UUID, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("notification_type", sa.String(50), nullable=False),
        sa.Column("recipient_email", sa.String(255)),
        sa.Column("recipient_teams_id", sa.String(255)),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column(
            "sent_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")
        ),
        sa.Column("delivered_at", sa.TIMESTAMP(timezone=True)),
        sa.Column("delivery_status", sa.String(20), server_default="pending"),
        sa.Column("retry_count", sa.Integer, server_default="0"),
        sa.Column("error_message", sa.Text),
        sa.Column("related_entity_id", sa.UUID),
        sa.Column("correlation_id", sa.UUID),
    )

    # Create indexes for performance
    op.create_index("idx_notification_queue_status", "notification_queue", ["status"])
    op.create_index("idx_notification_queue_scheduled", "notification_queue", ["scheduled_for"])
    op.create_index(
        "idx_notification_history_dedup", "notification_history", ["dedup_key", "sent_at"]
    )
    op.create_index("idx_notification_log_correlation", "notification_log", ["correlation_id"])
    op.create_index("idx_notification_log_status", "notification_log", ["delivery_status"])


def downgrade() -> None:
    """Downgrade schema."""
    # Drop indexes
    op.drop_index("idx_notification_log_status")
    op.drop_index("idx_notification_log_correlation")
    op.drop_index("idx_notification_history_dedup")
    op.drop_index("idx_notification_queue_scheduled")
    op.drop_index("idx_notification_queue_status")

    # Drop tables
    op.drop_table("notification_log")
    op.drop_table("notification_history")
    op.drop_table("notification_queue")
    op.drop_table("notification_template")
