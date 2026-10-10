from app.security import hash_password, verify_password

from .conftest import SIGNUP_PAYLOAD


def test_password_hash_round_trips():
    encoded = hash_password("correct-horse-battery")

    assert encoded.startswith("pbkdf2_sha256$")
    assert "correct-horse-battery" not in encoded
    assert verify_password("correct-horse-battery", encoded)
    assert not verify_password("wrong-password", encoded)


def test_verify_password_rejects_corrupt_hash():
    assert not verify_password("anything", "not-a-real-hash")


async def test_signup_returns_token_and_user(client):
    res = await client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)

    assert res.status_code == 201
    body = res.json()
    assert body["tokenType"] == "bearer"
    assert body["user"]["email"] == "lifter@example.com"
    assert body["user"]["displayName"] == "Aditya"
    assert "password" not in str(body)


async def test_signup_rejects_duplicate_email(client):
    await client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
    res = await client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)

    assert res.status_code == 409


async def test_signup_rejects_short_password(client):
    res = await client.post(
        "/api/auth/signup", json={**SIGNUP_PAYLOAD, "password": "short"}
    )

    assert res.status_code == 422


async def test_login_succeeds_with_correct_credentials(client):
    await client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)

    res = await client.post(
        "/api/auth/login",
        json={"email": SIGNUP_PAYLOAD["email"], "password": SIGNUP_PAYLOAD["password"]},
    )

    assert res.status_code == 200
    assert res.json()["accessToken"]


async def test_login_rejects_wrong_password(client):
    await client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)

    res = await client.post(
        "/api/auth/login", json={"email": SIGNUP_PAYLOAD["email"], "password": "nope"}
    )

    assert res.status_code == 401


async def test_me_requires_a_token(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    assert (
        await client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    ).status_code == 401


async def test_me_returns_the_signed_in_user(auth_client):
    res = await auth_client.get("/api/auth/me")

    assert res.status_code == 200
    assert res.json()["email"] == "lifter@example.com"


async def test_profile_starts_empty_then_persists_onboarding_answers(auth_client):
    initial = await auth_client.get("/api/users/me/profile")
    assert initial.status_code == 200
    assert initial.json()["onboardingCompleted"] is False

    res = await auth_client.put(
        "/api/users/me/profile",
        json={
            "fitnessGoal": "Build strength",
            "experienceLevel": "Intermediate",
            "age": 27,
            "heightCm": 178,
            "weightKg": 74.5,
            "trainingDaysPerWeek": 4,
            "primaryExercises": ["squat", "deadlift"],
            "injuries": ["Left knee"],
            "equipment": ["Barbell", "Rack"],
            "onboardingAnswers": {"q_camera_angle": "Side", "q_session_length": "45m"},
            "onboardingCompleted": True,
        },
    )

    assert res.status_code == 200
    body = res.json()
    assert body["fitnessGoal"] == "Build strength"
    assert body["injuries"] == ["Left knee"]
    assert body["onboardingAnswers"]["q_camera_angle"] == "Side"
    assert body["onboardingCompleted"] is True

    reread = await auth_client.get("/api/users/me/profile")
    assert reread.json()["primaryExercises"] == ["squat", "deadlift"]


async def test_profile_rejects_out_of_range_answers(auth_client):
    res = await auth_client.put("/api/users/me/profile", json={"age": 4})

    assert res.status_code == 422


async def test_profile_requires_authentication(client):
    assert (await client.get("/api/users/me/profile")).status_code == 401
    assert (await client.put("/api/users/me/profile", json={})).status_code == 401


async def test_login_locks_out_after_repeated_failures(client):
    await client.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
    wrong = {"email": SIGNUP_PAYLOAD["email"], "password": "wrong-password-123"}
    for _ in range(5):
        assert (await client.post("/api/auth/login", json=wrong)).status_code == 401
    locked = await client.post("/api/auth/login", json=wrong)
    assert locked.status_code == 429 and int(locked.headers["Retry-After"]) > 0
    # Even the right password is refused while locked out.
    right = {"email": SIGNUP_PAYLOAD["email"], "password": SIGNUP_PAYLOAD["password"]}
    assert (await client.post("/api/auth/login", json=right)).status_code == 429


async def _fail(ac, n, email=None):
    wrong = {"email": email or SIGNUP_PAYLOAD["email"], "password": "wrong-password-123"}
    return [(await ac.post("/api/auth/login", json=wrong)).status_code for _ in range(n)]


def _client_from(app, ip):
    from httpx import ASGITransport, AsyncClient
    return AsyncClient(transport=ASGITransport(app=app, client=(ip, 1234)), base_url="http://test")


async def test_lockout_is_per_ip_so_strangers_cannot_lock_the_owner_out(app_and_client):
    app, owner = app_and_client
    await owner.post("/api/auth/signup", json=SIGNUP_PAYLOAD)
    async with _client_from(app, "203.0.113.9") as attacker:
        assert await _fail(attacker, 6) == [401] * 5 + [429]
    right = {"email": SIGNUP_PAYLOAD["email"], "password": SIGNUP_PAYLOAD["password"]}
    assert (await owner.post("/api/auth/login", json=right)).status_code == 200


async def test_lockout_caps_attempts_spread_across_many_ips(app_and_client, monkeypatch):
    from app.routes import auth
    monkeypatch.setattr(auth, "MAX_FAILED_LOGINS_PER_EMAIL", 4)
    app, _ = app_and_client
    for i in range(4):
        async with _client_from(app, f"198.51.100.{i}") as ac:
            assert await _fail(ac, 1) == [401]
    async with _client_from(app, "198.51.100.99") as ac:
        assert await _fail(ac, 1) == [429]


async def test_lockout_survives_an_api_restart(tmp_path):
    from httpx import ASGITransport, AsyncClient
    from app.database import Base
    from app.main import create_app
    url = f"sqlite+aiosqlite:///{tmp_path / 'restart.db'}"
    for attempt, expected in ((5, [401] * 5), (1, [429])):
        app = create_app(url)
        async with app.state.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            assert await _fail(ac, attempt) == expected
        await app.state.engine.dispose()


def test_retry_after_waits_for_enough_attempts_to_expire():
    from app.routes.auth import _retry_after
    assert _retry_after([1.0, 2.0], 3, 10.0) is None
    assert _retry_after([5.0, 1.0, 3.0], 3, 10.0) == int(1.0 + 900 - 10.0) + 1


def test_production_requires_a_strong_jwt_secret(monkeypatch):
    import pytest
    from app.config import load_settings
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    with pytest.raises(RuntimeError):
        load_settings("sqlite+aiosqlite://")
    monkeypatch.setenv("JWT_SECRET", "short")
    with pytest.raises(RuntimeError):
        load_settings("sqlite+aiosqlite://")
    monkeypatch.setenv("JWT_SECRET", "x" * 40)
    assert load_settings("sqlite+aiosqlite://").jwt_secret == "x" * 40
    monkeypatch.delenv("APP_ENV")
    monkeypatch.delenv("JWT_SECRET")
    assert load_settings("sqlite+aiosqlite://").jwt_secret  # dev default still boots
