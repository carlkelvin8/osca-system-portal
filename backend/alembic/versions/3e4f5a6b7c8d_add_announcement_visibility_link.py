from typing import Sequence, Union

from alembic import op


revision: str = '3e4f5a6b7c8d'
down_revision: Union[str, None] = '2a3b4c5d6e7f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE announcements ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'all_dashboards'")
    op.execute("ALTER TABLE announcements ADD COLUMN IF NOT EXISTS link_url VARCHAR(500)")


def downgrade() -> None:
    op.drop_column('announcements', 'link_url')
    op.drop_column('announcements', 'visibility')
