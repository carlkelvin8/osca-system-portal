from alembic import op
import sqlalchemy as sa

revision = "c1d2e3f4a5b6"
down_revision = "b8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "announcements",
        sa.Column("tag", sa.String(20), nullable=True),
    )
    op.add_column(
        "announcements",
        sa.Column("pinned", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade() -> None:
    op.drop_column("announcements", "pinned")
    op.drop_column("announcements", "tag")
