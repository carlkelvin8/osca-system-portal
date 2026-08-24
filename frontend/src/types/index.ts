export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type UserRole = "admin" | "coach" | "pe_instructor" | "student" | "director" | "staff";

export interface User {
  id: string;
  email: string;
  student_id: string | null;
  first_name: string;
  last_name: string;
  middle_name: string | null;
  suffix: string | null;
  full_name: string;
  role: UserRole;
  course: string | null;
  year_level: string | null;
  contact_number: string | null;
  address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  employee_id: string | null;
  department: string | null;
  assigned_sport: string | null;
  sport_or_art: string | null;
  medical_info: string | null;
  emergency_contact_name: string | null;
  emergency_contact_number: string | null;
  is_active: boolean;
  is_face_enrolled: boolean;
  biometric_consent: boolean;
  profile_picture_url: string | null;
  face_image_url: string | null;
  face_enrolled_at: string | null;
  created_at: string;
  last_login_at: string | null;
  last_logout_at: string | null;
  is_online: boolean;
}

export interface UserSummary {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  student_id: string | null;
  employee_id: string | null;
  is_active: boolean;
  is_face_enrolled: boolean;
  profile_picture_url: string | null;
  face_image_url: string | null;
  is_online: boolean;
}

export interface UserCreate {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  suffix?: string;
  role: UserRole;
  student_id?: string;
  course?: string;
  year_level?: string;
  contact_number?: string;
  address?: string;
  date_of_birth?: string;
  gender?: string;
  employee_id?: string;
  department?: string;
  sport_or_art?: string;
  medical_info?: string;
  emergency_contact_name?: string;
  emergency_contact_number?: string;
  assigned_sport?: string;
  biometric_consent?: boolean;
  is_active?: boolean;
  face_images_base64?: string[];
}

export interface UserUpdate {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  suffix?: string;
  role?: UserRole;
  course?: string;
  year_level?: string;
  contact_number?: string;
  address?: string;
  date_of_birth?: string;
  gender?: string;
  employee_id?: string;
  department?: string;
  sport_or_art?: string;
  is_active?: boolean;
  assigned_sport?: string;
}

export type ActivityType = "practice" | "competition" | "training" | "event" | "other";
export type ScanResult =
  | "success"
  | "failed_recognition"
  | "failed_liveness"
  | "failed_threshold"
  | "no_face_detected"
  | "timeout";

export interface Session {
  id: string;
  name: string;
  activity_type: ActivityType;
  sport_or_art: string | null;
  venue: string | null;
  scheduled_start: string;
  scheduled_end: string;
  grace_period_minutes: number;
  notes?: string;
  is_active: boolean;
  attendance_count: number;
  created_at: string;
}

export interface SessionStats {
  session_id: string;
  present: number;
  late: number;
  absent: number;
  total: number;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  session_id: string;
  session_name: string;
  session_sport_or_art: string | null;
  student_name: string;
  student_number: string | null;
  time_in: string | null;
  time_out: string | null;
  duration_minutes: number | null;
  time_in_confidence: number | null;
  time_out_confidence: number | null;
  is_complete: boolean;
  status: string | null;
  ip_address: string | null;
  device: string | null;
}

export interface FaceScanResponse {
  result: ScanResult;
  matched_user_id: string | null;
  matched_user_name: string | null;
  matched_user_role: string | null;
  confidence_score: number | null;
  liveness_score: number | null;
  attendance_record_id: string | null;
  processing_time_ms: number;
  message: string;
}

export interface LatestAttendance {
  has_record: boolean;
  person_name: string | null;
  person_role: string | null;
  time: string | null;
  time_out: string | null;
  duration_minutes: number | null;
  status: string | null;
  session_name: string | null;
  session_sport_or_art: string | null;
  confidence_score: number | null;
}

export type EquipmentCategory =
  | "balls" | "rackets" | "nets" | "protective_gear" | "uniforms"
  | "training_aids" | "electronic" | "cultural" | "storage_unit" | "other";

export type EquipmentCondition = "new" | "good" | "fair" | "poor" | "for_repair" | "condemned";

export type TransactionStatus = "active" | "returned" | "overdue" | "partial_return";

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface Equipment {
  id: string;
  name: string;
  description: string | null;
  category: EquipmentCategory;
  condition: EquipmentCondition;
  qr_code: string;
  qr_image_key: string | null;
  total_quantity: number;
  available_quantity: number;
  storage_location: string | null;
  sport_or_art: string | null;
  is_active: boolean;
  created_at: string;
}

export interface BorrowTransactionItem {
  id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_qr: string;
  quantity: number;
  is_returned: boolean;
  returned_at: string | null;
}

export interface BorrowTransaction {
  id: string;
  instructor_id: string;
  instructor_name: string;
  status: TransactionStatus;
  borrowed_at: string;
  expected_return: string;
  returned_at: string | null;
  overdue_notified: boolean;
  notes: string | null;
  transaction_qr_code: string | null;
  transaction_qr_invalidated: boolean;
  items: BorrowTransactionItem[];
}

export interface EquipmentRequestItem {
  id: string;
  equipment_id: string;
  equipment_name: string;
  equipment_qr: string;
  quantity: number;
}

export interface EquipmentRequest {
  id: string;
  requester_id: string;
  requester_name: string;
  requester_role: string;
  status: RequestStatus;
  expected_return: string;
  notes: string | null;
  requested_at: string;
  approved_by_id: string | null;
  approved_by_name: string;
  approved_at: string | null;
  rejection_reason: string | null;
  is_expired: boolean;
  return_qr_code: string | null;
  return_qr_status: string | null;
  requester_active_borrows: RequesterActiveBorrow[];
  items: EquipmentRequestItem[];
}

export interface RequesterActiveBorrow {
  id: string;
  status: string;
  borrowed_at: string;
  expected_return: string;
  items: BorrowTransactionItem[];
}

export interface ScannedUserEligibility {
  status: string | null;
  reason_detail: string | null;
  is_current: boolean;
}

export interface ScannedUserSanction {
  violation_type: string;
  severity: string;
  status: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
}

export interface ScannedUserBorrow {
  id: string;
  transaction_qr_code: string | null;
  status: string;
  borrowed_at: string;
  expected_return: string;
  items: { equipment_name: string; quantity: number }[];
}

export interface ScanBorrowingIDResponse {
  user_id: string;
  full_name: string;
  role: string;
  email: string;
  is_active: boolean;
  eligibility: ScannedUserEligibility | null;
  current_borrows: ScannedUserBorrow[];
  pending_requests: EquipmentRequest[];
  active_sanctions: ScannedUserSanction[];
}

export interface TransactionQRRead {
  transaction_id: string;
  transaction_qr_code: string;
  borrower_name: string;
  borrower_role: string;
  status: string;
  items: BorrowTransactionItem[];
  borrowed_at: string;
  expected_return: string;
  notes: string | null;
  qr_status: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  image_urls?: string[];
  event_date: string | null;
  tag: string | null;
  pinned: boolean;
  visibility?: string;
  link_url?: string | null;
  is_active: boolean;
  deleted_at?: string | null;
  created_by_id: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  acknowledged_by_me?: boolean;
  acknowledgement_count?: number;
  comment_count?: number;
}

export interface AnnouncementComment {
  id: string;
  announcement_id: string;
  user_id: string;
  author_name: string;
  author_picture_url: string | null;
  content: string;
  created_at: string;
}

export interface FRConfig {
  similarity_threshold: number;
  liveness_threshold: number;
  liveness_enabled: boolean;
}

export interface FRConfigUpdate {
  similarity_threshold?: number;
  liveness_threshold?: number;
  liveness_enabled?: boolean;
}

export interface EnrollmentResponse {
  success: boolean;
  user_id: string;
  embedding_id: string | null;
  images_processed: number;
  message: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface DashboardSummary {
  students: {
    total: number;
    face_enrolled: number;
    enrollment_rate: number;
  };
  attendance: {
    today: number;
  };
  equipment: {
    total: number;
    borrowed: number;
    available: number;
  };
  transactions: {
    overdue: number;
  };
  generated_at: string;
}

export interface MonthlyInventoryReport {
  period: { year: number; month: number };
  total_active_equipment: number;
  borrowed_this_month: number;
  returned_this_month: number;
  overdue_at_end_of_month: number;
  top_5_borrowed: Array<{ name: string; borrow_count: number }>;
  condition_breakdown: Record<string, number>;
  generated_at: string;
}


export type FacilityStatus = "available" | "in_use" | "maintenance" | "closed" | "reserved";
export type FacilityConditionType = "excellent" | "good" | "fair" | "poor" | "needs_repair";

export interface Facility {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  capacity: number | null;
  image_url: string | null;
  status: FacilityStatus;
  condition: FacilityConditionType;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FacilityCreate {
  name: string;
  description?: string;
  location?: string;
  capacity?: number;
  status?: FacilityStatus;
  condition?: FacilityConditionType;
  notes?: string;
}

export interface FacilityUpdate {
  name?: string;
  description?: string;
  location?: string;
  capacity?: number;
  status?: FacilityStatus;
  condition?: FacilityConditionType;
  notes?: string;
  is_active?: boolean;
}

export type ReservationStatus = "pending" | "approved" | "rejected";

export interface VenueReservation {
  id: string;
  facility_id: string;
  requester_id: string;
  purpose: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  remarks: string | null;
  status: ReservationStatus;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  requester_name: string | null;
  requester_role: string | null;
  facility_name: string | null;
}

export interface ReservationCreate {
  facility_id: string;
  purpose: string;
  reservation_date: string;
  start_time: string;
  end_time: string;
  remarks?: string;
}

export interface ReservationReject {
  rejection_reason?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
  reference_type?: string | null;
  reference_id?: string | null;
}

export interface NotificationListRead {
  items: NotificationItem[];
  unread_count: number;
}

export interface FacilitySchedule {
  id: string;
  facility_id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  booked_by_id: string | null;
  sport_or_activity: string | null;
  notes: string | null;
  created_at: string;
}

export type EligibilityStatus = "eligible" | "restricted" | "ineligible" | "pending_clearance";
export type EligibilityReasonType = "injury" | "medical" | "disciplinary" | "academic" | "other";

export interface AthleteEligibility {
  id: string;
  student_id: string;
  status: EligibilityStatus;
  reason_type: EligibilityReasonType | null;
  reason_detail: string | null;
  start_date: string;
  end_date: string | null;
  medical_clearance: boolean;
  cleared_by_id: string | null;
  cleared_at: string | null;
  notes: string | null;
  is_current: boolean;
  created_by_id: string | null;
  created_at: string;
  updated_at: string;
  student_registered_id: string | null;
  student_full_name: string | null;
}

export type IncidentCategory = "injury" | "equipment_damage" | "facility_damage" | "behavioral" | "safety" | "other";
export type IncidentSeverity = "low" | "medium" | "high" | "critical";
export type IncidentStatus = "open" | "under_review" | "resolved" | "closed";

export interface Incident {
  id: string;
  title: string;
  description: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  status: IncidentStatus;
  incident_date: string;
  location: string | null;
  reported_by_id: string;
  involved_student_id: string | null;
  involved_facility_id: string | null;
  resolution: string | null;
  resolved_by_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ViolationType = "tardiness" | "absence" | "misconduct" | "dress_code" | "equipment_misuse" | "unsportsmanlike" | "substance" | "academic" | "other";
export type SanctionSeverity = "warning" | "minor" | "major" | "severe";
export type SanctionStatus = "active" | "served" | "appealed" | "lifted";

export interface Sanction {
  id: string;
  student_id: string;
  issued_by_id: string;
  violation_type: ViolationType;
  severity: SanctionSeverity;
  status: SanctionStatus;
  description: string;
  violation_date: string;
  start_date: string;
  end_date: string | null;
  penalty: string | null;
  is_compliant: boolean;
  compliance_notes: string | null;
  acknowledged_by_student: boolean;
  acknowledged_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AuditLogStatus = "success" | "failure" | "partial";

export interface AuditLog {
  id: string;
  user_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
  admin_role: string | null;
  action: string;
  module: string | null;
  description: string | null;
  resource_type: string | null;
  resource_id: string | null;
  status: AuditLogStatus;
  failure_reason: string | null;
  ip_address: string | null;
  browser: string | null;
  os: string | null;
  device_info: string | null;
  session_id: string | null;
  request_url: string | null;
  http_method: string | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogListParams {
  page?: number;
  page_size?: number;
  search?: string;
  module?: string;
  action?: string;
  status?: AuditLogStatus;
  user_id?: string;
  ip_address?: string;
  date_from?: string;
  date_to?: string;
  sort_order?: "asc" | "desc";
}

export type SyncStatus = "pending" | "synced" | "conflict" | "failed";
export type SyncRecordType = "attendance" | "inventory_transaction";

export interface SyncRecord {
  id: string;
  device_id: string;
  user_id: string;
  record_type: SyncRecordType;
  payload: Record<string, unknown>;
  local_timestamp: string;
  status: SyncStatus;
  sync_attempts: number;
  error_message: string | null;
  synced_at: string | null;
  created_at: string;
}
