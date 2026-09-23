"""Synthetic geometry/contract regression tests, NOT real-world accuracy validation."""
from copy import deepcopy
from math import cos, sin, pi
import pytest
from pydantic import ValidationError
from app.analysis.engine import analyze, angle, classify, evaluate_rep, learn_from, segments
from app.analysis.library import LIBRARY, FAMILIES
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
    assert [c['name'] for c in result['reps'][0]['checks']]==['Squat depth','Stand-up lockout','Torso angle at the bottom','Tempo']
    assert all('°' in c['cue'] or 's' in c['cue'] for c in result['reps'][0]['checks'])
    assert result['headline'].startswith('Squat: 2 reps at 100/100')
    assert all(f['passed'] for f in result['focus'])
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
    assert any('looks more like squat' in w for w in r['warnings'])


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
    assert len(r['reps'][0]['checks'])==5
    assert r['reps'][0]['checks'][-1]['cameraId']=='front'
    # A second side view does not duplicate either reps or checks.
    r=analyze(payload(streams=[side,squat_stream('side2')],synchronized=True))
    assert r['repCount']==2 and len(r['reps'][0]['checks'])==4


def test_offsets_align_same_events_and_nonoverlap_rejected():
    front=squat_stream('front','frontal',offset=-3000)
    for f in front['frames']: f['timestampMs']+=3000
    r=analyze(payload(streams=[squat_stream(),front],synchronized=True))
    assert len(r['reps'][0]['checks'])==5
    front['offsetMs']=100000
    with pytest.raises(ValueError,match='overlap'):
        analyze(payload(streams=[squat_stream(),front],synchronized=True))


def test_occluded_frontal_view_does_not_add_a_passing_check():
    front=squat_stream('front','frontal')
    for f in front['frames']:
        for i in (25,26,27,28): f['landmarks'][i]['visibility']=.1
    r=analyze(payload(streams=[squat_stream(),front],synchronized=True))
    assert all(len(rep['checks'])==4 for rep in r['reps'])


def test_frontal_knee_deviation_reduces_visible_check_score():
    front=squat_stream('front','frontal')
    for f in front['frames']:
        f['landmarks'][25]['x']=.48;f['landmarks'][26]['x']=.52
    r=analyze(payload(streams=[squat_stream(),front],synchronized=True))
    assert 60 <= r['score'] < 100
    assert 'knees drifted' in ' '.join(r['reps'][0]['feedback']).lower()
    assert r['focus'][0]['name']=='Frontal knee tracking' and r['focus'][0]['failedReps']==2
    assert 'knee tracking' in r['headline'].lower()


def test_gap_breaks_rep_continuity():
    rows=[{'t':i*200,'knee':v} for i,v in enumerate([170,170,150,110,90,90,100,160,170,170])]
    assert len(segments(rows,'knee'))==1
    # A one-frame visibility flicker (constant on live cameras) must not lose the rep...
    rows[5]['knee']=None
    assert len(segments(rows,'knee'))==1
    # ...but the joint hidden for longer than MAX_GAP_MS does.
    for r in rows[2:9]: r['knee']=None
    assert segments(rows,'knee')==[]
    for r,v in zip(rows[2:9],[150,110,90,90,100,160,170]): r['knee']=v
    for r in rows[5:]:r['t']+=2000
    assert segments(rows,'knee')==[]


def test_single_landmark_outlier_cannot_manufacture_range():
    rows = [{'t': i * 200, 'knee': 130, 'otherKnee': 130, 'alignment': None, 'stance': .3} for i in range(11)]
    rows[5]['knee'] = 20
    report = evaluate_rep(LIBRARY['squat'], 0, 2000, [{'id': 'side', 'view': 'side', 'rows': rows}])
    assert report['checks'][0]['name'] == 'Squat depth'
    assert report['checks'][0]['value'] == 130
    assert not report['checks'][0]['passed']
    assert '130' in report['checks'][0]['cue'] and '30' in report['checks'][0]['cue']
    assert report['checks'][0]['score'] == 0


def test_multi_view_analysis_uses_only_shared_timeline():
    frontal = squat_stream('front', 'frontal')
    frontal['frames'] = frontal['frames'][40:]
    result = analyze(payload(streams=[squat_stream(), frontal], synchronized=True))
    assert result['repCount'] == 1
    assert result['durationSeconds'] == 8
    assert all(check['cameraId'] == 'front' for check in result['reps'][0]['checks'] if check['view'] == 'frontal')


def synthetic_rows(exercise, frames=40, period_ms=200):
    """Feature rows shaped like each movement family; geometry only, no landmarks."""
    rows=[]
    for i in range(frames):
        d=(1-cos(i/(frames-1)*2*pi))/2
        base={'t':i*period_ms,'knee':175,'otherKnee':175,'hip':175,'elbow':175,'shoulder':12,'ankle':95,'trunk':8,'kneeAsym':0,
              'hipAnkle':2.0,'wristY':-.95,'wristHip':-.3,'kneeHip':-1.6,'reach':.1,'shoulderDrift':.05,'overhead':False,'footSplit':.2,'hipAsym':0}
        if exercise=='squat': base.update(knee=175-90*d,otherKnee=175-90*d,hip=175-70*d,trunk=8+25*d,hipAnkle=2-.8*d)
        elif exercise=='lunge': base.update(knee=175-90*d,otherKnee=175-80*d,kneeAsym=10*d,hip=175-80*d,hipAsym=70*d,footSplit=1.8,hipAnkle=2-.6*d)
        elif exercise=='deadlift': base.update(hip=175-70*d,knee=175-40*d,trunk=8+60*d,wristHip=-.3-.6*d,hipAnkle=2-.3*d)
        elif exercise=='romanian_deadlift': base.update(hip=175-70*d,knee=170-8*d,trunk=8+65*d,wristHip=-.3-.8*d,hipAnkle=2-.2*d)
        elif exercise=='curl': base.update(elbow=175-110*d,wristY=-.95+.9*d,shoulder=12+15*d)
        elif exercise=='ohp': base.update(elbow=175-90*d,wristY=1.3-1.1*d,shoulder=170-100*d,overhead=d<.5)
        elif exercise=='bench': base.update(elbow=175-90*d,trunk=88,hipAnkle=.1,wristY=1.1-.6*d,knee=100,shoulder=90-50*d)
        elif exercise=='pushup': base.update(elbow=175-90*d,trunk=85,hipAnkle=.2,wristY=-1.1+.3*d,hip=172,knee=176)
        elif exercise=='pullup': base.update(elbow=175-100*d,wristY=1.4,shoulder=170-40*d,hipAnkle=1.9,trunk=5)
        elif exercise=='lateral_raise': base.update(shoulder=12+75*d,wristY=-.95+.9*d)
        elif exercise=='leg_extension': base.update(knee=95+75*d,hipAnkle=.9,hip=95,trunk=15)
        elif exercise=='seated_leg_curl': base.update(knee=170-75*d,hipAnkle=.9,hip=95,trunk=15)
        elif exercise=='situp': base.update(trunk=88-55*d,hip=130-60*d,knee=100,hipAnkle=.1)
        elif exercise=='calf_raise': base.update(ankle=95+35*d)
        rows.append(base)
    return rows


FAMILY_SAMPLES=['squat','lunge','deadlift','romanian_deadlift','curl','ohp','bench','pushup','pullup','lateral_raise','leg_extension','seated_leg_curl','situp','calf_raise']


@pytest.mark.parametrize('exercise',FAMILY_SAMPLES)
def test_library_signatures_detect_each_movement(exercise):
    view='frontal' if exercise=='lateral_raise' else 'side'
    detection=classify([{'id':'c','view':view,'rows':synthetic_rows(exercise)}])
    assert detection['exercise']==exercise, detection['candidates'][:3]
    assert detection['confidence']>=.68


def test_detection_is_fast_partial_rep_is_enough():
    rows=synthetic_rows('squat')[:11]   # ~2 s, only the descent of the first rep
    detection=classify([{'id':'c','view':'side','rows':rows}])
    assert detection['exercise']=='squat' and detection['confidence']>=.68
    assert classify([{'id':'c','view':'side','rows':rows[:4]}])['exercise'] is None


def test_variants_are_offered_as_alternatives_not_guessed():
    detection=classify([{'id':'c','view':'side','rows':synthetic_rows('bench')}])
    ids={a['id'] for a in detection['alternatives']}
    assert {'bench','dumbbell_bench_press','floor_press'}<=ids
    assert all(LIBRARY[i]['family']==LIBRARY['bench']['family'] for i in ids)


def test_library_is_large_and_well_formed():
    assert len(LIBRARY)>=70
    for spec in LIBRARY.values():
        assert spec['family'] in FAMILIES and spec['cycle'] in ('flex','extend')
        assert (spec['rest']>spec['work'])==(spec['cycle']=='flex')
        assert spec['checks'] and all({'name','key','stat','target','tolerance','direction','units','ok','fix','view'}<=set(c) for c in spec['checks'])
        if spec['variantOf']: assert spec['signature']==LIBRARY[spec['variantOf']]['signature']


def test_extend_cycle_segments_count_low_high_low_reps():
    rows=[{'t':i*200,'knee':v} for i,v in enumerate([95,95,110,150,170,170,150,110,95,95,120,160,170,150,100,95])]
    assert len(segments(rows,'knee',110,140,'extend',.6))==2
    assert len(segments(rows,'knee',150,125,'flex',.6))==1   # the middle high→low→high swing


def test_teach_new_exercise_from_own_reps_then_detect_and_score_it():
    stream=squat_stream()
    request=payload(streams=[stream])
    spec=learn_from(request,'Sissy squat',['quads','calves'])
    assert spec['custom'] and spec['primary']=='knee' and spec['cycle']=='flex'
    assert spec['learned']['reps']==2 and spec['muscles']=={'quads':90,'calves':90}
    assert [c['name'] for c in spec['checks']]==['Range of motion','Return to start','Torso control','Tempo']
    library={**LIBRARY,spec['id']:spec}
    result=analyze(payload(streams=[stream],confirmedExercise=spec['id']),library)
    assert result['exercise']==spec['id'] and result['repCount']==2 and result['score']==100
    assert result['muscleDemand']=={'quads':90,'calves':90}
    assert any('Taught exercises' in n for n in result['notAssessed'])
    with pytest.raises(ValueError,match='Unknown exercise'):
        analyze(payload(streams=[stream],confirmedExercise='nope'))
    static=squat_stream();static['frames']=[{**f,'landmarks':deepcopy(static['frames'][0]['landmarks'])} for f in static['frames']]
    with pytest.raises(ValueError,match='Not enough visible joint movement'):
        learn_from(payload(streams=[static]),'Nothing',[])


def uncertain_library():
    """A library whose squat signature can't match, so the rules stay below threshold and the LLM is consulted."""
    from copy import deepcopy
    lib = deepcopy(LIBRARY)
    for spec in lib.values():
        if spec['family'] == 'squat':
            spec['signature'] = [['hipAnkle', 'median', -.8, .2]]   # demands "lying" — a standing squat now looks foreign
    return lib


def test_llm_second_opinion_picks_a_library_exercise_when_rules_are_unsure():
    lib = uncertain_library()
    calls = []

    def detector(cameras, detection, library, segments_fn, session_key):
        from app.analysis.llm_detect import describe
        summary = describe(cameras, detection, segments_fn)
        calls.append((session_key, summary))
        assert 'knee' in summary and 'standing' in summary and 'cycles seen' in summary
        return {'exerciseId': 'squat', 'newExercise': None, 'confidence': .82, 'reason': 'knee 80–170°, standing, hands at hips'}

    baseline = analyze(payload(), lib)
    assert baseline['exercise'] != 'squat'
    result = analyze(payload(sessionKey='set-1'), lib, detector)
    assert result['exercise'] == 'squat' and result['selectionSource'] == 'llm' and result['confidence'] == .82
    assert result['repCount'] == 2 and result['detectionNote'].startswith('knee')
    assert result['candidates'][0]['id'] == 'squat' and result['proposal'] is None
    assert calls[0][0] == 'set-1'
    # Rules already confident → the model is never asked.
    analyze(payload(), LIBRARY, lambda *a: pytest.fail('detector must not be consulted'))


def test_llm_second_opinion_proposes_a_new_exercise_and_counts_reps_provisionally():
    def detector(cameras, detection, library, segments_fn, session_key):
        return {'exerciseId': None, 'newExercise': {'name': 'Sissy squat', 'family': 'squat', 'muscles': ['quads']}, 'confidence': .7, 'reason': 'knee travel with an upright torso'}
    result = analyze(payload(), uncertain_library(), detector)
    assert result['exercise'] == 'proposed' and result['exerciseName'] == 'Sissy squat' and result['family'] == 'squat'
    assert result['proposal'] == {'name': 'Sissy squat', 'family': 'squat', 'muscles': ['quads'], 'confidence': .7, 'reason': 'knee travel with an upright torso'}
    assert result['repCount'] == 2 and result['alternatives'] == [] and result['muscleDemand'] == {'quads': 90}
    assert any('New exercise recognised' in w for w in result['warnings'])
    # An unsure or unavailable model leaves the rule verdict untouched.
    unsure = analyze(payload(), uncertain_library(), lambda *a: {'exerciseId': None, 'newExercise': None, 'confidence': .2, 'reason': ''})
    assert unsure['exercise'] is None and unsure['selectionSource'] == 'detected' and unsure['proposal'] is None
    assert analyze(payload(), uncertain_library(), lambda *a: None)['exercise'] is None


def test_llm_detector_parses_and_caches_per_session(monkeypatch):
    from app.analysis import llm_detect
    from app.analysis.llm_detect import LlmDetector, parse
    assert parse('```json\n{"exerciseId":"squat","confidence":1.4,"newExercise":{"name":"x"}}\n```') == {'exerciseId': 'squat', 'newExercise': None, 'confidence': 1.0, 'reason': ''}
    assert parse('{"exerciseId":null,"newExercise":{"name":"Sissy squat","family":"nope","muscles":["quads","bogus"]},"confidence":"0.66"}')['newExercise'] == {'name': 'Sissy squat', 'family': 'custom', 'muscles': ['quads']}
    assert LlmDetector(None, 'u', 'm')([], {}, LIBRARY, segments, 'k') is None
    detector = LlmDetector('key', 'u', 'm')
    answers = iter([{'exerciseId': 'nope', 'newExercise': None, 'confidence': .9, 'reason': 'a'}, {'exerciseId': 'squat', 'newExercise': None, 'confidence': .9, 'reason': 'b'}])
    monkeypatch.setattr(detector, 'complete', lambda summary, library: next(answers))
    cameras = [__import__('app.analysis.features', fromlist=['features']).features(payload().streams[0])]
    detection = {'exercise': None, 'confidence': 0, 'candidates': [], 'alternatives': []}
    first = detector(cameras, detection, LIBRARY, segments, 'set-9')
    assert first['exerciseId'] is None and first['confidence'] == .9          # unknown id is dropped, not trusted
    assert detector(cameras, detection, LIBRARY, segments, 'set-9') is first   # confident answers are cached per set
    monkeypatch.setattr(detector, 'complete', lambda summary, library: (_ for _ in ()).throw(RuntimeError('boom')))
    assert detector(cameras, detection, LIBRARY, segments, 'other')['reason'].startswith('unavailable')


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
    assert log.json()['analysis']['modelVersion']=='pose-rules-2.0'
    assert 'streams' not in log.json()['analysis']
    assert all('landmarks' not in view for view in log.json()['analysis']['views'])


async def test_unscored_report_cannot_be_saved(auth_client):
    p=payload(streams=[squat_stream(view='frontal')],persist=True)
    result=await auth_client.post('/api/analysis/evaluate',json=p.model_dump())
    saved=await auth_client.post('/api/workout/session',json={**SAMPLE_PAYLOAD,'analysisId':result.json()['analysisId']})
    assert saved.status_code==422


async def test_custom_exercise_routes_are_owned_and_usable(app_and_client):
    _,client=app_and_client
    signup=await client.post('/api/auth/signup',json={'displayName':'Teacher','email':'teacher@example.com','password':'analysis-test-password'})
    auth={'Authorization':f"Bearer {signup.json()['accessToken']}"}
    before=(await client.get('/api/analysis/exercises',headers=auth)).json()
    assert len(before['exercises'])>=70 and before['muscles']
    body={'name':'Sissy squat','muscles':['quads'],'streams':[squat_stream()]}
    assert (await client.post('/api/analysis/exercises',json=body)).status_code==401
    taught=await client.post('/api/analysis/exercises',json=body,headers=auth)
    assert taught.status_code==201, taught.text
    new_id=taught.json()['exercise']['id']
    assert (await client.post('/api/analysis/exercises',json=body,headers=auth)).status_code==409
    listed=(await client.get('/api/analysis/exercises',headers=auth)).json()['exercises']
    assert any(e['id']==new_id and e['custom'] for e in listed)
    scored=await client.post('/api/analysis/evaluate',json={'streams':[squat_stream()],'confirmedExercise':new_id},headers=auth)
    assert scored.status_code==200 and scored.json()['repCount']==2 and scored.json()['exerciseName']=='Sissy squat'
    other=await client.post('/api/auth/signup',json={'displayName':'Other','email':'other-teacher@example.com','password':'analysis-test-password'})
    other={'Authorization':f"Bearer {other.json()['accessToken']}"}
    assert (await client.post('/api/analysis/evaluate',json={'streams':[squat_stream()],'confirmedExercise':new_id},headers=other)).status_code==422
    assert (await client.delete(f'/api/analysis/exercises/{new_id}',headers=other)).status_code==404
    assert (await client.delete(f'/api/analysis/exercises/{new_id}',headers=auth)).status_code==204


def _rep_rows(frames, reps, **signals):
    """Feature rows for ``reps`` cycles; each signal is (rest_value, work_value) or a constant."""
    rows=[]
    for i in range(frames):
        d=(1-cos(i/(frames-1)*2*pi*reps))/2
        row={'t':i*200,'otherKnee':None,'kneeAsym':None,'hipAsym':None,'overhead':None}
        for k,v in signals.items(): row[k]=v[0]+(v[1]-v[0])*d if isinstance(v,tuple) else v
        rows.append(row)
    return rows


def test_confirmed_pushup_counts_foreshortened_reps_and_reports_shallow_depth():
    from app.analysis.engine import count_reps
    # Laptop webcam at floor level: the elbow reads 100–140° instead of 90–170°. The old fixed 150° gate never opened.
    rows=_rep_rows(60,3,elbow=(140,100),trunk=80,hip=170,knee=175,wristY=(-1,-.4),hipAnkle=.2)
    found,signal=count_reps(LIBRARY['pushup'],{'id':'c','view':'side','rows':rows})
    assert len(found)==3 and signal=='elbow'
    # Depth is still judged against the coaching standard, so the athlete hears that 100° is short of 95°.
    rep=evaluate_rep(LIBRARY['pushup'],*found[0],[{'id':'c','view':'side','rows':rows}])
    depth=next(c for c in rep['checks'] if c['name']=='Push-up depth')
    assert not depth['passed'] and '100' in depth['cue']


def test_confirmed_pushup_counts_from_shoulder_height_when_elbow_hidden():
    from app.analysis.engine import count_reps
    rows=_rep_rows(60,3,elbow=None,trunk=80,hip=170,knee=175,wristY=(-1,-.35),hipAnkle=.2)
    found,signal=count_reps(LIBRARY['pushup'],{'id':'c','view':'side','rows':rows})
    assert len(found)==3 and signal=='wristY'


def test_static_hold_still_counts_nothing_with_adaptive_gates():
    from app.analysis.engine import count_reps
    rows=_rep_rows(60,3,elbow=(170,162),trunk=80,hip=170,knee=175,wristY=(-1,-.95),hipAnkle=.2)
    assert count_reps(LIBRARY['pushup'],{'id':'c','view':'side','rows':rows})[0]==[]


def test_coach_notes_are_attached_and_optional():
    calls=[]
    def coach(name,summary,reps,session_key=None,seconds=0):
        calls.append(name); return {'cues':['Lower until the elbows reach 90°.'],'camera':''}
    result=analyze(payload(confirmedExercise='squat'),coach=coach)
    assert result['coach']['cues'] and calls==['Squat']
    assert 'coverage' in result['views'][0] and analyze(payload(confirmedExercise='squat'))['coach'] is None


# ─── Opposite-side failover ──────────────────────────────────────────────────────────────────
def test_count_reps_fails_over_to_the_opposite_side_joint():
    from app.analysis.engine import count_reps
    # The camera-side knee never reads, but the other knee swings through three full squats.
    rows=_rep_rows(60,3,knee=None,otherKnee=(170,90),hip=170,trunk=10,hipAnkle=2.0,wristY=-.95)
    found,signal=count_reps(LIBRARY['squat'],{'id':'c','view':'side','rows':rows})
    assert len(found)==3 and signal=='otherKnee'


def test_confirmed_squat_is_graded_from_the_opposite_side_when_dominant_side_occluded():
    s=squat_stream()
    for f in s['frames']:
        for i in (23,25,27): f['landmarks'][i]['visibility']=.1    # camera-side hip/knee/ankle lost
        for i in (12,14,16): f['landmarks'][i]['visibility']=.1    # far-side arm lost (keeps side 0 dominant)
    result=analyze(payload(streams=[s],confirmedExercise='squat'))
    assert result['repCount']==2 and result['score']==100
    assert [c['name'] for c in result['reps'][0]['checks']]==['Squat depth','Stand-up lockout','Tempo']
    assert any('opposite-side knee' in w for w in result['warnings'])
    assert any('visible in only 0%' in w for w in result['warnings'])
    assert not any('form checks need' in w for w in result['warnings'])
    # Reported visibility still describes what the camera actually saw, not the swapped copy.
    assert result['views'][0]['coverage']['knee']==0


def test_proxy_is_only_used_when_both_sides_are_hidden():
    from app.analysis.engine import count_reps
    rows=_rep_rows(60,3,elbow=None,otherElbow=None,trunk=80,hip=170,knee=175,wristY=(-1,-.35),hipAnkle=.2)
    found,signal=count_reps(LIBRARY['pushup'],{'id':'c','view':'side','rows':rows})
    assert len(found)==3 and signal=='wristY'


# ─── response_format fallback ────────────────────────────────────────────────────────────────
def _fake_openai(monkeypatch, reply):
    """openai.OpenAI whose first create() rejects response_format with a 400, then succeeds."""
    import httpx
    import openai
    from types import SimpleNamespace
    calls=[]
    class Completions:
        def create(self,**kwargs):
            calls.append('response_format' in kwargs)
            if 'response_format' in kwargs:
                raise openai.APIStatusError('response_format unsupported',
                                            response=httpx.Response(400,request=httpx.Request('POST','http://test')),body=None)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=reply))])
    class Client:
        def __init__(self,**kwargs): self.chat=SimpleNamespace(completions=Completions())
        def close(self): pass
    monkeypatch.setattr(openai,'OpenAI',Client)
    return calls


def test_llm_detector_retries_without_response_format_on_400(monkeypatch):
    from app.analysis.llm_detect import LlmDetector
    calls=_fake_openai(monkeypatch,'{"exerciseId":"squat","confidence":0.9,"reason":"knee travel"}')
    result=LlmDetector('key','http://x','m').complete('summary',LIBRARY)
    assert result['exerciseId']=='squat' and result['confidence']==.9
    assert calls==[True,False]


def test_llm_coach_retries_without_response_format_on_400(monkeypatch):
    from app.analysis.llm_coach import LlmCoach
    calls=_fake_openai(monkeypatch,'{"cues":["Sit deeper — the knee stayed above 100°."],"camera":""}')
    result=LlmCoach('key','http://x','m').complete('Squat','summary',[])
    assert result['cues']==['Sit deeper — the knee stayed above 100°.']
    assert calls==[True,False]


# ─── Detection accuracy: extrema-derived gates and evidence-aware classification ─────────────
def _rest_heavy_rows(reps=3, rep_frames=20, rest_frames=30):
    """Squat-like knee/hip signals with long standing plateaus between reps."""
    rows=[]; t=0
    for _ in range(reps):
        for i in range(rep_frames):
            d=(1-cos(i/(rep_frames-1)*2*pi))/2
            rows.append({'t':t,'knee':175-90*d,'otherKnee':175-90*d,'hip':175-70*d,'trunk':8+25*d,'hipAnkle':2-.8*d}); t+=200
        for _ in range(rest_frames):
            rows.append({'t':t,'knee':175,'otherKnee':175,'hip':175,'trunk':8,'hipAnkle':2.0}); t+=200
    return rows


def test_extrema_envelope_ignores_rest_plateaus_and_reads_partial_reps():
    from app.analysis.features import extrema_envelope
    assert extrema_envelope([{'t':i*200,'knee':170} for i in range(40)],'knee',20) is None
    lo,hi=extrema_envelope(_rest_heavy_rows(),'knee',20)
    assert lo<100 and hi>170
    # A single descent with no return still informs the envelope.
    rows=[{'t':i*200,'knee':v} for i,v in enumerate([175]*10+[175-9*j for j in range(10)])]
    lo,hi=extrema_envelope(rows,'knee',20)
    assert lo<120 and hi>170


def test_rest_heavy_set_still_counts_every_rep():
    from app.analysis.engine import count_reps
    # Whole-window p10/p90 of this signal both read ≈standing, so percentile gates never open.
    found,signal=count_reps(LIBRARY['squat'],{'id':'c','view':'side','rows':_rest_heavy_rows()})
    assert len(found)==3 and signal=='knee'


def test_classifier_uses_the_opposite_side_when_the_dominant_side_is_hidden():
    rows=[dict(r,knee=None) for r in synthetic_rows('squat')]
    detection=classify([{'id':'c','view':'side','rows':rows}])
    assert detection['exercise']=='squat' and detection['confidence']>=.68


def test_classifier_detects_from_partial_visibility_and_abstains_on_almost_none():
    # Only knee, hip and posture signals visible; every one fits the squat signature.
    keep={'t','knee','hip','trunk','hipAnkle'}
    rows=[{k:v for k,v in r.items() if k in keep} for r in synthetic_rows('squat')]
    detection=classify([{'id':'c','view':'side','rows':rows}])
    assert detection['exercise']=='squat' and detection['confidence']>=.68
    # Only two signals is a guess, not a detection.
    rows=[{k:v for k,v in r.items() if k in {'t','knee','hip'}} for r in synthetic_rows('squat')]
    assert classify([{'id':'c','view':'side','rows':rows}])['exercise'] is None


def test_rhythm_summary_counts_cycles_not_rest_frames():
    from app.analysis.llm_detect import _rhythm
    text=_rhythm(_rest_heavy_rows(),segments)
    assert 'about 3 complete cycles' in text


def test_learn_from_rest_heavy_set_derives_gates_that_still_count_reps():
    stream=squat_stream()
    standing=deepcopy(stream['frames'][0]['landmarks'])
    last=stream['frames'][-1]['timestampMs']
    for i in range(1,41):   # 8 s of standing still after the two reps
        stream['frames'].append({'timestampMs':last+i*200,'landmarks':standing})
    spec=learn_from(payload(streams=[stream]),'Sissy squat',['quads'])
    from app.analysis.engine import count_reps
    from app.analysis.features import features as featurize
    camera=featurize(payload(streams=[stream]).streams[0])
    found,signal=count_reps(spec,camera)
    assert len(found)==2 and signal=='knee'


def leg_press_stream(seconds=16):
    """Seated, reclined against a pad, hips pinned; feet on a sled at hip height push away and return."""
    from math import atan2, hypot as _h
    frames=[]; L=.25; hip=(.4,.6); shoulder=(.28,.4); nose=(.33,.3)
    for i in range(int(seconds*5)+1):
        d=(1-cos(i/40*2*pi))/2
        k=(170-85*d)*pi/180
        span=2*L*sin(k/2); phi=10*pi/180
        ankle=(hip[0]+span*cos(phi),hip[1]-span*sin(phi))
        mid=((hip[0]+ankle[0])/2,(hip[1]+ankle[1])/2)
        ux,uy=(ankle[0]-hip[0])/span,(ankle[1]-hip[1])/span
        up=L*cos(k/2)
        knee=(mid[0]+uy*up,mid[1]-ux*up)
        elbow=(.36,.5); wrist=(.42,.56); foot=(ankle[0]+.02,ankle[1]-.06)
        p=[{'x':.5,'y':.5,'visibility':.99} for _ in range(33)]
        p[0]={'x':nose[0],'y':nose[1],'visibility':.99}
        for side in (0,1):
            for index,xy in ((11,shoulder),(13,elbow),(15,wrist),(23,hip),(25,knee),(27,ankle),(31,foot)):
                p[index+side]={'x':xy[0]+side*.01,'y':xy[1],'visibility':.99}
        frames.append({'timestampMs':i*200,'landmarks':p})
    return {'cameraId':'side','view':'side','aspectRatio':1,'offsetMs':0,'frames':frames}


def test_machine_leg_press_is_recognised_and_described_as_pinned():
    from app.analysis.features import features as featurize
    from app.analysis.llm_detect import describe
    camera=featurize(AnalysisRequest.model_validate({'streams':[leg_press_stream()]}).streams[0])
    detection=classify([camera])
    assert detection['exercise']=='leg_press'
    text=describe([camera],detection,segments)
    # The cues a model needs to tell a machine from a free-weight movement.
    assert 'hips fixed in place' in text and 'feet travel' in text and 'reclined' in text
    assert 'Joint visibility: knee 100%' in text and 'At each end of the movement: bent knee' in text
    result=analyze(AnalysisRequest.model_validate({'streams':[leg_press_stream()]}))
    assert result['exercise']=='leg_press' and result['repCount']>=2


def test_occluded_joints_are_reported_to_the_model_not_dropped():
    from app.analysis.llm_detect import describe
    rows=[dict(r,knee=None,otherKnee=None) if i%3 else r for i,r in enumerate(synthetic_rows('squat'))]
    text=describe([{'id':'c','view':'side','rows':rows}],{'candidates':[]},segments)
    assert 'knee 35%' in text and 'often hidden' in text
    assert 'knee ' in text.split('Angles: ')[1].split('\n')[0]   # partial knee still reported as a band


def test_llm_catalog_describes_what_each_entry_looks_like():
    from app.analysis.llm_detect import catalog
    text=catalog(LIBRARY)
    assert 'leg_press: Leg press — knee bends then straightens, feet raised/reclined' in text
    assert 'lat_pulldown: Lat pulldown — elbow bends then straightens, seated' in text
    assert 'machine_row: Machine row (variant of seated_row)' in text


def test_llm_rechecks_an_early_answer_as_the_set_grows_then_settles():
    from app.analysis.features import features as featurize
    from app.analysis.llm_detect import LlmDetector
    detector=LlmDetector('key','u','m')
    answers=iter(['squat','leg_press','leg_press'])
    calls=[]
    def complete(summary,library):
        calls.append(summary)
        return {'exerciseId':next(answers),'newExercise':None,'confidence':.8,'reason':''}
    detector.complete=complete
    full=featurize(AnalysisRequest.model_validate({'streams':[leg_press_stream(40)]}).streams[0])
    window=lambda s:[{**full,'rows':[r for r in full['rows'] if r['t']<=s*1000]}]
    det={'exercise':None,'confidence':0,'candidates':[],'alternatives':[]}
    assert detector(window(3),det,LIBRARY,segments,'s')['exerciseId']=='squat'
    assert detector(window(5),det,LIBRARY,segments,'s')['exerciseId']=='squat'      # not enough new evidence yet
    assert detector(window(10),det,LIBRARY,segments,'s')['exerciseId']=='leg_press' # grown → asked again, corrected
    assert detector(window(17),det,LIBRARY,segments,'s')['exerciseId']=='leg_press' # grown again → confirmed
    assert detector(window(40),det,LIBRARY,segments,'s')['exerciseId']=='leg_press' and len(calls)==3  # settled


# ─── Live stability: flicker-tolerant reps, mover gate, full-cycle wait, session lock ────────
def test_reps_survive_frequent_visibility_flicker():
    from app.analysis.engine import count_reps
    rows=_rep_rows(60,3,elbow=(170,85),trunk=80,hip=170,knee=175,wristY=(-1,-.4),hipAnkle=.2)
    for i,r in enumerate(rows):
        if i%4==1: r['elbow']=None       # a quarter of frames drop below the visibility threshold
    found,signal=count_reps(LIBRARY['pushup'],{'id':'c','view':'side','rows':rows})
    assert len(found)==3 and signal=='elbow'


def test_spec_whose_primary_joint_is_still_is_not_a_candidate():
    detection=classify([{'id':'c','view':'side','rows':synthetic_rows('curl')}])
    ids={c['id'] for c in detection['candidates']}
    # A curl moves the elbow; hip- and knee-driven specs must not be ranked at all.
    assert all(LIBRARY[i]['primary'] not in ('hip','knee') for i in ids), ids


def test_auto_detection_waits_for_one_complete_rep():
    s=squat_stream(); s['frames']=s['frames'][:18]      # the descent and part of the ascent only
    result=analyze(payload(streams=[s]))
    assert result['exercise'] is None and result['candidates'] and result['candidates'][0]['id']=='squat'
    assert analyze(payload())['exercise']=='squat'


def test_detected_exercise_is_held_for_the_session():
    from app.analysis.engine import hold
    key='hold-test'
    assert hold(key,'squat',.8,'detected',None)[0]=='squat'
    assert hold(key,None,0,'detected',None)[0]=='squat'           # an ambiguous window never erases it
    assert hold(key,'lunge',.7,'detected',None)[0]=='squat'
    assert hold(key,'lunge',.7,'detected',None)[0]=='squat'
    assert hold(key,'lunge',.7,'detected',None)[0]=='lunge'        # three in a row switches
    assert hold(key,'squat',.8,'detected',None)[0]=='lunge'
    assert hold(None,'curl',.8,'detected',None)[0]=='curl'


async def test_calibration_recording_needs_consent_and_declining_erases(auth_client):
    body=payload(streams=[squat_stream()],persist=True,sessionKey='set-1').model_dump()
    assert (await auth_client.get('/api/analysis/calibration/consent')).json()['decided'] is False
    assert (await auth_client.post('/api/analysis/evaluate',json=body)).json()['recordedForCalibration'] is False
    agreed=await auth_client.put('/api/analysis/calibration/consent',json={'accepted':True})
    assert agreed.json()['accepted'] is True
    assert (await auth_client.post('/api/analysis/evaluate',json=body)).json()['recordedForCalibration'] is True
    # Re-scoring the same set as a confirmed exercise updates the one row instead of adding another.
    await auth_client.post('/api/analysis/evaluate',json={**body,'confirmedExercise':'squat'})
    live=await auth_client.post('/api/analysis/evaluate',json={**body,'persist':False})
    assert 'recordedForCalibration' not in live.json()
    assert (await auth_client.get('/api/analysis/calibration/consent')).json()['recordings']==1
    declined=await auth_client.put('/api/analysis/calibration/consent',json={'accepted':False})
    assert declined.json()=={'termsVersion':declined.json()['termsVersion'],'decided':True,'accepted':False,'recordings':0}
