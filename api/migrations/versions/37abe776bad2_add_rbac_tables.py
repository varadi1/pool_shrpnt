"""add_rbac_tables

Revision ID: 37abe776bad2
Revises: 1a8b26c0185b
Create Date: 2025-08-08 23:38:21.547501

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "37abe776bad2"
down_revision: str | Sequence[str] | None = "1a8b26c0185b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "role",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "group",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("azure_ad_group_id", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("azure_ad_group_id"),
    )

    op.create_table(
        "group_role_mapping",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["group.id"],
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["role.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("group_id", "role_id"),
    )

    op.create_table(
        "membership",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.String(length=255), nullable=False),
        sa.Column("group_id", sa.UUID(), nullable=False),
        sa.Column("user_principal_name", sa.String(length=255), nullable=True),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["group_id"],
            ["group.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "group_id"),
    )

    op.create_table(
        "permission_rule",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.Column("folder_type", sa.String(length=50), nullable=False),
        sa.Column("permission_level", sa.String(length=20), nullable=False),
        sa.Column("applies_to_pattern", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["role.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("role_id", "folder_type", "permission_level"),
    )

    op.create_table(
        "permission_exception",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("folder_path", sa.Text(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.Column("permission_override", sa.String(length=20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["role.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "permission_assignment",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("folder_path", sa.Text(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.Column("permission_level", sa.String(length=20), nullable=False),
        sa.Column("inheritance_broken", sa.Boolean(), default=False, nullable=False),
        sa.Column("source", sa.String(length=50), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["role.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("folder_path", "role_id"),
    )

    op.execute(
        """
        INSERT INTO role (id, name, description, priority) VALUES
        (gen_random_uuid(), 'NEU_Admin', 'NEÜ Administrator with full permissions', 100),
        (gen_random_uuid(), 'NEU_PM', 'NEÜ Project Manager with broad access', 90),
        (gen_random_uuid(), 'Partner_Admin',
         'Partner Administrator managing own company folders', 80),
        (gen_random_uuid(), 'Expert', 'External expert with specific folder access', 60),
        (gen_random_uuid(), 'NEU_QA', 'NEÜ Quality Assurance with read access', 70),
        (gen_random_uuid(), 'Pénzügyes', 'Financial role with access to financial folders only', 50)
    """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("permission_assignment")
    op.drop_table("permission_exception")
    op.drop_table("permission_rule")
    op.drop_table("membership")
    op.drop_table("group_role_mapping")
    op.drop_table("group")
    op.drop_table("role")
