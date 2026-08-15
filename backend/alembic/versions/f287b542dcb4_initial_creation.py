from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import pgvector.sqlalchemy
from sqlalchemy.dialects import postgresql

revision: str = 'f287b542dcb4'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('users',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('student_id', sa.String(length=20), nullable=True),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('hashed_password', sa.String(length=255), nullable=False),
    sa.Column('first_name', sa.String(length=100), nullable=False),
    sa.Column('last_name', sa.String(length=100), nullable=False),
    sa.Column('middle_name', sa.String(length=100), nullable=True),
    sa.Column('course', sa.String(length=100), nullable=True),
    sa.Column('year_level', sa.String(length=20), nullable=True),
    sa.Column('contact_number', sa.String(length=20), nullable=True),
    sa.Column('sport_or_art', sa.String(length=100), nullable=True),
    sa.Column('medical_info', sa.Text(), nullable=True),
    sa.Column('emergency_contact_name', sa.String(length=200), nullable=True),
    sa.Column('emergency_contact_number', sa.String(length=20), nullable=True),
    sa.Column('role', sa.Enum('ADMIN', 'COACH', 'PE_INSTRUCTOR', 'STUDENT', 'DIRECTOR', name='user_role_enum'), nullable=False),
    sa.Column('assigned_sport', sa.String(length=100), nullable=True, comment='Coach: limits attendance management to this sport'),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('is_face_enrolled', sa.Boolean(), nullable=False),
    sa.Column('failed_login_attempts', sa.Integer(), nullable=False),
    sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
    sa.Column('biometric_consent', sa.Boolean(), nullable=False),
    sa.Column('biometric_consent_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('student_id')
    )
    op.create_index('ix_users_active_role', 'users', ['is_active', 'role'], unique=False)
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index('ix_users_role', 'users', ['role'], unique=False)
    op.create_table('audit_logs',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('action', sa.String(length=100), nullable=False, comment='e.g. USER_LOGIN, FACE_SCAN_SUCCESS, EQUIPMENT_BORROWED, REPORT_GENERATED'),
    sa.Column('resource_type', sa.String(length=50), nullable=True, comment='e.g. User, Equipment, AttendanceRecord'),
    sa.Column('resource_id', sa.String(length=100), nullable=True),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.String(length=500), nullable=True),
    sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=True, comment='Structured additional context (never store raw biometric data here)'),
    sa.Column('status', sa.String(length=20), nullable=False, comment='success | failure | warning'),
    sa.Column('failure_reason', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_audit_action', 'audit_logs', ['action'], unique=False)
    op.create_index('ix_audit_created_at', 'audit_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index('ix_audit_resource', 'audit_logs', ['resource_type', 'resource_id'], unique=False)
    op.create_index('ix_audit_user', 'audit_logs', ['user_id'], unique=False)
    op.create_table('borrowing_ids',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('instructor_id', sa.UUID(), nullable=False),
    sa.Column('qr_code', sa.String(length=100), nullable=False),
    sa.Column('qr_image_key', sa.String(length=500), nullable=True, comment='MinIO key for the printable QR Code image'),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('issued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['instructor_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('instructor_id')
    )
    op.create_index(op.f('ix_borrowing_ids_qr_code'), 'borrowing_ids', ['qr_code'], unique=True)
    op.create_table('equipment',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('category', sa.Enum('BALLS', 'RACKETS', 'NETS', 'PROTECTIVE_GEAR', 'UNIFORMS', 'TRAINING_AIDS', 'ELECTRONIC', 'CULTURAL', 'STORAGE_UNIT', 'OTHER', name='equipment_category_enum'), nullable=False),
    sa.Column('condition', sa.Enum('NEW', 'GOOD', 'FAIR', 'POOR', 'FOR_REPAIR', 'CONDEMNED', name='equipment_condition_enum'), nullable=False),
    sa.Column('barcode', sa.String(length=50), nullable=False),
    sa.Column('barcode_image_key', sa.String(length=500), nullable=True, comment='MinIO object key for printed barcode label image'),
    sa.Column('total_quantity', sa.Integer(), nullable=False),
    sa.Column('available_quantity', sa.Integer(), nullable=False),
    sa.Column('storage_location', sa.String(length=200), nullable=True),
    sa.Column('sport_or_art', sa.String(length=100), nullable=True, comment='Which sport/art this equipment belongs to'),
    sa.Column('acquisition_date', sa.DateTime(timezone=True), nullable=True),
    sa.Column('acquisition_cost', sa.Float(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('created_by_id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_equipment_active', 'equipment', ['is_active'], unique=False)
    op.create_index(op.f('ix_equipment_barcode'), 'equipment', ['barcode'], unique=True)
    op.create_index('ix_equipment_category', 'equipment', ['category'], unique=False)
    op.create_index('ix_equipment_sport', 'equipment', ['sport_or_art'], unique=False)
    op.create_table('face_embeddings',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('embedding', pgvector.sqlalchemy.vector.VECTOR(dim=512), nullable=False),
    sa.Column('model_used', sa.String(length=50), nullable=False),
    sa.Column('images_used', sa.Integer(), nullable=False),
    sa.Column('minio_image_keys', sa.Text(), nullable=True, comment='Comma-separated MinIO object keys for enrolled face images'),
    sa.Column('enrolled_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('scan_attempts',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('scan_type', sa.Enum('TIME_IN', 'TIME_OUT', name='scan_type_enum'), nullable=False),
    sa.Column('result', sa.Enum('SUCCESS', 'FAILED_RECOGNITION', 'FAILED_LIVENESS', 'FAILED_THRESHOLD', 'NO_FACE_DETECTED', 'TIMEOUT', name='scan_result_enum'), nullable=False),
    sa.Column('matched_user_id', sa.UUID(), nullable=True),
    sa.Column('confidence_score', sa.Float(), nullable=True),
    sa.Column('liveness_score', sa.Float(), nullable=True),
    sa.Column('kiosk_ip', sa.String(length=45), nullable=True),
    sa.Column('processing_time_ms', sa.Integer(), nullable=True),
    sa.Column('failure_reason', sa.String(length=500), nullable=True),
    sa.Column('attempted_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['matched_user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_scan_attempts_date', 'scan_attempts', ['attempted_at'], unique=False)
    op.create_index('ix_scan_attempts_result', 'scan_attempts', ['result'], unique=False)
    op.create_index('ix_scan_attempts_user', 'scan_attempts', ['matched_user_id'], unique=False)
    op.create_table('sessions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=200), nullable=False),
    sa.Column('activity_type', sa.Enum('PRACTICE', 'COMPETITION', 'TRAINING', 'EVENT', 'OTHER', name='activity_type_enum'), nullable=False),
    sa.Column('sport_or_art', sa.String(length=100), nullable=True),
    sa.Column('venue', sa.String(length=200), nullable=True),
    sa.Column('scheduled_start', sa.DateTime(timezone=True), nullable=False),
    sa.Column('scheduled_end', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_by_id', sa.UUID(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_sessions_sport', 'sessions', ['sport_or_art'], unique=False)
    op.create_index('ix_sessions_start', 'sessions', ['scheduled_start'], unique=False)
    op.create_table('attendance_records',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('student_id', sa.UUID(), nullable=False),
    sa.Column('session_id', sa.UUID(), nullable=False),
    sa.Column('time_in', sa.DateTime(timezone=True), nullable=True),
    sa.Column('time_in_confidence', sa.Float(), nullable=True),
    sa.Column('time_in_liveness_score', sa.Float(), nullable=True),
    sa.Column('time_out', sa.DateTime(timezone=True), nullable=True),
    sa.Column('time_out_confidence', sa.Float(), nullable=True),
    sa.Column('time_out_liveness_score', sa.Float(), nullable=True),
    sa.Column('duration_minutes', sa.Integer(), nullable=True),
    sa.Column('is_complete', sa.Boolean(), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ),
    sa.ForeignKeyConstraint(['student_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_attendance_session', 'attendance_records', ['session_id'], unique=False)
    op.create_index('ix_attendance_student_date', 'attendance_records', ['student_id', 'time_in'], unique=False)
    op.create_index('ix_attendance_student_session', 'attendance_records', ['student_id', 'session_id'], unique=True)
    op.create_table('borrow_transactions',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('borrowing_id_record_id', sa.UUID(), nullable=False),
    sa.Column('instructor_id', sa.UUID(), nullable=False),
    sa.Column('processed_by_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.Enum('ACTIVE', 'RETURNED', 'OVERDUE', 'PARTIAL_RETURN', name='transaction_status_enum'), nullable=False),
    sa.Column('borrowed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('expected_return', sa.DateTime(timezone=True), nullable=False),
    sa.Column('returned_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('overdue_notified', sa.Boolean(), nullable=False),
    sa.Column('overdue_notified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.ForeignKeyConstraint(['borrowing_id_record_id'], ['borrowing_ids.id'], ),
    sa.ForeignKeyConstraint(['instructor_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['processed_by_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_transactions_expected_return', 'borrow_transactions', ['expected_return'], unique=False)
    op.create_index('ix_transactions_instructor', 'borrow_transactions', ['instructor_id'], unique=False)
    op.create_index('ix_transactions_status', 'borrow_transactions', ['status'], unique=False)
    op.create_table('borrow_transaction_items',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('transaction_id', sa.UUID(), nullable=False),
    sa.Column('equipment_id', sa.UUID(), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('is_returned', sa.Boolean(), nullable=False),
    sa.Column('returned_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('return_condition', sa.Enum('NEW', 'GOOD', 'FAIR', 'POOR', 'FOR_REPAIR', 'CONDEMNED', name='equipment_condition_enum'), nullable=True),
    sa.Column('notes', sa.String(length=500), nullable=True),
    sa.ForeignKeyConstraint(['equipment_id'], ['equipment.id'], ),
    sa.ForeignKeyConstraint(['transaction_id'], ['borrow_transactions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_transaction_items_equipment', 'borrow_transaction_items', ['equipment_id'], unique=False)
    op.create_index('ix_transaction_items_transaction', 'borrow_transaction_items', ['transaction_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_transaction_items_transaction', table_name='borrow_transaction_items')
    op.drop_index('ix_transaction_items_equipment', table_name='borrow_transaction_items')
    op.drop_table('borrow_transaction_items')
    op.drop_index('ix_transactions_status', table_name='borrow_transactions')
    op.drop_index('ix_transactions_instructor', table_name='borrow_transactions')
    op.drop_index('ix_transactions_expected_return', table_name='borrow_transactions')
    op.drop_table('borrow_transactions')
    op.drop_index('ix_attendance_student_session', table_name='attendance_records')
    op.drop_index('ix_attendance_student_date', table_name='attendance_records')
    op.drop_index('ix_attendance_session', table_name='attendance_records')
    op.drop_table('attendance_records')
    op.drop_index('ix_sessions_start', table_name='sessions')
    op.drop_index('ix_sessions_sport', table_name='sessions')
    op.drop_table('sessions')
    op.drop_index('ix_scan_attempts_user', table_name='scan_attempts')
    op.drop_index('ix_scan_attempts_result', table_name='scan_attempts')
    op.drop_index('ix_scan_attempts_date', table_name='scan_attempts')
    op.drop_table('scan_attempts')
    op.drop_table('face_embeddings')
    op.drop_index('ix_equipment_sport', table_name='equipment')
    op.drop_index('ix_equipment_category', table_name='equipment')
    op.drop_index(op.f('ix_equipment_barcode'), table_name='equipment')
    op.drop_index('ix_equipment_active', table_name='equipment')
    op.drop_table('equipment')
    op.drop_index(op.f('ix_borrowing_ids_qr_code'), table_name='borrowing_ids')
    op.drop_table('borrowing_ids')
    op.drop_index('ix_audit_user', table_name='audit_logs')
    op.drop_index('ix_audit_resource', table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_action'), table_name='audit_logs')
    op.drop_index('ix_audit_created_at', table_name='audit_logs')
    op.drop_index('ix_audit_action', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index('ix_users_role', table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_index('ix_users_active_role', table_name='users')
    op.drop_table('users')
