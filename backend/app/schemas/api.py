from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.db.models import TaskPriority, TaskStatus, Theme


def validate_strong_password(value: str) -> str:
    if not (
        any(character.islower() for character in value)
        and any(character.isupper() for character in value)
        and any(character.isdigit() for character in value)
        and any(not character.isalnum() for character in value)
    ):
        raise ValueError("Password must include upper, lower, numeric, and symbol characters")
    return value


class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class RegisterRequest(APIModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "full_name": "Alex Morgan",
                    "email": "alex@example.com",
                    "password": "StrongExample!2026",
                }
            ]
        }
    )

    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("full_name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Full name cannot be empty")
        return value

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return validate_strong_password(value)


class LoginRequest(APIModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"email": "alex@example.com", "password": "StrongExample!2026", "remember_me": True}
            ]
        }
    )

    email: EmailStr
    password: str
    remember_me: bool = False


class ForgotPasswordRequest(APIModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"email": "alex@example.com"}]})

    email: EmailStr


class ResetPasswordRequest(APIModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "token": "opaque-reset-token-from-email",
                    "new_password": "AnotherStrong!2026",
                }
            ]
        }
    )

    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return validate_strong_password(value)


class VerifyEmailRequest(APIModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"token": "opaque-verification-token-from-email"}]}
    )

    token: str = Field(min_length=32, max_length=256)


class UserUpdate(APIModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [{"full_name": "Alex Morgan", "phone_number": "+15551234567"}]
        }
    )

    full_name: str | None = Field(default=None, min_length=1, max_length=200)
    phone_number: str | None = Field(default=None, max_length=32)


class ChangePasswordRequest(APIModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "current_password": "CurrentStrong!2026",
                    "new_password": "AnotherStrong!2026",
                }
            ]
        }
    )

    current_password: str
    new_password: str = Field(min_length=12, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return validate_strong_password(value)


class UserResponse(APIModel):
    id: UUID
    full_name: str
    email: EmailStr
    phone_number: str | None
    profile_picture_key: str | None
    is_active: bool
    is_verified: bool
    created_at: datetime


class TaskCreate(APIModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "title": "Prepare project update",
                    "description": "Collect the latest milestones",
                    "priority": "high",
                    "due_at": "2026-10-22T16:00:00Z",
                    "tag_ids": [],
                }
            ]
        }
    )

    title: str = Field(min_length=1, max_length=300)
    description: str | None = None
    status: TaskStatus = TaskStatus.PENDING
    priority: TaskPriority = TaskPriority.MEDIUM
    category_id: UUID | None = None
    tag_ids: list[UUID] = Field(default_factory=list, max_length=50)
    start_at: datetime | None = None
    due_at: datetime | None = None
    is_all_day: bool = False
    estimated_duration_minutes: int | None = Field(default=None, gt=0)
    external_url: str | None = Field(default=None, max_length=2048)
    reminder_offset_minutes: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def nonblank_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Title cannot be empty")
        return value

    @field_validator("external_url")
    @classmethod
    def safe_external_url(cls, value: str | None) -> str | None:
        if value is not None:
            from urllib.parse import urlsplit

            parsed = urlsplit(value)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("External URL must use http or https")
        return value

    @model_validator(mode="after")
    def valid_interval(self) -> "TaskCreate":
        if self.start_at and self.due_at and self.due_at < self.start_at:
            raise ValueError("due_at must not precede start_at")
        if self.status == TaskStatus.COMPLETED:
            raise ValueError("Create tasks as pending, then use the complete action")
        return self


class TaskUpdate(APIModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "expected_updated_at": "2026-10-21T09:30:00Z",
                    "title": "Prepare revised project update",
                    "priority": "urgent",
                }
            ]
        }
    )

    expected_updated_at: datetime
    title: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = None
    priority: TaskPriority | None = None
    category_id: UUID | None = None
    tag_ids: list[UUID] | None = Field(default=None, max_length=50)
    start_at: datetime | None = None
    due_at: datetime | None = None
    is_all_day: bool | None = None
    estimated_duration_minutes: int | None = Field(default=None, gt=0)
    external_url: str | None = Field(default=None, max_length=2048)
    reminder_offset_minutes: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def valid_title(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            raise ValueError("Title cannot be empty")
        return value.strip()

    @field_validator("external_url")
    @classmethod
    def safe_external_url(cls, value: str | None) -> str | None:
        if value is not None:
            from urllib.parse import urlsplit

            parsed = urlsplit(value)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("External URL must use http or https")
        return value

    @model_validator(mode="after")
    def timezone_aware_datetimes(self) -> "TaskUpdate":
        for name in ("expected_updated_at", "start_at", "due_at"):
            value = getattr(self, name)
            if value is not None and value.tzinfo is None:
                raise ValueError(f"{name} must include a timezone")
        return self


class TaskResponse(APIModel):
    id: UUID
    user_id: UUID
    category_id: UUID | None
    title: str
    description: str | None
    status: TaskStatus
    priority: TaskPriority
    start_at: datetime | None
    due_at: datetime | None
    is_all_day: bool
    estimated_duration_minutes: int | None
    completed_at: datetime | None
    external_url: str | None
    reminder_offset_minutes: int | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    tag_ids: list[UUID] = Field(default_factory=list)


class CategoryCreate(APIModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"name": "Personal", "color": "#6D5EF5"}]}
    )

    name: str = Field(min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=32)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name cannot be empty")
        return value.strip()


class CategoryUpdate(APIModel):
    model_config = ConfigDict(
        json_schema_extra={"examples": [{"name": "Home", "color": "#22A06B"}]}
    )

    name: str | None = Field(default=None, min_length=1, max_length=100)
    color: str | None = Field(default=None, max_length=32)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str | None) -> str | None:
        if value is not None and not value.strip():
            raise ValueError("Name cannot be empty")
        return value.strip() if value else value


class TagCreate(APIModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"name": "urgent"}]})

    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name cannot be empty")
        return value.strip()


class TagUpdate(APIModel):
    model_config = ConfigDict(json_schema_extra={"examples": [{"name": "follow-up"}]})

    name: str = Field(min_length=1, max_length=80)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name cannot be empty")
        return value.strip()


class NotificationResponse(APIModel):
    id: UUID
    task_id: UUID | None
    type: str
    title: str
    body: str | None
    is_read: bool
    created_at: datetime


class PreferencesUpdate(APIModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "theme": "system",
                    "timezone": "Asia/Karachi",
                    "date_format": "YYYY-MM-DD",
                    "time_format": "24h",
                    "notify_in_app": True,
                }
            ]
        }
    )

    theme: Theme | None = None
    timezone: str | None = Field(default=None, max_length=64)
    date_format: str | None = Field(default=None, max_length=16)
    time_format: str | None = Field(default=None, max_length=4)
    default_priority: TaskPriority | None = None
    accent_color: str | None = Field(default=None, max_length=32)
    notify_in_app: bool | None = None
    notify_email: bool | None = None
    dashboard_preferences: dict[str, Any] | None = None
