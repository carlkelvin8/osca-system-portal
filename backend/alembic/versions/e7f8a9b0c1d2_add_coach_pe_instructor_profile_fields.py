from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'd61caf6ffd94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('suffix', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('address', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('date_of_birth', sa.Date(), nullable=True))
    op.add_column('users', sa.Column('gender', sa.String(length=20), nullable=True))
    op.add_column('users', sa.Column('employee_id', sa.String(length=50), nullable=True))
    op.add_column('users', sa.Column('department', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'department')
    op.drop_column('users', 'employee_id')
    op.drop_column('users', 'gender')
    op.drop_column('users', 'date_of_birth')
    op.drop_column('users', 'address')
    op.drop_column('users', 'suffix')
