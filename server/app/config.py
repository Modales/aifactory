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
    detect_model: str


DEV_JWT_SECRET = "dev-only-secret-set-JWT_SECRET-in-production"


def _jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    # In production a missing/weak signing key would let anyone forge tokens: refuse to start.
    if os.getenv("APP_ENV", "").lower() == "production":
        if not secret or secret == DEV_JWT_SECRET or len(secret) < 32:
            raise RuntimeError("APP_ENV=production requires JWT_SECRET of at least 32 characters")
    return secret or DEV_JWT_SECRET


def load_settings(database_url: str | None = None) -> Settings:
    return Settings(
        database_url=database_url
        or os.getenv(
            "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/aifactory"
        ),
        jwt_secret=_jwt_secret(),
        jwt_algorithm="HS256",
        access_token_ttl_minutes=int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "10080")),
        openrouter_api_key=os.getenv("OPENROUTER_API_KEY"),
        openrouter_base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
        coach_model=os.getenv("COACH_MODEL", "anthropic/claude-sonnet-4.6"),
        # Exercise recognition second opinion: small and fast, called only while detection is uncertain.
        detect_model=os.getenv("DETECT_MODEL", "openai/gpt-4o-mini"),
    )
