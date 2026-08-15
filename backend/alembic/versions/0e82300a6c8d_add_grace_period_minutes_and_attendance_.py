from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0e82300a6c8d'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('announcements', 'tag',
               existing_type=sa.VARCHAR(length=20),
               comment='Optional tag: urgent, event, or notice',
               existing_nullable=True)
    op.add_column('attendance_records', sa.Column('status', sa.String(length=20), nullable=True, comment='present, late, absent'))
    op.alter_column('audit_logs', 'module',
               existing_type=sa.VARCHAR(length=50),
               comment='e.g. Auth, Users, Attendance, Inventory, Settings',
               existing_nullable=True)
    op.create_index(op.f('ix_audit_logs_ip_address'), 'audit_logs', ['ip_address'], unique=False)
    op.create_index(op.f('ix_audit_logs_module'), 'audit_logs', ['module'], unique=False)
    op.add_column('sessions', sa.Column('grace_period_minutes', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('sessions', 'grace_period_minutes')
    op.drop_index(op.f('ix_audit_logs_module'), table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_ip_address'), table_name='audit_logs')
    op.alter_column('audit_logs', 'module',
               existing_type=sa.VARCHAR(length=50),
               comment=None,
               existing_comment='e.g. Auth, Users, Attendance, Inventory, Settings',
               existing_nullable=True)
    op.drop_column('attendance_records', 'status')
    op.alter_column('announcements', 'tag',
               existing_type=sa.VARCHAR(length=20),
               comment=None,
               existing_comment='Optional tag: urgent, event, or notice',
               existing_nullable=True)
