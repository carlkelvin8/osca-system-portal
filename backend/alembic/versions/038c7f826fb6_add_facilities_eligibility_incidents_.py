from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '038c7f826fb6'
down_revision: Union[str, None] = 'b2c3d4e5f6g7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('facilities',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('location', sa.String(length=200), nullable=True),
    sa.Column('capacity', sa.Integer(), nullable=True),
    sa.Column('status', sa.Enum('AVAILABLE', 'IN_USE', 'MAINTENANCE', 'CLOSED', name='facility_status_enum'), nullable=False),
    sa.Column('condition', sa.Enum('EXCELLENT', 'GOOD', 'FAIR', 'POOR', 'NEEDS_REPAIR', name='facility_condition_enum'), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_index('ix_facilities_status', 'facilities', ['status'], unique=False)
    op.create_table('athlete_eligibility',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('student_id', sa.UUID(), nullable=False),
    sa.Column('status', sa.Enum('ELIGIBLE', 'RESTRICTED', 'INELIGIBLE', 'PENDING_CLEARANCE', name='eligibility_status_enum'), nullable=False),
    sa.Column('reason_type', sa.Enum('INJURY', 'MEDICAL', 'DISCIPLINARY', 'ACADEMIC', 'OTHER', name='eligibility_reason_enum'), nullable=True),
    sa.Column('reason_detail', sa.Text(), nullable=True),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=True),
    sa.Column('medical_clearance', sa.Boolean(), nullable=False),
    sa.Column('cleared_by_id', sa.UUID(), nullable=True),
    sa.Column('cleared_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('is_current', sa.Boolean(), nullable=False),
    sa.Column('created_by_id', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['cleared_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_eligibility_status', 'athlete_eligibility', ['status'], unique=False)
    op.create_index('ix_eligibility_student', 'athlete_eligibility', ['student_id', 'is_current'], unique=False)
    op.create_table('facility_schedules',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('facility_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('scheduled_date', sa.Date(), nullable=False),
    sa.Column('start_time', sa.Time(), nullable=False),
    sa.Column('end_time', sa.Time(), nullable=False),
    sa.Column('booked_by_id', sa.UUID(), nullable=True),
    sa.Column('sport_or_activity', sa.String(length=100), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['booked_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['facility_id'], ['facilities.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_facility_schedules_date', 'facility_schedules', ['facility_id', 'scheduled_date'], unique=False)
    op.create_table('incidents',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('category', sa.Enum('INJURY', 'EQUIPMENT_DAMAGE', 'FACILITY_DAMAGE', 'BEHAVIORAL', 'SAFETY', 'OTHER', name='incident_category_enum'), nullable=False),
    sa.Column('severity', sa.Enum('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', name='incident_severity_enum'), nullable=False),
    sa.Column('status', sa.Enum('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED', name='incident_status_enum'), nullable=False),
    sa.Column('incident_date', sa.DateTime(timezone=True), nullable=False),
    sa.Column('location', sa.String(length=200), nullable=True),
    sa.Column('reported_by_id', sa.UUID(), nullable=False),
    sa.Column('involved_student_id', sa.UUID(), nullable=True),
    sa.Column('involved_facility_id', sa.UUID(), nullable=True),
    sa.Column('resolution', sa.Text(), nullable=True),
    sa.Column('resolved_by_id', sa.UUID(), nullable=True),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['involved_facility_id'], ['facilities.id'], ),
    sa.ForeignKeyConstraint(['involved_student_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['reported_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['resolved_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_incidents_category', 'incidents', ['category'], unique=False)
    op.create_index('ix_incidents_status', 'incidents', ['status'], unique=False)
    op.create_index('ix_incidents_student', 'incidents', ['involved_student_id'], unique=False)
    op.create_table('offline_sync_records',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('device_id', sa.String(length=200), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('record_type', sa.Enum('ATTENDANCE', 'INVENTORY_TRANSACTION', name='sync_record_type_enum'), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('local_timestamp', sa.DateTime(timezone=True), nullable=False),
    sa.Column('status', sa.Enum('PENDING', 'SYNCED', 'CONFLICT', 'FAILED', name='sync_status_enum'), nullable=False),
    sa.Column('sync_attempts', sa.Integer(), nullable=False),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sync_status', 'offline_sync_records', ['status'], unique=False)
    op.create_index('ix_sync_user_device', 'offline_sync_records', ['user_id', 'device_id'], unique=False)
    op.create_table('sanctions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('student_id', sa.UUID(), nullable=False),
    sa.Column('issued_by_id', sa.UUID(), nullable=False),
    sa.Column('violation_type', sa.Enum('TARDINESS', 'ABSENCE', 'MISCONDUCT', 'DRESS_CODE', 'EQUIPMENT_MISUSE', 'UNSPORTSMANLIKE', 'SUBSTANCE', 'ACADEMIC', 'OTHER', name='violation_type_enum'), nullable=False),
    sa.Column('severity', sa.Enum('WARNING', 'MINOR', 'MAJOR', 'SEVERE', name='sanction_severity_enum'), nullable=False),
    sa.Column('status', sa.Enum('ACTIVE', 'SERVED', 'APPEALED', 'LIFTED', name='sanction_status_enum'), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('violation_date', sa.Date(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=True),
    sa.Column('penalty', sa.Text(), nullable=True),
    sa.Column('is_compliant', sa.Boolean(), nullable=False),
    sa.Column('compliance_notes', sa.Text(), nullable=True),
    sa.Column('acknowledged_by_student', sa.Boolean(), nullable=False),
    sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['issued_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['student_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sanctions_issued_by', 'sanctions', ['issued_by_id'], unique=False)
    op.create_index('ix_sanctions_status', 'sanctions', ['status'], unique=False)
    op.create_index('ix_sanctions_student', 'sanctions', ['student_id', 'status'], unique=False)
    op.alter_column('announcements', 'event_date',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment='Set when this is an upcoming event; None for general notices',
               existing_nullable=True)
    op.alter_column('equipment', 'qr_image_key',
               existing_type=sa.VARCHAR(length=500),
               comment='MinIO object key for printed QR code label image',
               existing_comment='MinIO object key for printed barcode label image',
               existing_nullable=True)


def downgrade() -> None:
    op.alter_column('equipment', 'qr_image_key',
               existing_type=sa.VARCHAR(length=500),
               comment='MinIO object key for printed barcode label image',
               existing_comment='MinIO object key for printed QR code label image',
               existing_nullable=True)
    op.alter_column('announcements', 'event_date',
               existing_type=postgresql.TIMESTAMP(timezone=True),
               comment=None,
               existing_comment='Set when this is an upcoming event; None for general notices',
               existing_nullable=True)
    op.drop_index('ix_sanctions_student', table_name='sanctions')
    op.drop_index('ix_sanctions_status', table_name='sanctions')
    op.drop_index('ix_sanctions_issued_by', table_name='sanctions')
    op.drop_table('sanctions')
    op.drop_index('ix_sync_user_device', table_name='offline_sync_records')
    op.drop_index('ix_sync_status', table_name='offline_sync_records')
    op.drop_table('offline_sync_records')
    op.drop_index('ix_incidents_student', table_name='incidents')
    op.drop_index('ix_incidents_status', table_name='incidents')
    op.drop_index('ix_incidents_category', table_name='incidents')
    op.drop_table('incidents')
    op.drop_index('ix_facility_schedules_date', table_name='facility_schedules')
    op.drop_table('facility_schedules')
    op.drop_index('ix_eligibility_student', table_name='athlete_eligibility')
    op.drop_index('ix_eligibility_status', table_name='athlete_eligibility')
    op.drop_table('athlete_eligibility')
    op.drop_index('ix_facilities_status', table_name='facilities')
    op.drop_table('facilities')
