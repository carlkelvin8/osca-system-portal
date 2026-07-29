"""add ondelete SET NULL for scan_attempts

Revision ID: d61caf6ffd94
Revises: f2b253e4d908
Create Date: 2026-07-29 11:05:41.763095

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd61caf6ffd94'
down_revision: Union[str, None] = 'f2b253e4d908'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('scan_attempts_matched_user_id_fkey', 'scan_attempts', type_='foreignkey')
    op.create_foreign_key(
        'scan_attempts_matched_user_id_fkey', 'scan_attempts', 'users',
        ['matched_user_id'], ['id'], ondelete='SET NULL'
    )


def downgrade() -> None:
    op.drop_constraint('scan_attempts_matched_user_id_fkey', 'scan_attempts', type_='foreignkey')
    op.create_foreign_key(
        'scan_attempts_matched_user_id_fkey', 'scan_attempts', 'users',
        ['matched_user_id'], ['id']
    )
