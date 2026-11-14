from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Values come from environment variables or backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./app.db"
    secret_key: str = "dev-insecure-secret-change-me"
    access_token_expire_minutes: int = 60 * 24 * 7  # one week
    # The built-in it_admin account, created on startup if it doesn't exist (see db/seed.py).
    # Set these in .env; if the password is empty, no admin is created.
    admin_email: str = "admin@example.com"
    admin_password: str = ""
    admin_first_name: str = "Admin"
    admin_last_name: str = "User"
    cors_origins: list[str] = ["http://localhost:5173"]


settings = Settings()
