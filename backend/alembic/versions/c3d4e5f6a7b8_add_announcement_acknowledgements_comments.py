from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    CREATE TABLE IF NOT EXISTS announcement_acknowledgements (
        id UUID NOT NULL,
        announcement_id UUID NOT NULL,
        user_id UUID NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (announcement_id) REFERENCES announcements (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)
    op.execute("""
    CREATE UNIQUE INDEX IF NOT EXISTS uq_announcement_ack_user
    ON announcement_acknowledgements (announcement_id, user_id)
    """)
    op.create_index('ix_announcement_acks_announcement', 'announcement_acknowledgements',
                    ['announcement_id'], unique=False, if_not_exists=True)
    op.create_index('ix_announcement_acks_user', 'announcement_acknowledgements',
                    ['user_id'], unique=False, if_not_exists=True)

    op.execute("""
    CREATE TABLE IF NOT EXISTS announcement_comments (
        id UUID NOT NULL,
        announcement_id UUID NOT NULL,
        user_id UUID NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (announcement_id) REFERENCES announcements (id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    )
    """)
    op.create_index('ix_announcement_comments_announcement', 'announcement_comments',
                    ['announcement_id', 'created_at'], unique=False, if_not_exists=True)
    op.create_index('ix_announcement_comments_user', 'announcement_comments',
                    ['user_id'], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_table('announcement_comments')
    op.drop_table('announcement_acknowledgements')
