from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import ENUM as PG_ENUM


revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = '9a8b7c6d5e4f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'facility_status_enum' AND e.enumlabel = 'RESERVED'
        ) THEN
            ALTER TYPE facility_status_enum ADD VALUE 'RESERVED';
        END IF;
    END $$;
    """)

    op.execute("ALTER TABLE facilities ADD COLUMN IF NOT EXISTS image VARCHAR(500)")

    status_type = PG_ENUM('PENDING', 'APPROVED', 'REJECTED', name='reservation_status_enum', create_type=False)
    op.execute("""
    CREATE TABLE IF NOT EXISTS venue_reservation_requests (
        id UUID NOT NULL,
        facility_id UUID NOT NULL,
        requester_id UUID NOT NULL,
        purpose VARCHAR(300) NOT NULL,
        reservation_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        remarks TEXT,
        status reservation_status_enum NOT NULL,
        rejection_reason TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (facility_id) REFERENCES facilities (id) ON DELETE CASCADE,
        FOREIGN KEY (requester_id) REFERENCES users (id)
    )
    """)
    op.create_index('ix_venue_reservations_facility_date', 'venue_reservation_requests', ['facility_id', 'reservation_date'], unique=False, if_not_exists=True)
    op.create_index('ix_venue_reservations_requester_id', 'venue_reservation_requests', ['requester_id'], unique=False, if_not_exists=True)
    op.create_index('ix_venue_reservations_status', 'venue_reservation_requests', ['status'], unique=False, if_not_exists=True)

    op.execute("""
    CREATE TABLE IF NOT EXISTS notifications (
        id UUID NOT NULL,
        recipient_id UUID NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) NOT NULL,
        is_read BOOLEAN NOT NULL,
        reference_type VARCHAR(50),
        reference_id UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (recipient_id) REFERENCES users (id)
    )
    """)
    op.create_index('ix_notifications_recipient_id', 'notifications', ['recipient_id'], unique=False, if_not_exists=True)
    op.create_index('ix_notifications_recipient_read', 'notifications', ['recipient_id', 'is_read'], unique=False, if_not_exists=True)


def downgrade() -> None:
    op.drop_index('ix_notifications_recipient_read', table_name='notifications', if_exists=True)
    op.drop_index('ix_notifications_recipient_id', table_name='notifications', if_exists=True)
    op.drop_table('notifications')

    op.drop_index('ix_venue_reservations_status', table_name='venue_reservation_requests', if_exists=True)
    op.drop_index('ix_venue_reservations_requester_id', table_name='venue_reservation_requests', if_exists=True)
    op.drop_index('ix_venue_reservations_facility_date', table_name='venue_reservation_requests', if_exists=True)
    op.drop_table('venue_reservation_requests')
    op.execute('DROP TYPE IF EXISTS reservation_status_enum')

    op.drop_column('facilities', 'image')

    pass
