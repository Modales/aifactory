import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    access_token_ttl_minutes: int
    openrouter_api_key: str | None
    openrouter_base_url: str
    coach_model: str


def load_settings(database_url: str | None = None) -> Settings:
    return Settings(
        database_url=database_url
        or os.getenv(
            "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/aifactory"
        ),
        jwt_secret=os.getenv("JWT_SECRET", "dev-only-secret-set-JWT_SECRET-in-production"),
        jwt_algorithm="HS256",
        access_token_ttl_minutes=int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "10080")),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
        openrouter_base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        coach_model=os.getenv("COACH_MODEL", "anthropic/claude-sonnet-4.6"),
    )
