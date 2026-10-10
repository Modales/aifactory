"""Live incremental buffer, sport-science set insights and the personalised coach brief."""
from datetime import datetime, timezone
from app.analysis.athlete import brief, history_item
from app.analysis.engine import analyze
from app.analysis.insights import muscle_demand, set_insights
from app.analysis.library import LIBRARY
from .test_analysis import payload, squat_stream


def _rep(i, seconds, checks=()):
    start = i * 4000
    return {'index': i + 1, 'startMs': start, 'endMs': start + seconds * 1000, 'durationSeconds': seconds, 'checks': list(checks)}


def _check(name, value):
    return {'name': name, 'value': value, 'passed': True}


def test_velocity_loss_rates_effort_like_vbt():
    easy = set_insights(LIBRARY['squat'], [_rep(i, 2.0) for i in range(5)], [])
    assert easy['velocityLossPct'] == 0 and easy['effort'] == 'easy'
    grind = set_insights(LIBRARY['squat'], [_rep(0, 1.5), _rep(1, 1.6), _rep(2, 2.0), _rep(3, 2.6), _rep(4, 3.0)], [])
    assert grind['velocityLossPct'] == 46 and grind['effort'] == 'near failure' and 'failure' in grind['notes'][0]
    assert set_insights(LIBRARY['squat'], [_rep(0, 2.0)] * 3, [])['effort'] is None   # too few reps to judge


def test_range_loss_is_reported_when_later_reps_get_shorter():
    rows, reps = [], []
    for i, bottom in enumerate((90, 90, 95, 120, 125)):
        reps.append(_rep(i, 2.0))
        rows += [{'t': i * 4000 + k * 200, 'knee': 170 - (170 - bottom) * (1 - abs(k - 5) / 5)} for k in range(11)]
    result = set_insights(LIBRARY['squat'], reps, rows)
    assert result['rangeLossPct'] >= 40 and any('range of motion shrank' in n for n in result['notes'])


def test_shallow_depth_cuts_long_length_muscles_most():
    full, _ = muscle_demand(LIBRARY['squat'], [_rep(0, 2, [_check('Squat depth', 95)])])
    half, notes = muscle_demand(LIBRARY['squat'], [_rep(0, 2, [_check('Squat depth', 145)])])
    assert full == LIBRARY['squat']['muscles']
    glute_drop = 1 - half['glutes'] / full['glutes']
    quad_drop = 1 - half['quads'] / full['quads']
    assert glute_drop > 2 * quad_drop > 0 and 'glutes' in notes[0]


def test_forward_lean_shifts_a_squat_toward_the_hips():
    lean, notes = muscle_demand(LIBRARY['squat'], [_rep(0, 2, [_check('Squat depth', 95), _check('Torso angle at the bottom', 60)])])
    base = LIBRARY['squat']['muscles']
    assert lean['glutes'] > base['glutes'] and lean['quads'] < base['quads'] and 'hip-dominant' in notes[0]


def test_report_carries_insights_and_measured_muscle_demand():
    result = analyze(payload())
    assert result['setInsights'] is not None and 'muscleNotes' in result
    base = LIBRARY['squat']['muscles']
    # Full depth: nothing is cut; any shift only reflects the measured torso angle.
    assert set(result['muscleDemand']) == set(base) and result['muscleDemand']['quads'] >= base['quads']


def test_coach_gets_the_athlete_brief():
    seen = {}
    def coach(name, summary, reps, session_key=None, seconds=0):
        seen['summary'] = summary
        return {'cues': ['ok'], 'camera': ''}
    analyze(payload(confirmedExercise='squat'), coach=coach, athlete=lambda ex, lib: f'Profile: goal: strength ({ex}).')
    assert 'ATHLETE\nProfile: goal: strength (squat).' in seen['summary']


def test_brief_includes_profile_injuries_and_same_exercise_history():
    when = datetime(2026, 10, 1, tzinfo=timezone.utc)
    history = [history_item({'exercise': 'back_squat', 'score': 72, 'repCount': 8, 'focus': [{'name': 'Squat depth', 'passed': False}]}, when),
               history_item({'exercise': 'curl', 'score': 90, 'repCount': 10, 'focus': []}, when)]
    text = brief({'fitness_goal': 'build muscle', 'experience_level': 'beginner', 'injuries': ['left knee'], 'equipment': []}, history, 'squat', LIBRARY)
    assert 'goal: build muscle' in text and 'left knee' in text
    assert '2026-10-01: 8 reps, form 72/100, main fault squat depth' in text and 'curl' not in text.lower()
    assert 'No previous sets' in brief(None, [], 'squat', LIBRARY)


async def test_live_endpoint_appends_only_new_frames(auth_client):
    stream = squat_stream()
    meta = {k: v for k, v in stream.items() if k != 'frames'}
    first = await auth_client.post('/api/analysis/live', json={'sessionKey': 'set-1', 'streams': [{**meta, 'fromIndex': 0, 'frames': stream['frames'][:40]}]})
    assert first.status_code == 200
    second = await auth_client.post('/api/analysis/live', json={'sessionKey': 'set-1', 'streams': [{**meta, 'fromIndex': 40, 'frames': stream['frames'][40:]}]})
    full = await auth_client.post('/api/analysis/evaluate', json={'streams': [stream]})
    assert second.status_code == 200 and second.json()['repCount'] == full.json()['repCount'] == 2
    assert second.json()['reps'] == full.json()['reps']


async def test_live_endpoint_asks_for_a_resend_when_out_of_sync(auth_client):
    stream = squat_stream()
    meta = {k: v for k, v in stream.items() if k != 'frames'}
    stale = await auth_client.post('/api/analysis/live', json={'sessionKey': 'fresh', 'streams': [{**meta, 'fromIndex': 25, 'frames': stream['frames'][25:]}]})
    assert stale.status_code == 409 and stale.json()['expected'] == {'side': 0}
    resent = await auth_client.post('/api/analysis/live', json={'sessionKey': 'fresh', 'streams': [{**meta, 'fromIndex': 0, 'frames': stream['frames']}]})
    assert resent.status_code == 200 and resent.json()['repCount'] == 2


async def test_live_buffers_are_private_per_user(app_and_client):
    from httpx import ASGITransport, AsyncClient
    app, ac = app_and_client
    stream = squat_stream()
    meta = {k: v for k, v in stream.items() if k != 'frames'}
    tokens = []
    for email in ('a@example.com', 'b@example.com'):
        res = await ac.post('/api/auth/signup', json={'email': email, 'password': 'password-12345', 'displayName': 'X'})
        tokens.append(res.json()['accessToken'])
    async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as other:
        await other.post('/api/analysis/live', headers={'Authorization': f'Bearer {tokens[0]}'}, json={'sessionKey': 'k', 'streams': [{**meta, 'fromIndex': 0, 'frames': stream['frames'][:40]}]})
        # Same session key, different user: their buffer is empty, so continuing from 40 is refused.
        res = await other.post('/api/analysis/live', headers={'Authorization': f'Bearer {tokens[1]}'}, json={'sessionKey': 'k', 'streams': [{**meta, 'fromIndex': 40, 'frames': stream['frames'][40:]}]})
        assert res.status_code == 409
