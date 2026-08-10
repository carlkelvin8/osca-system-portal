"""add image_urls to announcements

Revision ID: d7e8f9a0b1c2
Revises: c3d4e5f6a7b8
Create Date: 2026-08-09 12:00:00.000000

Adds a JSONB `image_urls` column so announcements can hold multiple images.
Existing single-image announcements keep using `image_url` (mirrored as the
first entry when image_urls is NULL).
"""
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
