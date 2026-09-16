"""Deterministic 2D movement analysis, v1. Not a clinically validated form model.

No LLM decides scores. Missing landmarks, ambiguous views and incomplete reps
abstain. Multiple views contribute independent checks on an aligned timeline;
this is NOT uncalibrated 3D triangulation. Thresholds are transparent heuristics.
"""
from math import acos, degrees, hypot
from statistics import median
from .schemas import AnalysisRequest, CameraStream

VERSION = 'pose-rules-1.0'
NAMES = {'squat': 'Squat', 'deadlift': 'Deadlift / hip hinge', 'bench': 'Bench press', 'ohp': 'Overhead press', 'curl': 'Biceps curl', 'lunge': 'Lunge'}
DISCLAIMER = 'Experimental 2D movement estimates, not medical advice or a safety verdict. Scores cover only visible checks, not overall technique. Equipment, load, pain and spinal curvature cannot be determined from landmarks.'


def angle(a, b, c):
    u, v = (a[0]-b[0], a[1]-b[1]), (c[0]-b[0], c[1]-b[1])
    length = hypot(*u) * hypot(*v)
    if length < 1e-6:
        return None
    return degrees(acos(max(-1, min(1, (u[0]*v[0]+u[1]*v[1])/length))))


def features(stream: CameraStream):
    rows = []
    stream_side = max((0, 1), key=lambda side: sum(
        frame.landmarks[i+side].visibility for frame in stream.frames for i in (11, 13, 15, 23, 25, 27)
    ))
    for frame in stream.frames:
        p = frame.landmarks
        def point(i):
            return (p[i].x * stream.aspectRatio, p[i].y)
        def joint(indices):
            if min(p[i].visibility for i in indices) < .65 or any(not (0 <= p[i].x <= 1 and 0 <= p[i].y <= 1) for i in indices):
                return None
            return angle(*(point(i) for i in indices))
        # Use a stable anatomical side across the whole stream; switching knees mid-rep
        # can manufacture a range of motion when one side is briefly occluded.
        side = stream_side
        shoulder, hip = point(11+side), point(23+side)
        torso = hypot(shoulder[0]-hip[0], shoulder[1]-hip[1])
        visible_torso = min(p[i].visibility for i in (11, 12, 23, 24)) >= .65
        width = abs(point(11)[0]-point(12)[0]) / max(torso, .01) if visible_torso else None
        trunk = degrees(acos(min(1, abs(shoulder[1]-hip[1])/max(torso, .01)))) if min(p[11+side].visibility, p[23+side].visibility) >= .65 else None
        elbow = joint((11+side, 13+side, 15+side))
        rows.append({'t': frame.timestampMs + stream.offsetMs,
                     'knee': joint((23+side, 25+side, 27+side)),
                     'hip': joint((11+side, 23+side, 25+side)), 'elbow': elbow,
                     'otherKnee': joint((24-side, 26-side, 28-side)),
                     'trunk': trunk, 'width': width,
                     'overhead': point(15+side)[1] < shoulder[1] - torso*.2 if elbow is not None else None,
                     'shoulderDrift': abs(point(13+side)[0]-shoulder[0])/max(torso, .01) if elbow is not None else None,
                     'alignment': abs(point(25)[0]-point(27)[0])+abs(point(26)[0]-point(28)[0]) if min(p[i].visibility for i in (25,26,27,28)) >= .65 else None,
                     'stance': abs(point(27)[0]-point(28)[0])})
    widths = [r['width'] for r in rows if r['width'] is not None]
    inferred = 'unknown' if not widths else 'side' if median(widths) < .38 else 'frontal' if median(widths) > .72 else 'oblique'
    view = stream.view if stream.view != 'auto' else inferred
    return {'id': stream.cameraId, 'view': view, 'viewSource': 'estimated' if stream.view == 'auto' else 'user-confirmed', 'rows': rows}


def extent(rows, key):
    values = [r[key] for r in rows if r[key] is not None]
    if len(values) < 8:
        return 0
    values.sort()
    return values[int((len(values)-1)*.9)] - values[int((len(values)-1)*.1)]


def classify(cameras):
    candidates = []
    for camera in cameras:
        if camera['view'] != 'side':
            continue
        rows = camera['rows']
        if len(rows) < 12 or rows[-1]['t']-rows[0]['t'] < 2000:
            continue
        knee, hip, elbow = (extent(rows, k) for k in ('knee', 'hip', 'elbow'))
        trunks = [r['trunk'] for r in rows if r['trunk'] is not None]
        if not trunks:
            continue
        if knee > 35 and hip > 20 and median(trunks) < 65:
            asymmetry = [abs(r['knee']-r['otherKnee']) for r in rows if r['knee'] is not None and r['otherKnee'] is not None]
            candidates.append(('lunge' if asymmetry and median(asymmetry) > 25 else 'squat', .76))
        elif hip > 35 and knee < 32 and extent(rows, 'trunk') > 25:
            candidates.append(('deadlift', .72))
        elif elbow > 40 and knee < 25:
            overhead = [r['overhead'] for r in rows if r['overhead'] is not None]
            if median(trunks) > 60:
                # Pose alone cannot distinguish bench press from other horizontal presses.
                candidates.append(('bench', .5))
            elif overhead and sum(overhead)/len(overhead) > .4:
                candidates.append(('ohp', .74))
            else:
                candidates.append(('curl', .7))
    if not candidates:
        return None, 0
    if len({c[0] for c in candidates}) > 1:
        return None, 0
    return max(candidates, key=lambda c: c[1])


def segments(rows, key):
    """Absolute hysteresis gates; only extended -> flexed -> extended cycles count."""
    start = None
    low = False
    last_t = None
    window = []
    result = []
    for row in rows:
        value = row[key]
        if value is None or (last_t is not None and row['t']-last_t > 800):
            start, low, window = None, False, []
        last_t = row['t']
        if value is None:
            continue
        window = (window + [value])[-3:]
        value = median(window)
        extended = 150 if key != 'hip' else 155
        flexed = 125 if key == 'knee' else 120
        if start is None:
            if value >= extended:
                start = row['t']
        elif row['t']-start > 15_000:
            start, low = None, False
        elif value < flexed:
            low = True
        elif value >= extended:
            if low and row['t']-start >= 700:
                result.append((start, row['t']))
            start, low = row['t'], False
    return result


def evaluate_rep(exercise, start, end, cameras):
    checks = []
    def add(name, camera, values, target, cue, units='degrees'):
        checks.append({'name': name, 'cameraId': camera['id'], 'view': camera['view'],
                       'value': round(values, 1), 'units': units, 'passed': target, 'cue': cue})
    # One best-observed camera per check; never double-count a movement across cameras.
    side_options = [(c, [r for r in c['rows'] if start <= r['t'] <= end]) for c in cameras if c['view'] == 'side']
    side_options = [(c, rows) for c, rows in side_options if len(rows) >= 4 and rows[0]['t'] <= start+300 and rows[-1]['t'] >= end-300]
    key = 'knee' if exercise in ('squat', 'lunge') else 'hip' if exercise == 'deadlift' else 'elbow'
    side_options.sort(key=lambda pair: sum(r[key] is not None for r in pair[1]), reverse=True)
    if side_options:
        camera, rows = side_options[0]
        values = [r[key] for r in rows if r[key] is not None]
        if len(values) >= len(rows)*.8:
            minimum, maximum = min(values), values[-1]
            limit = 110 if exercise in ('squat', 'lunge') else 115 if exercise == 'deadlift' else 95
            add('Observed range of motion', camera, minimum, minimum <= limit,
                'Controlled range observed.' if minimum <= limit else 'Range looks shortened from this view; use a comfortable, controlled range.')
            add('Return to extension', camera, maximum, maximum >= 155,
                'Controlled return observed.' if maximum >= 155 else 'Finish the return without forcing the joint into lockout.')
        if exercise == 'curl':
            drift = [r['shoulderDrift'] for r in rows if r['shoulderDrift'] is not None]
            if len(drift) >= len(rows)*.8:
                movement = max(drift)-min(drift)
                add('Upper-arm stability', camera, movement, movement <= .3,
                    'Upper arm stayed steady.' if movement <= .3 else 'Reduce upper-arm swing; consider a lighter load.', 'torso lengths')
    if exercise in ('squat', 'lunge'):
        for camera in cameras:
            if camera['view'] != 'frontal':
                continue
            rows = [r for r in camera['rows'] if start <= r['t'] <= end]
            valid = [r for r in rows if r['alignment'] is not None and r['stance'] > .1]
            if len(valid) < 4 or len(valid) < len(rows)*.8 or valid[0]['t'] > start+300 or valid[-1]['t'] < end-300:
                continue
            deviation = median(r['alignment']/r['stance'] for r in valid)
            add('Frontal knee tracking', camera, deviation, deviation <= .5,
                'Knees track near the feet in this view.' if deviation <= .5 else 'Check knee tracking over your feet; verify camera alignment.', 'stance widths')
            break
    score = round(100 * sum(c['passed'] for c in checks)/len(checks)) if checks else None
    return {'startMs': start, 'endMs': end, 'durationSeconds': round((end-start)/1000, 2),
            'score': score, 'checks': checks, 'feedback': [c['cue'] for c in checks if not c['passed']]}


def analyze(payload: AnalysisRequest):
    cameras = [features(s) for s in payload.streams]
    warnings = []
    if len(cameras) > 1:
        overlap_start = max(c['rows'][0]['t'] for c in cameras)
        overlap_end = min(c['rows'][-1]['t'] for c in cameras)
        if overlap_end-overlap_start < 1000:
            raise ValueError('Camera timelines need at least one second of overlap. Adjust clip offsets.')
        warnings.append('Multi-view checks use your supplied synchronization; no 3D reconstruction or automatic clock calibration.')
    candidate, confidence = classify(cameras)
    exercise = payload.confirmedExercise or (candidate if confidence >= .68 else None)
    if payload.confirmedExercise and candidate and candidate != exercise:
        warnings.append('Observed movement differs from the confirmed exercise. Verify your selection before saving.')
    reps = []
    if exercise:
        key = 'knee' if exercise in ('squat', 'lunge') else 'hip' if exercise == 'deadlift' else 'elbow'
        usable = [c for c in cameras if c['view'] == 'side']
        if usable:
            primary = max(usable, key=lambda c: sum(r[key] is not None for r in c['rows']))
            reps = [dict(index=i+1, **evaluate_rep(exercise, start, end, cameras)) for i, (start,end) in enumerate(segments(primary['rows'], key))]
        else:
            warnings.append('A clear side view is required to count and score repetitions. Frontal views add knee-tracking checks.')
    else:
        warnings.append('Movement is ambiguous. Show a full repetition from the side, or confirm the exercise manually.')
    if not reps:
        warnings.append('No complete, sufficiently visible repetitions yet. Missing or partial reps are not scored.')
    scores = [r['score'] for r in reps if r['score'] is not None]
    missing = ['Load, pain, breathing and spinal curvature are not assessed.']
    if exercise in ('squat','lunge') and not any(c['name'] == 'Frontal knee tracking' for r in reps for c in r['checks']):
        missing.append('Knee tracking needs an aligned frontal view with hips, knees and feet visible.')
    return {'modelVersion': VERSION, 'exercise': exercise, 'exerciseName': NAMES.get(exercise, 'Undetermined'),
            'candidate': candidate, 'confidence': confidence, 'selectionSource': 'confirmed' if payload.confirmedExercise else 'detected',
            'status': 'scored' if scores else 'insufficient_evidence', 'repCount': len(reps),
            'score': round(sum(scores)/len(scores)) if scores else None, 'reps': reps,
            'views': [{k: v for k,v in c.items() if k != 'rows'} for c in cameras],
            'warnings': warnings, 'notAssessed': missing, 'disclaimer': DISCLAIMER,
            'durationSeconds': round((max(c['rows'][-1]['t'] for c in cameras)-min(c['rows'][0]['t'] for c in cameras))/1000, 2)}
