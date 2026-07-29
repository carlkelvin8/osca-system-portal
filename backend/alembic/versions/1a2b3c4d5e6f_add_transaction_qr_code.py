"""Add transaction_qr_code and transaction_qr_invalidated to borrow_transactions.

Revision ID: 1a2b3c4d5e6f
Revises: f7a8b9c0d1e2
Create Date: 2026-07-26 23:50:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '1a2b3c4d5e6f'
down_revision: Union[str, None] = '0e82300a6c8d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('borrow_transactions', sa.Column(
        'transaction_qr_code', sa.String(100), nullable=True, unique=True
    ))
    op.add_column('borrow_transactions', sa.Column(
        'transaction_qr_invalidated', sa.Boolean(), nullable=False, server_default=sa.text('false')
    ))
    op.create_index('ix_borrow_transactions_qr', 'borrow_transactions', ['transaction_qr_code'])


def downgrade() -> None:
    op.drop_index('ix_borrow_transactions_qr', table_name='borrow_transactions')
    op.drop_column('borrow_transactions', 'transaction_qr_invalidated')
    op.drop_column('borrow_transactions', 'transaction_qr_code')
