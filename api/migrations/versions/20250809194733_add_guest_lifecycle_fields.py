"""add guest lifecycle fields

Revision ID: 20250809194733
Revises: 342ba9494bea
Create Date: 2025-08-09 19:47:33.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20250809194733'
down_revision = '342ba9494bea'
branch_labels = None
depends_on = None


def upgrade():
    # Add lifecycle fields to guest_user table
    op.add_column('guest_user', sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('guest_user', sa.Column('extended_count', sa.Integer(), nullable=True, server_default='0'))
    op.add_column('guest_user', sa.Column('last_extended_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('guest_user', sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('guest_user', sa.Column('revoked_by', sa.String(length=255), nullable=True))
    op.add_column('guest_user', sa.Column('revocation_reason', sa.Text(), nullable=True))
    
    # Update guest status enum to include PURGED
    op.execute("ALTER TYPE gueststatus ADD VALUE IF NOT EXISTS 'purged'")
    
    # Create guest_extension table
    op.create_table('guest_extension',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('guest_user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('extended_by', sa.String(length=255), nullable=False),
        sa.Column('extended_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('previous_expiry_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('new_expiry_date', sa.DateTime(timezone=True), nullable=False),
        sa.Column('justification', sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(['guest_user_id'], ['guest_user.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_guest_extension_guest_user_id'), 'guest_extension', ['guest_user_id'], unique=False)
    
    # Create guest_lifecycle_policy table
    op.create_table('guest_lifecycle_policy',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('partner_company_id', sa.Integer(), nullable=False),
        sa.Column('default_expiry_days', sa.Integer(), nullable=False, server_default='90'),
        sa.Column('max_extensions', sa.Integer(), nullable=False, server_default='3'),
        sa.Column('extension_period_days', sa.Integer(), nullable=False, server_default='90'),
        sa.Column('auto_expire_enabled', sa.Boolean(), nullable=True, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['partner_company_id'], ['partner_company.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('partner_company_id')
    )
    op.create_index(op.f('ix_guest_lifecycle_policy_partner_company_id'), 'guest_lifecycle_policy', ['partner_company_id'], unique=True)


def downgrade():
    # Drop tables
    op.drop_index(op.f('ix_guest_lifecycle_policy_partner_company_id'), table_name='guest_lifecycle_policy')
    op.drop_table('guest_lifecycle_policy')
    op.drop_index(op.f('ix_guest_extension_guest_user_id'), table_name='guest_extension')
    op.drop_table('guest_extension')
    
    # Remove columns from guest_user table
    op.drop_column('guest_user', 'revocation_reason')
    op.drop_column('guest_user', 'revoked_by')
    op.drop_column('guest_user', 'revoked_at')
    op.drop_column('guest_user', 'last_extended_at')
    op.drop_column('guest_user', 'extended_count')
    op.drop_column('guest_user', 'expires_at')
    
    # Note: Removing enum values in PostgreSQL is complex and may require recreating the type
    # For simplicity, we leave the PURGED value in the enum during downgrade