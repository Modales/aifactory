from datetime import datetime, timedelta, timezone

from .conftest import SAMPLE_PAYLOAD


async def _signup(client, email: str, name: str) -> str:
    response = await client.post(
        "/api/auth/signup",
        json={"email": email, "password": "correct-horse-battery", "displayName": name},
    )
    return response.json()["accessToken"]


async def test_social_activity_feed_and_collaboration_flow(app_and_client):
    _, client = app_and_client
    first_token = await _signup(client, "first@example.com", "First Athlete")
    second_token = await _signup(client, "second@example.com", "Second Athlete")
    first_headers = {"Authorization": f"Bearer {first_token}"}
    second_headers = {"Authorization": f"Bearer {second_token}"}

    second_me = await client.get("/api/auth/me", headers=second_headers)
    second_id = second_me.json()["id"]
    assert (await client.put(f"/api/social/follows/{second_id}", headers=first_headers)).status_code == 200

    session = await client.post("/api/workout/session", json=SAMPLE_PAYLOAD, headers=second_headers)
    activity = await client.post(
        "/api/social/activities",
        json={"sessionId": session.json()["id"], "caption": "A strong squat set."},
        headers=second_headers,
    )
    assert activity.status_code == 201
    activity_id = activity.json()["id"]

    feed = await client.get("/api/social/feed", headers=first_headers)
    assert feed.status_code == 200
    assert feed.json()["items"][0]["author"]["displayName"] == "Second Athlete"
    assert feed.json()["items"][0]["workout"]["totalReps"] == SAMPLE_PAYLOAD["totalReps"]

    assert (await client.put(f"/api/social/activities/{activity_id}/reaction", headers=first_headers)).json()["reactedByMe"]
    comment = await client.post(
        f"/api/social/activities/{activity_id}/comments",
        params={"body": "Great work!"},
        headers=first_headers,
    )
    assert comment.status_code == 201
    assert (await client.get(f"/api/social/activities/{activity_id}/comments", headers=second_headers)).json()[0]["body"] == "Great work!"

    club = await client.post(
        "/api/social/clubs", json={"name": "Squat Squad", "description": "Train together"}, headers=first_headers
    )
    assert club.status_code == 201
    assert (await client.put(f"/api/social/clubs/{club.json()['id']}/membership", headers=second_headers)).json()["memberCount"] == 2

    starts_at = datetime.now(timezone.utc) - timedelta(hours=1)
    ends_at = datetime.now(timezone.utc) + timedelta(days=7)
    challenge = await client.post(
        "/api/social/challenges",
        json={
            "name": "Weekly reps",
            "metric": "reps",
            "startsAt": starts_at.isoformat(),
            "endsAt": ends_at.isoformat(),
            "clubId": club.json()["id"],
        },
        headers=first_headers,
    )
    assert challenge.status_code == 201
    challenge_id = challenge.json()["id"]
    assert (await client.put(f"/api/social/challenges/{challenge_id}/participation", headers=second_headers)).status_code == 200
    leaderboard = await client.get(f"/api/social/challenges/{challenge_id}/leaderboard", headers=first_headers)
    assert leaderboard.status_code == 200
    assert leaderboard.json()["entries"][0]["value"] == SAMPLE_PAYLOAD["totalReps"]
