import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str
    jwt_algorithm: str
    access_token_ttl_minutes: int
    aiml_api_key: str | None
    aiml_base_url: str
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
        aiml_api_key=os.getenv("AIML_API_KEY"),
        aiml_base_url=os.getenv("AIML_BASE_URL", "https://api.aimlapi.com/v1"),
        coach_model=os.getenv("COACH_MODEL", "anthropic/claude-sonnet-4.6"),
    )
