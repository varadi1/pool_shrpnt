"""merge guest branches

Revision ID: 342ba9494bea
Revises: 20250809153438, 263993264365
Create Date: 2025-08-09 15:35:57.715110

"""
from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "342ba9494bea"
down_revision: str | Sequence[str] | None = ("20250809153438", "263993264365")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
