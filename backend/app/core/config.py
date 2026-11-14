from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Values come from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./app.db"
    secret_key: str = "dev-insecure-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7  # one week
    # Seeded on startup if no user with this email exists. Dev convenience only:
    # set both to empty strings to disable.
    default_user_email: str = "admin@example.com"
    default_user_password: str = "password123"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
