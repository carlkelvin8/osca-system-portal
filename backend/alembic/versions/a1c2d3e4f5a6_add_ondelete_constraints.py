"""add ON DELETE constraints to 20+ foreign keys

Revision ID: a1c2d3e4f5a6
Revises: 4f5a6b7c8d9e
Create Date: 2026-08-17
"""
from alembic import op

revision = "a1c2d3e4f5a6"
down_revision = "4f5a6b7c8d9e"
branch_labels = None
depends_on = None


FK_ALTERATIONS = [
    # (table, column, ref_table, ref_column, ondelete)
    ("venue_reservation_requests", "requester_id", "users", "id", "SET NULL"),
    ("announcements", "created_by_id", "users", "id", "SET NULL"),
    ("incidents", "reported_by_id", "users", "id", "SET NULL"),
    ("incidents", "involved_student_id", "users", "id", "SET NULL"),
    ("incidents", "involved_facility_id", "facilities", "id", "SET NULL"),
    ("incidents", "resolved_by_id", "users", "id", "SET NULL"),
    ("sanctions", "issued_by_id", "users", "id", "SET NULL"),
    ("offline_sync_records", "user_id", "users", "id", "SET NULL"),
    ("equipment", "created_by_id", "users", "id", "SET NULL"),
    ("borrow_transactions", "borrowing_id_record_id", "borrowing_ids", "id", "CASCADE"),
    ("borrow_transactions", "instructor_id", "users", "id", "SET NULL"),
    ("borrow_transactions", "processed_by_id", "users", "id", "SET NULL"),
    ("borrow_transaction_items", "equipment_id", "equipment", "id", "RESTRICT"),
    ("equipment_requests", "requester_id", "users", "id", "SET NULL"),
    ("equipment_requests", "approved_by_id", "users", "id", "SET NULL"),
    ("equipment_request_items", "equipment_id", "equipment", "id", "RESTRICT"),
    ("sessions", "created_by_id", "users", "id", "SET NULL"),
    ("attendance_records", "session_id", "sessions", "id", "CASCADE"),
    ("notifications", "recipient_id", "users", "id", "CASCADE"),
    ("facility_schedules", "booked_by_id", "users", "id", "SET NULL"),
    ("athlete_eligibility", "cleared_by_id", "users", "id", "SET NULL"),
    ("athlete_eligibility", "created_by_id", "users", "id", "SET NULL"),
]


def _drop_and_recreate_fk(table: str, column: str, ref_table: str, ref_column: str, ondelete: str) -> None:
    """Find existing FK on (table, column) referencing (ref_table, ref_column), drop it, recreate with ON DELETE."""
    # pg_get_constraintdef returns e.g. "FOREIGN KEY (col) REFERENCES ref(id)" — so match with parens
    like_pattern = f"%{column}%{ref_table}({ref_column})%"
    sql = f"""
    DO $$ DECLARE r RECORD; BEGIN
    SELECT conname INTO r FROM pg_constraint
    WHERE conrelid = '{table}'::regclass AND contype = 'f'
    AND pg_get_constraintdef(oid) LIKE '{like_pattern}'
    LIMIT 1;
    IF r.conname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE {table} DROP CONSTRAINT ' || quote_ident(r.conname);
    END IF; END $$;
    """
    op.execute(sql)
    fkey_name = f"fk_{table}_{column}"
    op.execute(
        f"ALTER TABLE {table} ADD CONSTRAINT {fkey_name} "
        f"FOREIGN KEY ({column}) REFERENCES {ref_table}({ref_column}) ON DELETE {ondelete}"
    )


def upgrade() -> None:
    for table, column, ref_table, ref_column, ondelete in FK_ALTERATIONS:
        _drop_and_recreate_fk(table, column, ref_table, ref_column, ondelete)


def downgrade() -> None:
    """Revert ON DELETE to DB default (NO ACTION)."""
    for table, column, ref_table, ref_column, _ondelete in FK_ALTERATIONS:
        fkey_name = f"fk_{table}_{column}"
        op.execute(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {fkey_name}")
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {fkey_name} "
            f"FOREIGN KEY ({column}) REFERENCES {ref_table}({ref_column})"
        )
