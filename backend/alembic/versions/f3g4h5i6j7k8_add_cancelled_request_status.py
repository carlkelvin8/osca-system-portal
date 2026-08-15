from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f3g4h5i6j7k8'
down_revision: Union[str, None] = 'e7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE request_status_enum ADD VALUE 'CANCELLED'")


def downgrade() -> None:
    pass
