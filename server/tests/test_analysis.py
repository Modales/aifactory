"""Synthetic geometry/contract regression tests, NOT real-world accuracy validation."""
from copy import deepcopy
from math import cos, sin, pi
import pytest
from pydantic import ValidationError
from app.analysis.engine import analyze, angle, classify, segments
from app.analysis.schemas import AnalysisRequest
from .conftest import SAMPLE_PAYLOAD


def squat_stream(camera_id='side', view='side', offset=0, ratio=1):
    frames = []
    for i in range(81):
        # Two controlled four-second repetitions; generated geometry only.
        theta = (1-cos(i/40*2*pi))/2 * 50*pi/180
        ankle = (.5, .95)
        knee = (.5+sin(theta)*.25, .95-cos(theta)*.25)
        hip = (.5, .95-cos(theta)*.5)
        shoulder = (hip[0]-sin(theta)*.1, hip[1]-.25)
        elbow = (shoulder[0], shoulder[1]+.12)
        wrist = (shoulder[0], shoulder[1]+.24)
        p = [{'x':.5, 'y':.5, 'visibility':.99} for _ in range(33)]
        for side in (0,1):
            for index,xy in ((11,shoulder),(13,elbow),(15,wrist),(23,hip),(25,knee),(27,ankle)):
                p[index+side] = {'x':(xy[0]+side*.015)/ratio,'y':xy[1],'visibility':.99}
        if view == 'frontal':
            for index in (11,23,25,27):
                p[index]['x']=.3/ratio; p[index+1]['x']=.7/ratio
        frames.append({'timestampMs':i*200,'landmarks':p})
    return {'cameraId':camera_id,'view':view,'aspectRatio':ratio,'offsetMs':offset,'frames':frames}


def payload(**changes):
    return AnalysisRequest.model_validate({'streams':[squat_stream()],**changes})


def test_squat_detects_and_scores_actual_joint_geometry():
    result=analyze(payload())
    assert result['exercise']=='squat'
    assert result['selectionSource']=='detected'
    assert result['repCount']==2
    assert result['score']==100
    assert len(result['reps'][0]['checks'])==2
    assert 'knee tracking' in ' '.join(result['notAssessed']).lower()


def test_aspect_ratio_correction_preserves_angles():
    a=analyze(payload())
    b=analyze(payload(streams=[squat_stream(ratio=16/9)]))
    assert a['reps']==b['reps']


def test_lower_visibility_abstains_instead_of_scoring():
    s=squat_stream()
    for f in s['frames']:
        for p in f['landmarks']: p['visibility']=.2
    result=analyze(payload(streams=[s],confirmedExercise='squat'))
    assert result['score'] is None and result['repCount']==0


def test_static_pose_and_partial_rep_do_not_count():
    s=squat_stream();s['frames']=s['frames'][:20]
    assert analyze(payload(streams=[s],confirmedExercise='squat'))['repCount']==0
    for f in s['frames']: f['landmarks']=deepcopy(s['frames'][0]['landmarks'])
    assert analyze(payload(streams=[s]))['exercise'] is None


def test_conflicting_confirmed_movement_abstains():
    r=analyze(payload(confirmedExercise='curl'))
    assert r['score'] is None
    assert any('differs' in w for w in r['warnings'])


def test_frontal_only_has_no_sagittal_score():
    r=analyze(payload(streams=[squat_stream(view='frontal')],confirmedExercise='squat'))
    assert r['score'] is None and r['repCount']==0
    assert any('side view' in w for w in r['warnings'])


def test_two_views_count_once_and_add_only_visible_checks():
    side=squat_stream()
    frontal=squat_stream('front','frontal')
    r=analyze(payload(streams=[side,frontal],synchronized=True))
    assert r['repCount']==2
    assert r['score']==100
    assert len(r['reps'][0]['checks'])==3
    assert r['reps'][0]['checks'][-1]['cameraId']=='front'
    # A second side view does not duplicate either reps or checks.
    r=analyze(payload(streams=[side,squat_stream('side2')],synchronized=True))
    assert r['repCount']==2 and len(r['reps'][0]['checks'])==2


def test_offsets_align_same_events_and_nonoverlap_rejected():
    front=squat_stream('front','frontal',offset=-3000)
    for f in front['frames']: f['timestampMs']+=3000
    r=analyze(payload(streams=[squat_stream(),front],synchronized=True))
    assert len(r['reps'][0]['checks'])==3
    front['offsetMs']=100000
    with pytest.raises(ValueError,match='overlap'):
        analyze(payload(streams=[squat_stream(),front],synchronized=True))


def test_occluded_frontal_view_does_not_add_a_passing_check():
    front=squat_stream('front','frontal')
    for f in front['frames']:
        for i in (25,26,27,28): f['landmarks'][i]['visibility']=.1
    r=analyze(payload(streams=[squat_stream(),front],synchronized=True))
    assert all(len(rep['checks'])==2 for rep in r['reps'])


def test_frontal_knee_deviation_reduces_visible_check_score():
    front=squat_stream('front','frontal')
    for f in front['frames']:
        f['landmarks'][25]['x']=.48;f['landmarks'][26]['x']=.52
    r=analyze(payload(streams=[squat_stream(),front],synchronized=True))
    assert r['score']==67
    assert 'knee tracking' in ' '.join(r['reps'][0]['feedback']).lower()


def test_gap_breaks_rep_continuity():
    rows=[{'t':i*200,'knee':v} for i,v in enumerate([170,170,150,110,90,90,100,160,170,170])]
    assert len(segments(rows,'knee'))==1
    rows[5]['knee']=None
    assert segments(rows,'knee')==[]
    rows[5]['knee']=90
    for r in rows[5:]:r['t']+=2000
    assert segments(rows,'knee')==[]


@pytest.mark.parametrize('exercise',['squat','lunge','deadlift','curl','ohp','bench'])
def test_classifier_movement_signatures(exercise):
    rows=[]
    for i in range(40):
        d=(1-cos(i/39*2*pi))/2
        rows.append({'t':i*200,'knee':170-(90*d if exercise in ('squat','lunge') else 10*d),
                     'otherKnee':170-(20*d if exercise=='lunge' else 90*d),
                     'hip':170-(70*d if exercise in ('squat','lunge','deadlift') else 5*d),
                     'elbow':170-(100*d if exercise in ('curl','ohp','bench') else 5*d),
                     'trunk':80 if exercise=='bench' else 50*d if exercise=='deadlift' else 10,
                     'overhead':exercise=='ohp'})
    detected,confidence=classify([{'view':'side','rows':rows}])
    assert detected==exercise
    assert (confidence<.68)==(exercise=='bench')


def test_contract_rejects_invalid_or_unconfirmed_streams():
    s=squat_stream()
    with pytest.raises(ValidationError):payload(streams=[s,s])
    with pytest.raises(ValidationError):payload(streams=[s,squat_stream('other')])
    s['frames'][1]['timestampMs']=s['frames'][0]['timestampMs']
    with pytest.raises(ValidationError):payload(streams=[s])
    s=squat_stream();s['frames'][0]['landmarks'][0]['x']=float('nan')
    with pytest.raises(ValidationError):payload(streams=[s])
    assert angle((0,0),(0,0),(0,0)) is None


async def test_analysis_requires_auth_and_reports_are_owned(app_and_client):
    _,client=app_and_client
    body=payload(persist=True).model_dump()
    assert (await client.post('/api/analysis/evaluate',json=body)).status_code==401
    signup=await client.post('/api/auth/signup',json={'displayName':'Analysis One','email':'analysis1@example.com','password':'analysis-test-password'})
    first={'Authorization':f"Bearer {signup.json()['accessToken']}"}
    response=await client.post('/api/analysis/evaluate',json=body,headers=first)
    assert response.status_code==200
    data=response.json();assert data['repCount']==2
    assert (await client.get(f"/api/analysis/reports/{data['analysisId']}",headers=first)).json()['score']==100
    signup=await client.post('/api/auth/signup',json={'displayName':'Analysis Two','email':'analysis2@example.com','password':'analysis-test-password'})
    other={'Authorization':f"Bearer {signup.json()['accessToken']}"}
    assert (await client.get(f"/api/analysis/reports/{data['analysisId']}",headers=other)).status_code==404
    forged={**SAMPLE_PAYLOAD,'analysisId':data['analysisId'],'totalReps':999,'avgFormScore':1}
    assert (await client.post('/api/workout/session',json=forged,headers=other)).status_code==404
    saved=await client.post('/api/workout/session',json=forged,headers=first)
    assert saved.status_code==201
    repeated=await client.post('/api/workout/session',json=forged,headers=first)
    assert repeated.json()['id']==saved.json()['id']
    history=await client.get('/api/workouts/history',headers=first)
    assert history.json()['total']==1
    assert history.json()['items'][0]['totalReps']==2
    assert history.json()['items'][0]['avgFormScore']==100
    log=await client.get(f"/api/workouts/history/{saved.json()['id']}/telemetry",headers=first)
    assert log.json()['analysis']['modelVersion']=='pose-rules-1.0'
    assert 'streams' not in log.json()['analysis']
    assert all('landmarks' not in view for view in log.json()['analysis']['views'])


async def test_unscored_report_cannot_be_saved(auth_client):
    p=payload(streams=[squat_stream(view='frontal')],persist=True)
    result=await auth_client.post('/api/analysis/evaluate',json=p.model_dump())
    saved=await auth_client.post('/api/workout/session',json={**SAMPLE_PAYLOAD,'analysisId':result.json()['analysisId']})
    assert saved.status_code==422
