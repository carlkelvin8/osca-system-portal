from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f287b542dcb4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("equipment", "barcode", new_column_name="qr_code")
    op.alter_column("equipment", "barcode_image_key", new_column_name="qr_image_key")

    op.drop_index("ix_equipment_barcode", table_name="equipment", if_exists=True)
    op.create_index("ix_equipment_qr_code", "equipment", ["qr_code"], unique=True)

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE request_status_enum AS ENUM ('pending', 'approved', 'rejected');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;
    """)

    request_status = postgresql.ENUM(
        "pending", "approved", "rejected",
        name="request_status_enum",
        create_type=False,
    )
    op.create_table(
        "equipment_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("requester_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column(
            "status",
            request_status,
            nullable=False,
            server_default="pending",
        ),
        sa.Column("expected_return", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("approved_by_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_equipment_requests_requester", "equipment_requests", ["requester_id"])
    op.create_index("ix_equipment_requests_status", "equipment_requests", ["status"])

    op.create_table(
        "equipment_request_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "request_id",
            sa.UUID(),
            sa.ForeignKey("equipment_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("equipment_id", sa.UUID(), sa.ForeignKey("equipment.id"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_equipment_request_items_request", "equipment_request_items", ["request_id"])

    op.create_table(
        "announcements",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("event_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_by_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_announcements_event_date", "announcements", ["event_date"])
    op.create_index("ix_announcements_is_active", "announcements", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_announcements_is_active", table_name="announcements")
    op.drop_index("ix_announcements_event_date", table_name="announcements")
    op.drop_table("announcements")

    op.drop_index("ix_equipment_request_items_request", table_name="equipment_request_items")
    op.drop_table("equipment_request_items")

    op.drop_index("ix_equipment_requests_status", table_name="equipment_requests")
    op.drop_index("ix_equipment_requests_requester", table_name="equipment_requests")
    op.drop_table("equipment_requests")

    op.execute("DROP TYPE IF EXISTS request_status_enum")

    op.drop_index("ix_equipment_qr_code", table_name="equipment")
    op.create_index("ix_equipment_barcode", "equipment", ["barcode"], unique=True)
    op.alter_column("equipment", "qr_code", new_column_name="barcode")
    op.alter_column("equipment", "qr_image_key", new_column_name="barcode_image_key")
