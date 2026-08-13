"""add ip_address and device to attendance_records

Revision ID: 2a3b4c5d6e7f
Revises: 1f2e3d4c5b6a
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2a3b4c5d6e7f'
down_revision: Union[str, None] = '1f2e3d4c5b6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'attendance_records',
        sa.Column('ip_address', sa.String(length=45), nullable=True),
    )
    op.add_column(
        'attendance_records',
        sa.Column('device', sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('attendance_records', 'device')
    op.drop_column('attendance_records', 'ip_address')
