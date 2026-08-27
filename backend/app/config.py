from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, Field, field_validator, model_validator

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_ENV: Literal["development", "production", "testing"] = "development"
    APP_NAME: str = "OSCA Management System"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_PREFIX: str = "/api/v1"
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _coerce_origins(cls, v):
        if isinstance(v, (list, tuple)):
            return ",".join(v)
        return v

    @property
    def allowed_origins(self) -> list[str]:
        stripped = self.ALLOWED_ORIGINS.strip()
        if stripped.startswith("["):
            import json
            return json.loads(stripped)
        return [o.strip() for o in stripped.split(",") if o.strip()]

    SECRET_KEY: str = Field(min_length=32)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    LOGIN_RATE_LIMIT_ATTEMPTS: int = 5
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: int = 900
    LOGIN_LOCKOUT_SECONDS: int = 1800

    DATABASE_URL: str
    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "osca_db"
    POSTGRES_USER: str = "osca_user"
    POSTGRES_PASSWORD: str

    FACE_EMBEDDING_DIM: int = 512
    FACE_SIMILARITY_THRESHOLD: float = 0.85

    REDIS_URL: str
    REDIS_PASSWORD: str
    CELERY_BROKER_URL: str
    CELERY_RESULT_BACKEND: str

    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_PUBLIC_ENDPOINT: str = ""
    MINIO_ACCESS_KEY: str
    MINIO_SECRET_KEY: str
    MINIO_BUCKET_FACES: str = "osca-faces"
    MINIO_BUCKET_REPORTS: str = "osca-reports"
    MINIO_BUCKET_PROFILES: str = "osca-profile-pictures"
    MINIO_SECURE: bool = False

    FR_MODEL: Literal["insightface", "deepface", "face_recognition"] = "insightface"
    FR_GPU_ENABLED: bool = False
    FR_GPU_ID: int = 0
    FR_MAX_SCAN_TIME_SECONDS: int = 3
    FR_LIVENESS_ENABLED: bool = True
    FR_LIVENESS_THRESHOLD: float = 0.6

    EMAIL_PROVIDER: Literal["resend", "smtp"] = "resend"
    RESEND_API_KEY: str = ""
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "OSCA System <osca@naap.edu.ph>"

    CELERY_TIMEZONE: str = "Asia/Manila"
    OVERDUE_CHECK_SCHEDULE_HOURS: int = 24

    FACE_IMAGE_RETENTION_DAYS: int = 30

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def docs_url(self) -> str | None:
        return None if self.is_production else "/docs"

    @property
    def redoc_url(self) -> str | None:
        return None if self.is_production else "/redoc"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
