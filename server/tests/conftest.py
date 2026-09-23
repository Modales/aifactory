import pytest
from httpx import ASGITransport, AsyncClient

from app.coach import CoachResult
from app.database import Base
from app.main import create_app

SAMPLE_PAYLOAD = {
    "exerciseId": "squat",
    "exerciseName": "Back Squat",
    "cameraAngle": "Side",
    "durationSeconds": 184,
    "totalReps": 8,
    "avgFormScore": 87,
    "peakEffort": 92,
    "reps": [
        {
            "rep": 1,
            "tempo": 2.4,
            "concentricTime": 0.9,
            "eccentricTime": 1.5,
            "peakAngle": 91,
            "velocity": 145,
            "formScore": 90,
            "effort": 60,
            "cue": "Nice depth",
            "severity": "good",
            "flaws": [],
        },
        {
            "rep": 2,
            "tempo": 2.6,
            "concentricTime": 1.0,
            "eccentricTime": 1.6,
            "peakAngle": 98,
            "velocity": 130,
            "formScore": 72,
            "effort": 78,
            "cue": "Knees drifting inward",
            "severity": "warn",
            "flaws": ["Knee Valgus"],
        },
    ],
}

SIGNUP_PAYLOAD = {
    "email": "lifter@example.com",
    "password": "correct-horse-battery",
    "displayName": "Aditya",
}


class StubCoach:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.calls: list[tuple] = []

    async def __call__(self, session, profile):
        self.calls.append((session, profile))
        if self.error is not None:
            raise self.error
        return CoachResult(
            headline="Depth held, knees caved on rep 2",
            summary=f"You hit {session.total_reps} reps at an average form score of "
            f"{session.avg_form_score}.",
            focus_areas=["Drive the knees out to fix knee valgus"],
            next_session="Drop 10% off the bar and rebuild the groove.",
            model="stub-model",
        )


@pytest.fixture(autouse=True)
def isolate_env(monkeypatch):
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)


@pytest.fixture
def coach():
    return StubCoach()


@pytest.fixture
async def app_and_client(tmp_path, coach):
    db_path = tmp_path / "test.db"
    app = create_app(f"sqlite+aiosqlite:///{db_path}", coach_generator=coach)
    async with app.state.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield app, ac

    await app.state.engine.dispose()


@pytest.fixture
async def client(app_and_client):
    return app_and_client[1]


@pytest.fixture
async def auth_client(app_and_client):
    _, ac = app_and_client
    res = await ac.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
    token = res.json()["accessToken"]
    ac.headers["Authorization"] = f"Bearer {token}"
    return ac
