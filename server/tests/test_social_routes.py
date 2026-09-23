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


async def test_social_visibility_is_consistent_across_feed_profile_and_actions(app_and_client):
    _, client = app_and_client
    author_token = await _signup(client, "privacy-author@example.com", "Private Athlete")
    follower_token = await _signup(client, "privacy-follower@example.com", "Following Athlete")
    stranger_token = await _signup(client, "privacy-stranger@example.com", "Other Athlete")
    author_headers = {"Authorization": f"Bearer {author_token}"}
    follower_headers = {"Authorization": f"Bearer {follower_token}"}
    stranger_headers = {"Authorization": f"Bearer {stranger_token}"}
    author_id = (await client.get("/api/auth/me", headers=author_headers)).json()["id"]

    await client.put(f"/api/social/follows/{author_id}", headers=follower_headers)
    followers_post = await client.post(
        "/api/social/activities",
        json={"caption": "Followers only", "visibility": "followers"},
        headers=author_headers,
    )
    public_post = await client.post(
        "/api/social/activities",
        json={"caption": "Public update", "visibility": "public"},
        headers=author_headers,
    )
    private_id = followers_post.json()["id"]

    follower_feed = (await client.get("/api/social/feed?scope=following", headers=follower_headers)).json()["items"]
    assert {item["id"] for item in follower_feed} == {private_id, public_post.json()["id"]}
    stranger_feed = (await client.get("/api/social/feed?scope=everyone", headers=stranger_headers)).json()["items"]
    assert [item["id"] for item in stranger_feed] == [public_post.json()["id"]]
    assert (await client.get("/api/social/feed?scope=following", headers=stranger_headers)).json()["items"] == []

    stranger_profile = await client.get(f"/api/social/athletes/{author_id}", headers=stranger_headers)
    assert [item["id"] for item in stranger_profile.json()["activities"]] == [public_post.json()["id"]]
    assert (await client.put(f"/api/social/activities/{private_id}/reaction", headers=stranger_headers)).status_code == 404
    assert (await client.get(f"/api/social/activities/{private_id}/comments", headers=stranger_headers)).status_code == 404


async def test_repeated_social_actions_are_idempotent(app_and_client):
    _, client = app_and_client
    author_token = await _signup(client, "idempotent-author@example.com", "Steady Athlete")
    viewer_token = await _signup(client, "idempotent-viewer@example.com", "Repeat Athlete")
    author_headers = {"Authorization": f"Bearer {author_token}"}
    viewer_headers = {"Authorization": f"Bearer {viewer_token}"}
    author_id = (await client.get("/api/auth/me", headers=author_headers)).json()["id"]
    activity = await client.post(
        "/api/social/activities",
        json={"caption": "One action at a time", "visibility": "public"},
        headers=author_headers,
    )

    await client.put(f"/api/social/follows/{author_id}", headers=viewer_headers)
    assert (await client.put(f"/api/social/follows/{author_id}", headers=viewer_headers)).json()["following"]
    activity_id = activity.json()["id"]
    await client.put(f"/api/social/activities/{activity_id}/reaction", headers=viewer_headers)
    repeated = await client.put(f"/api/social/activities/{activity_id}/reaction", headers=viewer_headers)
    assert repeated.json()["reactionCount"] == 1
