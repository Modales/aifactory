"""End-to-end tests for the Strava-style activity API: one upload → processed, persisted, shared."""
import pytest
from httpx import ASGITransport, AsyncClient

from app.database import Base
from app.main import create_app
from .conftest import StubCoach
from .test_analysis import squat_stream


async def signup(client, name, email):
    res = await client.post('/api/auth/signup', json={'displayName': name, 'email': email, 'password': 'activity-test-password'})
    return res.json()['user']['id'], {'Authorization': f"Bearer {res.json()['accessToken']}"}


def body(**changes):
    return {'streams': [squat_stream()], **changes}


async def test_record_activity_processes_persists_and_feeds_everything(app_and_client):
    _, client = app_and_client
    _, auth = await signup(client, 'Recorder', 'recorder@example.com')
    # Unauthenticated recordings are rejected: an activity belongs to an athlete.
    assert (await client.post('/api/activities', json=body())).status_code == 401

    res = await client.post('/api/activities', json=body(caption='Leg day', visibility='public'), headers=auth)
    assert res.status_code == 201, res.text
    a = res.json()
    assert a['exerciseId'] == 'squat' and a['exerciseName'] == 'Squat'
    assert a['repCount'] == 2 and a['score'] == 100 and a['status'] == 'scored'
    assert a['selectionSource'] == 'detected' and a['family'] == 'squat'
    assert a['muscleLoad']['entries'] and a['reps'][0]['formScore'] == 100
    assert a['caption'] == 'Leg day' and a['visibility'] == 'public'
    assert a['analysisId'] and a['coach'] is None and a['reactionCount'] == 0

    # The training log lists it; the detail round-trips with the full report.
    log = (await client.get('/api/activities', headers=auth)).json()
    assert log['total'] == 1 and log['items'][0]['id'] == a['id'] and log['items'][0]['repCount'] == 2
    detail = (await client.get(f"/api/activities/{a['id']}", headers=auth)).json()
    assert detail['headline'].startswith('Squat: 2 reps at 100/100') and len(detail['focus']) == 4

    # One aggregate: the legacy endpoints see the same set.
    assert (await client.get('/api/workouts/history', headers=auth)).json()['total'] == 1
    stats = (await client.get('/api/athletes/me/stats', headers=auth)).json()
    assert stats['totalSessions'] == 1 and stats['totalReps'] == 2 and stats['byExercise'][0]['exerciseId'] == 'squat'
    legacy_stats = (await client.get('/api/workouts/stats', headers=auth)).json()
    assert legacy_stats == stats


async def test_unscored_recording_is_rejected_with_guidance(auth_client):
    s = squat_stream()
    for f in s['frames']:
        for p in f['landmarks']:
            p['visibility'] = .2
    res = await auth_client.post('/api/activities', json={'streams': [s]})
    assert res.status_code == 422 and res.json()['detail']
    assert (await auth_client.get('/api/activities')).json()['total'] == 0


async def test_sharing_follows_visibility_like_a_strava_upload(app_and_client):
    _, client = app_and_client
    owner_id, owner = await signup(client, 'Owner', 'owner@example.com')
    _, watcher = await signup(client, 'Watcher', 'watcher@example.com')
    await client.put(f'/api/social/follows/{owner_id}', headers=watcher)

    quiet = await client.post('/api/activities', json=body(visibility='private', caption='quiet'), headers=owner)
    assert quiet.status_code == 201
    assert quiet.json()['visibility'] == 'private' and quiet.json()['caption'] == 'quiet'
    feed = (await client.get('/api/social/feed', headers=watcher)).json()
    assert feed['items'] == []

    shared = await client.post('/api/activities', json=body(visibility='followers', caption='shared'), headers=owner)
    assert shared.status_code == 201
    feed = (await client.get('/api/social/feed', headers=watcher)).json()
    assert len(feed['items']) == 1 and feed['items'][0]['workout']['exerciseId'] == 'squat'
    # Kudos land on the activity and show up in the owner's log.
    await client.put(f"/api/social/activities/{feed['items'][0]['id']}/reaction", headers=watcher)
    item = (await client.get('/api/activities', headers=owner)).json()['items'][0]
    assert item['reactionCount'] == 1


async def test_activities_are_owned_and_deletable(app_and_client):
    _, client = app_and_client
    _, owner = await signup(client, 'OwnerTwo', 'owner2@example.com')
    _, other = await signup(client, 'OtherTwo', 'other2@example.com')
    res = await client.post('/api/activities', json=body(visibility='public'), headers=owner)
    aid = res.json()['id']

    assert (await client.get(f'/api/activities/{aid}', headers=other)).status_code == 404
    assert (await client.delete(f'/api/activities/{aid}', headers=other)).status_code == 404
    assert (await client.delete(f'/api/activities/{aid}', headers=owner)).status_code == 204
    assert (await client.get(f'/api/activities/{aid}', headers=owner)).status_code == 404
    # The whole aggregate is gone: legacy history, telemetry, and the public feed entry.
    assert (await client.get(f'/api/workouts/history/{aid}', headers=owner)).status_code == 404
    assert (await client.get(f'/api/workouts/history/{aid}/telemetry', headers=owner)).status_code == 404
    feed = (await client.get('/api/social/feed?scope=everyone', headers=other)).json()
    assert feed['items'] == []


async def test_coach_debrief_is_part_of_processing_when_configured(monkeypatch, tmp_path):
    monkeypatch.setenv('OPENROUTER_API_KEY', 'test-key')
    app = create_app(f'sqlite+aiosqlite:///{tmp_path}/coach.db', coach_generator=StubCoach())
    # Deterministic rules detect the squat; the live-loop LLM helpers stay off the network.
    app.state.exercise_detector = None
    app.state.form_coach = None
    async with app.state.engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url='http://test') as client:
        _, auth = await signup(client, 'Coached', 'coached@example.com')
        res = await client.post('/api/activities', json=body(), headers=auth)
        assert res.status_code == 201, res.text
        detail = (await client.get(f"/api/activities/{res.json()['id']}", headers=auth)).json()
        assert detail['coach'] is not None and detail['coach']['status'] == 'complete'
        assert detail['coach']['headline'] == 'Depth held, knees caved on rep 2'
        # Same job is visible through the legacy polling endpoints.
        legacy = await client.get(f"/api/workout/{res.json()['id']}/coach-summary", headers=auth)
        assert legacy.status_code == 200 and legacy.json()['model'] == 'stub-model'
    await app.state.engine.dispose()
