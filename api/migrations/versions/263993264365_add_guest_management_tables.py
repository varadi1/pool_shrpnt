"""add_guest_management_tables

Revision ID: 263993264365
Revises: daba34e2fea8
Create Date: 2025-08-09

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "263993264365"
down_revision: str | None = "daba34e2fea8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Create guest_user table
    op.create_table(
        "guest_user",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=255), nullable=True),
        sa.Column("azure_ad_id", sa.String(length=255), nullable=True),
        sa.Column("partner_company_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum("pending", "invited", "accepted", "expired", "revoked", name="gueststatus"),
            nullable=False,
        ),
        sa.Column("invited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["partner_company_id"], ["partner_company.id"], name="fk_guest_user_partner_company"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_guest_user_azure_ad_id"), "guest_user", ["azure_ad_id"], unique=True)
    op.create_index(op.f("ix_guest_user_email"), "guest_user", ["email"], unique=True)

    # Create guest_invitation table
    op.create_table(
        "guest_invitation",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("guest_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invitation_id", sa.String(length=255), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False),
        sa.Column("redeem_url", sa.Text(), nullable=True),
        sa.Column("error_details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["guest_user_id"], ["guest_user.id"], name="fk_guest_invitation_guest_user"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_guest_invitation_invitation_id"),
        "guest_invitation",
        ["invitation_id"],
        unique=True,
    )

    # Create guest_group_assignment table
    op.create_table(
        "guest_group_assignment",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("guest_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("group_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assigned_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("assigned_by", sa.String(length=255), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removed_by", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(
            ["guest_user_id"], ["guest_user.id"], name="fk_guest_group_assignment_guest_user"
        ),
        sa.ForeignKeyConstraint(["group_id"], ["group.id"], name="fk_guest_group_assignment_group"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_table("guest_group_assignment")
    op.drop_index(op.f("ix_guest_invitation_invitation_id"), table_name="guest_invitation")
    op.drop_table("guest_invitation")
    op.drop_index(op.f("ix_guest_user_email"), table_name="guest_user")
    op.drop_index(op.f("ix_guest_user_azure_ad_id"), table_name="guest_user")
    op.drop_table("guest_user")
    # Drop enum type
    op.execute("DROP TYPE IF EXISTS gueststatus")
