import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from .analysis.llm_detect import LlmDetector
from .analysis.llm_coach import LlmCoach
from .coach import CoachGenerator, OpenRouterCoach
from .config import load_settings
from .database import Base, make_engine_and_session_factory
from .routes.analysis import router as analysis_router
from .routes.athletes import router as athletes_router
from .routes.auth import router as auth_router
from .routes.activities import router as activities_router
from .routes.history import router as history_router
from .routes.profile import router as profile_router
from .routes.summary import router as summary_router
from .routes.social import router as social_router
from .routes.workout import router as workout_router

load_dotenv()


def create_app(
    database_url: str | None = None, coach_generator: CoachGenerator | None = None
) -> FastAPI:
    settings = load_settings(database_url)
    engine, session_factory = make_engine_and_session_factory(settings.database_url)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            if conn.dialect.name == "postgresql":
                await conn.execute(text(
                    "ALTER TABLE workout_sessions "
                    "ADD COLUMN IF NOT EXISTS muscle_load JSON NOT NULL DEFAULT '{}'"
                ))
                await conn.execute(text(
                    "ALTER TABLE workout_sessions "
                    "ADD COLUMN IF NOT EXISTS workout_id VARCHAR"
                ))
                await conn.execute(text(
                    "ALTER TABLE workout_sessions "
                    "ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT ''"
                ))
        yield

    app = FastAPI(title="aifactory-server", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.exercise_detector = LlmDetector(settings.openrouter_api_key, settings.openrouter_base_url, settings.detect_model)
    app.state.form_coach = LlmCoach(settings.openrouter_api_key, settings.openrouter_base_url, settings.detect_model)
    app.state.coach_generator = coach_generator or OpenRouterCoach(
        settings.openrouter_api_key, settings.openrouter_base_url, settings.coach_model
    )

    @app.exception_handler(RequestValidationError)
    async def log_validation_error(request: Request, exc: RequestValidationError):
        # Landmark payloads are large; log only where and why validation failed, never the data.
        first = exc.errors()[0] if exc.errors() else {}
        logging.getLogger("aifactory.validation").warning(
            "%s %s rejected: %s at %s", request.method, request.url.path, first.get("msg"), ".".join(str(p) for p in first.get("loc", ())))
        return JSONResponse(status_code=422, content={"detail": [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in exc.errors()[:3]]})

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(analysis_router)
    app.include_router(athletes_router)
    app.include_router(auth_router)
    app.include_router(activities_router)
    app.include_router(profile_router)
    app.include_router(workout_router)
    app.include_router(history_router)
    app.include_router(summary_router)
    app.include_router(social_router)

    return app


app = create_app()
