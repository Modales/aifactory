"""Legacy workout adapter. Evidence reports remain the authoritative analysis.

The old RepData contract requires numeric velocity, phase timing and effort.
Zero is a compatibility sentinel, not a measurement; new UI renders the report
instead of these legacy fields. Historical/demo records remain unchanged.
"""
from ..schemas import EndSessionPayload, RepData
from ..muscle_load import estimate_muscle_load


def apply_report(payload: EndSessionPayload, result: dict) -> None:
    payload.exerciseId = result['exercise']
    payload.exerciseName = result['exerciseName']
    payload.cameraAngle = ', '.join(v['view'] for v in result['views'])
    payload.totalReps = result['repCount']
    payload.durationSeconds = result['durationSeconds']
    payload.avgFormScore = result['score']
    payload.peakEffort = 0
    payload.muscleLoad = type(payload.muscleLoad)(**estimate_muscle_load(result['exercise'], result['reps']))
    payload.reps = [RepData(
        rep=r['index'], tempo=r['durationSeconds'], concentricTime=0,
        eccentricTime=0, velocity=0, effort=0,
        peakAngle=r['checks'][0]['value'] if r['checks'] else 0,
        formScore=r['score'], cue=' '.join(r['feedback']) or 'Visible checks passed; unobserved technique is not assessed.',
        severity='good' if r['score'] >= 80 else 'warn' if r['score'] >= 50 else 'crit', flaws=[c['name'] for c in r['checks'] if not c['passed']],
    ) for r in result['reps'] if r['score'] is not None]
