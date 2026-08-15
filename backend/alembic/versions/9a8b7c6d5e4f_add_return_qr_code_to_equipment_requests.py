from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '9a8b7c6d5e4f'
down_revision: Union[str, None] = 'f3g4h5i6j7k8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('equipment_requests', sa.Column(
        'return_qr_code', sa.String(100), nullable=True, unique=True
    ))


def downgrade() -> None:
    op.drop_column('equipment_requests', 'return_qr_code')
