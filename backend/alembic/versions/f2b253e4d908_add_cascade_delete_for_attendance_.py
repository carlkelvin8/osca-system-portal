"""add cascade delete for attendance_records

Revision ID: f2b253e4d908
Revises: 1a2b3c4d5e6f
Create Date: 2026-07-29 11:02:45.526600

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f2b253e4d908'
down_revision: Union[str, None] = '1a2b3c4d5e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint('attendance_records_student_id_fkey', 'attendance_records', type_='foreignkey')
    op.create_foreign_key(
        'attendance_records_student_id_fkey', 'attendance_records', 'users',
        ['student_id'], ['id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint('attendance_records_student_id_fkey', 'attendance_records', type_='foreignkey')
    op.create_foreign_key(
        'attendance_records_student_id_fkey', 'attendance_records', 'users',
        ['student_id'], ['id']
    )
