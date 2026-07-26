"""enhance_audit_logs

Revision ID: f7a8b9c0d1e2
Revises: e5f6a7b8c9d0
Create Date: 2026-07-26 23:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('audit_logs', sa.Column('admin_name', sa.String(length=200), nullable=True))
    op.add_column('audit_logs', sa.Column('admin_email', sa.String(length=255), nullable=True))
    op.add_column('audit_logs', sa.Column('admin_role', sa.String(length=50), nullable=True))
    op.add_column('audit_logs', sa.Column('module', sa.String(length=50), nullable=True))
    op.add_column('audit_logs', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('audit_logs', sa.Column('previous_values', postgresql.JSONB(), nullable=True))
    op.add_column('audit_logs', sa.Column('new_values', postgresql.JSONB(), nullable=True))
    op.add_column('audit_logs', sa.Column('browser', sa.String(length=100), nullable=True))
    op.add_column('audit_logs', sa.Column('os', sa.String(length=100), nullable=True))
    op.add_column('audit_logs', sa.Column('device_info', sa.String(length=200), nullable=True))
    op.add_column('audit_logs', sa.Column('session_id', sa.String(length=100), nullable=True))
    op.add_column('audit_logs', sa.Column('request_url', sa.String(length=500), nullable=True))
    op.add_column('audit_logs', sa.Column('http_method', sa.String(length=10), nullable=True))

    op.create_index('ix_audit_module', 'audit_logs', ['module'])
    op.create_index('ix_audit_status', 'audit_logs', ['status'])
    op.create_index('ix_audit_ip', 'audit_logs', ['ip_address'])
    op.create_index('ix_audit_created_action', 'audit_logs', ['created_at', 'action'])


def downgrade() -> None:
    op.drop_index('ix_audit_created_action', table_name='audit_logs')
    op.drop_index('ix_audit_ip', table_name='audit_logs')
    op.drop_index('ix_audit_status', table_name='audit_logs')
    op.drop_index('ix_audit_module', table_name='audit_logs')

    op.drop_column('audit_logs', 'http_method')
    op.drop_column('audit_logs', 'request_url')
    op.drop_column('audit_logs', 'session_id')
    op.drop_column('audit_logs', 'device_info')
    op.drop_column('audit_logs', 'os')
    op.drop_column('audit_logs', 'browser')
    op.drop_column('audit_logs', 'new_values')
    op.drop_column('audit_logs', 'previous_values')
    op.drop_column('audit_logs', 'description')
    op.drop_column('audit_logs', 'module')
    op.drop_column('audit_logs', 'admin_role')
    op.drop_column('audit_logs', 'admin_email')
    op.drop_column('audit_logs', 'admin_name')
