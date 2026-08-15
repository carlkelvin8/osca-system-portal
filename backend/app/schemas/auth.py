from pydantic import EmailStr, Field

from app.schemas.common import OSCABaseModel


class LoginRequest(OSCABaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class TokenResponse(OSCABaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class RefreshRequest(OSCABaseModel):
    refresh_token: str


class PasswordChangeRequest(OSCABaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)
