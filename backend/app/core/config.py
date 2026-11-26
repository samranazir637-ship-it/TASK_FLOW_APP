from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import PostgresDsn, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    database_url: PostgresDsn = (
        "postgresql+psycopg://taskflow:replace-with-a-local-secret@localhost:5432/taskflow"
    )
    test_database_url: PostgresDsn = "postgresql+psycopg://taskflow_test:replace-with-a-test-only-secret@localhost:5433/taskflow_test"
    jwt_secret_key: str = "development-only-change-this-secret-before-deploying-1234567890"
    jwt_issuer: str = "taskflow-api"
    jwt_audience: str = "taskflow-client"
    access_token_minutes: int = 10
    refresh_days: int = 14
    remember_refresh_days: int = 30
    cors_origins: list[str] = ["http://localhost:5173"]
    email_verification_enabled: bool = False
    secure_cookies: bool | None = None
    cookie_same_site: Literal["lax", "strict", "none"] = "lax"
    upload_directory: Path = Path(".storage/uploads")
    max_upload_bytes: int = 5 * 1024 * 1024
    scheduler_enabled: bool = True
    request_max_bytes: int = 10 * 1024 * 1024
    rate_limit_default: str = "120/minute"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str = "no-reply@taskflow.local"
    frontend_base_url: str = "http://localhost:5173"
    openrouter_api_key: SecretStr | None = None
    openrouter_model: str = "openai/gpt-4o-mini"
    openrouter_site_url: str = "http://localhost:5173"
    openrouter_app_name: str = "TaskFlow"
    admin_emails: str = ""

    model_config = SettingsConfigDict(
        env_file=Path(__file__).resolve().parents[3] / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_runtime_security(self) -> "Settings":
        if self.app_env.lower() == "production":
            if self.jwt_secret_key.startswith("development-only") or len(self.jwt_secret_key) < 32:
                raise ValueError(
                    "Production requires a unique JWT_SECRET_KEY of at least 32 characters"
                )
            if self.secure_cookies is False:
                raise ValueError("Production cookies must be Secure")
            if not self.smtp_host:
                raise ValueError(
                    "Production requires SMTP_HOST for password reset and email delivery"
                )
        if self.secure_cookies is None:
            self.secure_cookies = self.app_env.lower() == "production"
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
