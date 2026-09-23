import pytest

from app.coach import (
    OpenRouterCoach,
    CoachError,
    build_prompt,
    describe_api_error,
    parse_coach_json,
)
from app.orm import UserProfileRecord, WorkoutSessionRecord

from .conftest import SAMPLE_PAYLOAD


def _session_record() -> WorkoutSessionRecord:
    return WorkoutSessionRecord(
        id="sess-1",
        exercise_id="squat",
        exercise_name="Back Squat",
        camera_angle="Side",
        duration_seconds=184,
        total_reps=8,
        avg_form_score=87,
        peak_effort=92,
        reps=SAMPLE_PAYLOAD["reps"],
    )


def test_prompt_carries_per_rep_telemetry():
    prompt = build_prompt(_session_record(), None)

    assert "Back Squat" in prompt
    assert "Flaws detected across the set: Knee Valgus x1" in prompt
    assert "rep 2 | form 72/100" in prompt
    assert "Knees drifting inward" in prompt


def test_prompt_carries_profile_context_when_available():
    profile = UserProfileRecord(
        user_id="u1",
        fitness_goal="Build strength",
        experience_level="Intermediate",
        training_days_per_week=4,
        injuries=["Left knee"],
        equipment=["Barbell"],
    )

    prompt = build_prompt(_session_record(), profile)

    assert "goal: Build strength" in prompt
    assert "injuries: Left knee" in prompt


def test_prompt_reports_a_clean_set():
    session = _session_record()
    session.reps = [{**SAMPLE_PAYLOAD["reps"][0]}]

    assert "Flaws detected across the set: none" in build_prompt(session, None)


def test_prompt_states_the_json_contract():
    prompt = build_prompt(_session_record(), None)

    assert "Reply with a single JSON object" in prompt
    assert '"focusAreas"' in prompt


def test_parse_coach_json_reads_a_plain_object():
    data = parse_coach_json('{"headline": "Good set", "focusAreas": ["Knees out"]}')

    assert data["headline"] == "Good set"
    assert data["focusAreas"] == ["Knees out"]


def test_parse_coach_json_survives_a_markdown_fence():
    data = parse_coach_json('```json\n{"headline": "Fenced"}\n```')

    assert data["headline"] == "Fenced"


def test_parse_coach_json_survives_surrounding_prose():
    data = parse_coach_json('Sure! Here you go:\n{"headline": "Chatty"}\nHope that helps.')

    assert data["headline"] == "Chatty"


def test_parse_coach_json_rejects_a_reply_with_no_object():
    with pytest.raises(CoachError, match="no JSON object"):
        parse_coach_json("I cannot help with that.")


def test_parse_coach_json_rejects_malformed_json():
    with pytest.raises(CoachError, match="Could not parse"):
        parse_coach_json('{"headline": , "summary": }')


def test_parse_coach_json_rejects_an_unterminated_object():
    with pytest.raises(CoachError, match="no JSON object"):
        parse_coach_json('{"headline": "unterminated')


class FakeApiError(Exception):
    def __init__(self, status_code, body):
        super().__init__("boom")
        self.status_code = status_code
        self.body = body


def test_out_of_funds_gets_an_actionable_message_from_the_raw_body():
    exc = FakeApiError(
        403,
        {
            "message": "You've run out of funds.",
            "error": {"data": {"kind": "err_insufficent_credits"}},
        },
    )

    assert "out of funds" in describe_api_error(exc)
    assert "openrouter.ai/settings/credits" in describe_api_error(exc)


def test_out_of_funds_is_recognised_when_the_sdk_unwraps_the_body():
    exc = FakeApiError(
        403,
        {
            "name": "OutOfFundsException",
            "message": "You've run out of funds.",
            "data": {"kind": "err_insufficent_credits"},
        },
    )

    assert "out of funds" in describe_api_error(exc)


def test_bad_key_unknown_model_and_empty_balance_get_their_own_messages():
    assert "rejected the API key" in describe_api_error(FakeApiError(401, {}))
    assert "COACH_MODEL" in describe_api_error(FakeApiError(404, {}))
    assert "out of funds" in describe_api_error(FakeApiError(402, {}))


async def test_openrouter_coach_fails_clearly_without_an_api_key():
    coach = OpenRouterCoach(None, "https://openrouter.ai/api/v1", "openai/gpt-4o-mini")

    with pytest.raises(CoachError, match="OPENROUTER_API_KEY"):
        await coach(_session_record(), None)


async def test_generate_summary_runs_the_job_and_stores_the_result(auth_client, coach):
    created = await auth_client.post("/api/workout/session", json=SAMPLE_PAYLOAD)
    session_id = created.json()["id"]

    queued = await auth_client.post(
        "/api/workout/generate-summary", json={"sessionId": session_id}
    )

    assert queued.status_code == 202
    job_id = queued.json()["jobId"]
    assert queued.json()["status"] == "pending"

    polled = await auth_client.get(f"/api/workout/generate-summary/{job_id}")
    body = polled.json()
    assert polled.status_code == 200
    assert body["status"] == "complete"
    assert body["headline"] == "Depth held, knees caved on rep 2"
    assert body["focusAreas"] == ["Drive the knees out to fix knee valgus"]
    assert body["model"] == "stub-model"
    assert body["completedAt"] is not None
    assert len(coach.calls) == 1


async def test_generate_summary_passes_the_profile_to_the_coach(auth_client, coach):
    await auth_client.put(
        "/api/users/me/profile",
        json={"fitnessGoal": "Build strength", "injuries": ["Left knee"]},
    )
    created = await auth_client.post("/api/workout/session", json=SAMPLE_PAYLOAD)

    await auth_client.post(
        "/api/workout/generate-summary", json={"sessionId": created.json()["id"]}
    )

    _, profile = coach.calls[0]
    assert profile is not None
    assert profile.fitness_goal == "Build strength"


async def test_generate_summary_records_a_failed_job(app_and_client, coach):
    app, client = app_and_client
    app.state.coach_generator = type(coach)(error=RuntimeError("upstream exploded"))
    created = await client.post("/api/workout/session", json=SAMPLE_PAYLOAD)

    queued = await client.post(
        "/api/workout/generate-summary", json={"sessionId": created.json()["id"]}
    )
    polled = await client.get(f"/api/workout/generate-summary/{queued.json()['jobId']}")

    body = polled.json()
    assert body["status"] == "failed"
    assert body["error"] == "upstream exploded"
    assert body["summary"] is None


async def test_generate_summary_404s_for_an_unknown_session(client):
    res = await client.post("/api/workout/generate-summary", json={"sessionId": "nope"})

    assert res.status_code == 404


async def test_generate_summary_404s_for_someone_elses_session(auth_client, client):
    created = await auth_client.post("/api/workout/session", json=SAMPLE_PAYLOAD)

    res = await client.post(
        "/api/workout/generate-summary",
        json={"sessionId": created.json()["id"]},
        headers={"Authorization": ""},
    )

    assert res.status_code == 404


async def test_latest_coach_summary_for_a_session(auth_client):
    created = await auth_client.post("/api/workout/session", json=SAMPLE_PAYLOAD)
    session_id = created.json()["id"]
    await auth_client.post("/api/workout/generate-summary", json={"sessionId": session_id})

    res = await auth_client.get(f"/api/workout/{session_id}/coach-summary")

    assert res.status_code == 200
    assert res.json()["status"] == "complete"


async def test_latest_coach_summary_404s_when_never_generated(auth_client):
    created = await auth_client.post("/api/workout/session", json=SAMPLE_PAYLOAD)

    res = await auth_client.get(f"/api/workout/{created.json()['id']}/coach-summary")

    assert res.status_code == 404


async def test_poll_404s_for_an_unknown_job(client):
    assert (await client.get("/api/workout/generate-summary/nope")).status_code == 404
