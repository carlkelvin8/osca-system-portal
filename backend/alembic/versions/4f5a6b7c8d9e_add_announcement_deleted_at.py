from typing import Sequence, Union

from alembic import op


revision: str = '4f5a6b7c8d9e'
down_revision: Union[str, None] = '3e4f5a6b7c8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE announcements ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE")
    op.execute("CREATE INDEX IF NOT EXISTS ix_announcements_deleted_at ON announcements (deleted_at)")


def downgrade() -> None:
    op.drop_index('ix_announcements_deleted_at', table_name='announcements')
    op.drop_column('announcements', 'deleted_at')
