import pytest
from httpx import ASGITransport, AsyncClient

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


@pytest.fixture
async def client(tmp_path):
    db_path = tmp_path / "test.db"
    app = create_app(f"sqlite+aiosqlite:///{db_path}")
    async with app.state.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    await app.state.engine.dispose()


async def test_create_session_persists_and_returns_id(client):
    res = await client.post("/api/workout/session", json=SAMPLE_PAYLOAD)

    assert res.status_code == 201
    body = res.json()
    assert isinstance(body["id"], str)
    assert "createdAt" in body


async def test_create_session_rejects_malformed_payload(client):
    res = await client.post("/api/workout/session", json={"exerciseId": "squat"})

    assert res.status_code == 422


async def test_get_summary_returns_full_session(client):
    created = await client.post("/api/workout/session", json=SAMPLE_PAYLOAD)
    session_id = created.json()["id"]

    res = await client.get(f"/api/workout/summary/{session_id}")

    assert res.status_code == 200
    body = res.json()
    assert body["id"] == session_id
    assert body["exerciseName"] == "Back Squat"
    assert body["totalReps"] == 8
    assert len(body["reps"]) == 2
    assert body["reps"][1]["flaws"] == ["Knee Valgus"]


async def test_get_summary_returns_404_when_missing(client):
    res = await client.get("/api/workout/summary/does-not-exist")

    assert res.status_code == 404
