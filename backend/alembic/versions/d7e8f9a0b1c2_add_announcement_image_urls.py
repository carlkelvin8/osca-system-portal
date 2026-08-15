from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'd7e8f9a0b1c2'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_urls JSONB")


def downgrade() -> None:
    op.drop_column('announcements', 'image_urls')
