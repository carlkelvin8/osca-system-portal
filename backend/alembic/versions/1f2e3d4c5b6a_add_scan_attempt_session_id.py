"""add session_id to scan_attempts

Revision ID: 1f2e3d4c5b6a
Revises: d7e8f9a0b1c2
Create Date: 2026-08-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '1f2e3d4c5b6a'
down_revision: Union[str, None] = 'd7e8f9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'scan_attempts',
        sa.Column('session_id', sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        'scan_attempts_session_id_fkey', 'scan_attempts', 'sessions',
        ['session_id'], ['id'], ondelete='CASCADE'
    )
    op.create_index('ix_scan_attempts_session', 'scan_attempts', ['session_id'])


def downgrade() -> None:
    op.drop_index('ix_scan_attempts_session', table_name='scan_attempts')
    op.drop_constraint('scan_attempts_session_id_fkey', 'scan_attempts', type_='foreignkey')
    op.drop_column('scan_attempts', 'session_id')
