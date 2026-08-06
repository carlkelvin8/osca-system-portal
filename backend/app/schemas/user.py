"""User schemas."""
import uuid
from datetime import date, datetime

from pydantic import EmailStr, Field

from app.models.user import UserRole
from app.schemas.common import OSCABaseModel


class UserCreate(OSCABaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    suffix: str | None = Field(default=None, max_length=20)
    student_id: str | None = Field(default=None, max_length=20)
    role: UserRole = UserRole.STUDENT
    course: str | None = Field(default=None, max_length=100)
    year_level: str | None = Field(default=None, max_length=20)
    contact_number: str | None = Field(default=None, max_length=20)
    address: str | None = None
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=20)
    employee_id: str | None = Field(default=None, max_length=50)
    department: str | None = Field(default=None, max_length=200)
    sport_or_art: str | None = Field(default=None, max_length=100)
    medical_info: str | None = None
    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_number: str | None = Field(default=None, max_length=20)
    assigned_sport: str | None = Field(default=None, max_length=100)
    biometric_consent: bool = False
    is_active: bool = True  # Auto-activate on registration (admin can deactivate later)
    face_images_base64: list[str] | None = Field(
        default=None,
        max_length=10,
        description="Optional 5-10 face images (base64) for auto-enrollment during registration",
    )


class UserUpdate(OSCABaseModel):
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    middle_name: str | None = Field(default=None, max_length=100)
    suffix: str | None = Field(default=None, max_length=20)
    course: str | None = Field(default=None, max_length=100)
    year_level: str | None = Field(default=None, max_length=20)
    contact_number: str | None = Field(default=None, max_length=20)
    address: str | None = None
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, max_length=20)
    employee_id: str | None = Field(default=None, max_length=50)
    department: str | None = Field(default=None, max_length=200)
    sport_or_art: str | None = Field(default=None, max_length=100)
    medical_info: str | None = None
    emergency_contact_name: str | None = Field(default=None, max_length=200)
    emergency_contact_number: str | None = Field(default=None, max_length=20)
    is_active: bool | None = None
    assigned_sport: str | None = Field(default=None, max_length=100)


class UserSummary(OSCABaseModel):
    """Lightweight user info for dropdowns and lists."""
    id: uuid.UUID
    full_name: str
    email: str
    role: UserRole
    student_id: str | None
    employee_id: str | None = None
    is_active: bool
    is_face_enrolled: bool
    profile_picture_url: str | None = None
    face_image_url: str | None = None
    is_online: bool = False


class UserRead(OSCABaseModel):
    id: uuid.UUID
    email: str
    student_id: str | None
    first_name: str
    last_name: str
    middle_name: str | None
    suffix: str | None = None
    full_name: str
    role: UserRole
    course: str | None
    year_level: str | None
    contact_number: str | None
    address: str | None = None
    date_of_birth: date | None = None
    gender: str | None = None
    employee_id: str | None = None
    department: str | None = None
    sport_or_art: str | None
    medical_info: str | None
    emergency_contact_name: str | None
    emergency_contact_number: str | None
    assigned_sport: str | None
    is_active: bool
    is_face_enrolled: bool
    biometric_consent: bool
    biometric_consent_date: datetime | None
    profile_picture_url: str | None = None
    face_image_url: str | None = None
    face_enrolled_at: datetime | None = None
    created_at: datetime
    last_login_at: datetime | None
    last_logout_at: datetime | None = None
    is_online: bool = False
