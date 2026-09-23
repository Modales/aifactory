from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .coach import AimlCoach, CoachGenerator
from .config import load_settings
from .database import Base, make_engine_and_session_factory
from .routes.auth import router as auth_router
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
        yield

    app = FastAPI(title="aifactory-server", lifespan=lifespan)
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.coach_generator = coach_generator or AimlCoach(
        settings.aiml_api_key, settings.aiml_base_url, settings.coach_model
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(profile_router)
    app.include_router(workout_router)
    app.include_router(history_router)
    app.include_router(summary_router)
    app.include_router(social_router)

    return app


app = create_app()
create_app()
