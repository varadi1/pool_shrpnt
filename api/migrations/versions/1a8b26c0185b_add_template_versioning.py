"""add_template_versioning

Revision ID: 1a8b26c0185b
Revises: 84a918765626
Create Date: 2025-08-08 23:24:10.547963

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "1a8b26c0185b"
down_revision: str | Sequence[str] | None = "84a918765626"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Create folder_template_version table first (as folder_template will reference it)
    op.create_table(
        "folder_template_version",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", sa.Integer(), nullable=False),
        sa.Column("version", sa.String(length=20), nullable=False),
        sa.Column("content", sa.JSON(), nullable=False),
        sa.Column("author_id", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("change_description", sa.Text(), nullable=True),
        sa.Column("parent_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("folder_structure", sa.JSON(), nullable=False),
        sa.Column("permissions_template", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(
            ["parent_version_id"],
            ["folder_template_version.id"],
        ),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["folder_template.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("template_id", "version", name="uq_template_version"),
    )
    op.create_index(
        op.f("ix_folder_template_version_template_id"),
        "folder_template_version",
        ["template_id"],
        unique=False,
    )

    # Add new columns to folder_template
    op.add_column(
        "folder_template",
        sa.Column("version_number", sa.String(length=20), nullable=False, server_default="1.0.0"),
    )
    op.add_column(
        "folder_template",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
    )
    op.add_column(
        "folder_template",
        sa.Column("parent_version_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "folder_template",
        sa.Column("is_current", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    # Add foreign key constraint for parent_version_id
    op.create_foreign_key(
        "fk_folder_template_parent_version",
        "folder_template",
        "folder_template_version",
        ["parent_version_id"],
        ["id"],
    )

    # Add unique constraint for template name and version
    op.create_unique_constraint(
        "uq_template_name_version", "folder_template", ["name", "version_number"]
    )

    # Add template_version_id to order_em table to lock template version at provisioning
    op.add_column(
        "order_em", sa.Column("template_version_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_order_em_template_version",
        "order_em",
        "folder_template_version",
        ["template_version_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    # Remove order_em changes
    op.drop_constraint("fk_order_em_template_version", "order_em", type_="foreignkey")
    op.drop_column("order_em", "template_version_id")

    # Remove unique constraint
    op.drop_constraint("uq_template_name_version", "folder_template", type_="unique")

    # Remove foreign key constraint
    op.drop_constraint("fk_folder_template_parent_version", "folder_template", type_="foreignkey")

    # Remove columns from folder_template
    op.drop_column("folder_template", "is_current")
    op.drop_column("folder_template", "parent_version_id")
    op.drop_column("folder_template", "status")
    op.drop_column("folder_template", "version_number")

    # Drop folder_template_version table
    op.drop_index(
        op.f("ix_folder_template_version_template_id"), table_name="folder_template_version"
    )
    op.drop_table("folder_template_version")
