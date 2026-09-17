"""Deterministic 2D movement analysis, v1. Not a clinically validated form model.

No LLM decides scores. Missing landmarks, ambiguous views and incomplete reps
abstain. Multiple views contribute independent checks on an aligned timeline;
this is NOT uncalibrated 3D triangulation. Thresholds are transparent heuristics.
"""
from math import acos, degrees, hypot
from statistics import median
from .schemas import AnalysisRequest, CameraStream

VERSION = 'pose-rules-1.2'
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


def graded(name, camera, value, target, tolerance, direction, units, ok, fix):
    """Score a single visible check 0-100 by how far the measurement sits outside its target band.

    ``value``/``target`` are what the cue quotes. Within target → 100; ``tolerance`` past it → 0.
    """
    deviation = round((value - target) if direction == 'max' else (target - value), 1)
    passed = deviation <= 0
    score = 100 if passed else max(0, round(100 - 100 * deviation / tolerance))
    shown = round(value, 1) if units != 's' else round(value, 1)
    text = (ok if passed else fix).format(v=shown, d=abs(deviation), t=target)
    return {'name': name, 'cameraId': camera['id'], 'view': camera['view'], 'value': round(value, 1), 'units': units,
            'target': f"{'≤' if direction == 'max' else '≥'} {target}{'' if units == 'degrees' else ' ' + units}",
            'score': score, 'passed': passed, 'cue': text}


def percentile(values, share):
    ordered = sorted(values)
    return ordered[int((len(ordered) - 1) * share)]


PRIMARY_JOINT = {'squat': 'knee', 'lunge': 'knee', 'deadlift': 'hip', 'bench': 'elbow', 'ohp': 'elbow', 'curl': 'elbow'}


def side_checks(exercise, camera, rows, seconds):
    """Sagittal (side-view) checks. Every value is a measured 2D joint angle or duration."""
    key = PRIMARY_JOINT[exercise]
    values = [r[key] for r in rows if r.get(key) is not None]
    if len(values) < len(rows) * .8:
        return []
    # The segmenter closes a rep as soon as the joint re-crosses its extension gate, so the
    # lockout is the best of the final frames rather than the single crossing sample.
    bottom, top = percentile(values, .1), max(values[-3:])
    trunks = [r.get('trunk') for r in rows if r.get('trunk') is not None]
    # Torso angle while the primary joint is near its deepest point of this rep.
    at_bottom = [r['trunk'] for r in rows if r.get(key) is not None and r.get('trunk') is not None and r[key] <= bottom + 10]
    tail = [r.get('trunk') for r in rows[-3:] if r.get('trunk') is not None]
    checks = []
    add = lambda *a, **k: checks.append(graded(*a, camera=camera, **k))
    deg = 'degrees'
    if exercise == 'squat':
        add('Squat depth', value=bottom, target=100, tolerance=30, direction='max', units=deg,
            ok='Knee bent to {v}° — at or below parallel.',
            fix='Knee only bent to {v}°, {d}° short of parallel ({t}°). Sit deeper — hips back and down.')
        add('Stand-up lockout', value=top, target=155, tolerance=25, direction='min', units=deg,
            ok='Stood up to {v}° — full extension.',
            fix='Finished at {v}°, {d}° short of standing tall. Drive all the way up before the next rep.')
        if at_bottom:
            add('Torso angle at the bottom', value=median(at_bottom), target=45, tolerance=25, direction='max', units=deg,
                ok='Torso stayed {v}° from vertical at the bottom — chest up.',
                fix='Torso folded {v}° forward at the bottom, {d}° past the {t}° guide. Brace and keep your chest up.')
        add('Tempo', value=seconds, target=1.5, tolerance=1.0, direction='min', units='s',
            ok='Rep took {v}s — controlled.', fix='Rep took {v}s — fast for a squat. Slow the descent to about 2 seconds.')
    elif exercise == 'lunge':
        add('Lunge depth', value=bottom, target=100, tolerance=30, direction='max', units=deg,
            ok='Front knee bent to {v}° — good depth.',
            fix='Front knee only bent to {v}°, {d}° short of {t}°. Step longer and drop the back knee lower.')
        add('Stand-up lockout', value=top, target=155, tolerance=25, direction='min', units=deg,
            ok='Returned to {v}° — full extension.', fix='Finished at {v}°, {d}° short of standing tall. Push fully back to standing.')
        if at_bottom:
            add('Upright torso', value=median(at_bottom), target=25, tolerance=25, direction='max', units=deg,
                ok='Torso stayed {v}° from vertical — tall.', fix='Torso leaned {v}° forward, {d}° past the {t}° guide. Stay tall — eyes forward.')
        add('Tempo', value=seconds, target=1.2, tolerance=0.8, direction='min', units='s',
            ok='Rep took {v}s — controlled.', fix='Rep took {v}s — rushed. Lower for a full second before driving up.')
    elif exercise == 'deadlift':
        add('Hip hinge depth', value=bottom, target=115, tolerance=35, direction='max', units=deg,
            ok='Hips hinged to {v}° — full hinge.', fix='Hips only hinged to {v}°, {d}° short of {t}°. Push the hips back further before bending the knees.')
        add('Hip lockout', value=top, target=155, tolerance=25, direction='min', units=deg,
            ok='Hips locked out at {v}°.', fix='Hips finished at {v}°, {d}° short of lockout. Stand tall and squeeze the glutes at the top.')
        knees = [r['knee'] for r in rows if r.get('knee') is not None]
        if len(knees) >= len(rows) * .8:
            add('Knee bend', value=percentile(knees, .1), target=100, tolerance=30, direction='min', units=deg,
                ok='Knees bent to {v}° — shins stayed fairly vertical.', fix='Knees bent to {v}°, {d}° more than a hinge needs. This is drifting toward a squat — keep shins vertical, hips back.')
        if tail:
            add('Upright finish', value=median(tail), target=15, tolerance=20, direction='max', units=deg,
                ok='Torso finished {v}° from vertical.', fix='Torso finished {v}° from vertical, {d}° past the {t}° guide. Finish standing fully upright.')
        add('Tempo', value=seconds, target=1.5, tolerance=1.0, direction='min', units='s',
            ok='Rep took {v}s — controlled.', fix='Rep took {v}s — quick. Control the bar down for at least a second.')
    elif exercise == 'bench':
        add('Bar depth', value=bottom, target=90, tolerance=30, direction='max', units=deg,
            ok='Elbows bent to {v}° — bar reached the chest.', fix='Elbows only bent to {v}°, {d}° short of {t}°. Bring the bar all the way to the chest.')
        add('Lockout', value=top, target=155, tolerance=25, direction='min', units=deg,
            ok='Elbows locked out at {v}°.', fix='Elbows finished at {v}°, {d}° short of lockout. Press to full extension.')
        add('Tempo', value=seconds, target=1.2, tolerance=0.8, direction='min', units='s',
            ok='Rep took {v}s — controlled.', fix='Rep took {v}s — fast. Lower the bar under control.')
    elif exercise == 'ohp':
        add('Bottom position', value=bottom, target=90, tolerance=30, direction='max', units=deg,
            ok='Elbows bent to {v}° — bar reached chin level.', fix='Elbows only bent to {v}°, {d}° short of {t}°. Lower the bar to about chin height each rep.')
        add('Overhead lockout', value=top, target=155, tolerance=25, direction='min', units=deg,
            ok='Elbows locked out at {v}° overhead.', fix='Elbows finished at {v}°, {d}° short of lockout. Press until the arms are straight.')
        overhead = [r.get('overhead') for r in rows[-3:] if r.get('overhead') is not None]
        if overhead:
            add('Finish over the shoulders', value=100 * sum(overhead) / len(overhead), target=50, tolerance=50, direction='min', units='%',
                ok='Wrists finished above the shoulders.', fix='Wrists stayed in front of the shoulders at the top. Finish with the bar stacked over the shoulders.')
        if trunks:
            add('Back lean', value=max(trunks), target=15, tolerance=20, direction='max', units=deg,
                ok='Torso stayed within {v}° of vertical.', fix='Torso leaned {v}° from vertical, {d}° past the {t}° guide. Brace the core and avoid arching the lower back.')
        add('Tempo', value=seconds, target=1.2, tolerance=0.8, direction='min', units='s',
            ok='Rep took {v}s — controlled.', fix='Rep took {v}s — quick. Lower the bar under control.')
    elif exercise == 'curl':
        add('Curl range', value=bottom, target=60, tolerance=30, direction='max', units=deg,
            ok='Elbow closed to {v}° — full curl.', fix='Elbow only closed to {v}°, {d}° short of a full curl ({t}°). Squeeze all the way up.')
        add('Full extension', value=top, target=150, tolerance=25, direction='min', units=deg,
            ok='Arm extended to {v}° at the bottom.', fix='Arm only opened to {v}°, {d}° short of straight. Lower fully before the next curl.')
        drift = [r['shoulderDrift'] for r in rows if r.get('shoulderDrift') is not None]
        if len(drift) >= len(rows) * .8:
            add('Upper-arm stability', value=max(drift) - min(drift), target=.3, tolerance=.3, direction='max', units='torso lengths',
                ok='Upper arm moved {v} torso-lengths — pinned.', fix='Upper arm swung {v} torso-lengths — keep the elbows pinned to your sides; consider a lighter load.')
        add('Tempo', value=seconds, target=1.5, tolerance=1.0, direction='min', units='s',
            ok='Rep took {v}s — controlled.', fix='Rep took {v}s — swinging. Take 2 seconds on the way down.')
    return checks


def evaluate_rep(exercise, start, end, cameras):
    checks = []
    key = PRIMARY_JOINT[exercise]
    # One best-observed camera per check; never double-count a movement across cameras.
    side_options = [(c, [r for r in c['rows'] if start <= r['t'] <= end]) for c in cameras if c['view'] == 'side']
    side_options = [(c, rows) for c, rows in side_options if len(rows) >= 4 and rows[0]['t'] <= start+300 and rows[-1]['t'] >= end-300]
    side_options.sort(key=lambda pair: sum(r.get(key) is not None for r in pair[1]), reverse=True)
    if side_options:
        camera, rows = side_options[0]
        checks += side_checks(exercise, camera, rows, (end - start) / 1000)
    if exercise in ('squat', 'lunge'):
        for camera in cameras:
            if camera['view'] != 'frontal':
                continue
            rows = [r for r in camera['rows'] if start <= r['t'] <= end]
            valid = [r for r in rows if r.get('alignment') is not None and r.get('stance', 0) > .1]
            if len(valid) < 4 or len(valid) < len(rows)*.8 or valid[0]['t'] > start+300 or valid[-1]['t'] < end-300:
                continue
            deviation = median(r['alignment']/r['stance'] for r in valid)
            checks.append(graded('Frontal knee tracking', camera, deviation, .5, .5, 'max', 'stance widths',
                                 'Knees tracked {v} stance-widths off the foot line — in line.',
                                 'Knees drifted {v} stance-widths off the foot line ({d} past the {t} guide). Push the knees out over the toes.'))
            break
    score = round(sum(c['score'] for c in checks)/len(checks)) if checks else None
    return {'startMs': start, 'endMs': end, 'durationSeconds': round((end-start)/1000, 2),
            'score': score, 'checks': checks, 'feedback': [c['cue'] for c in checks if not c['passed']]}


def focus_areas(reps):
    """Session-level coaching: which checks failed, how often, and the worst measured value."""
    by_name = {}
    for rep in reps:
        for check in rep['checks']:
            entry = by_name.setdefault(check['name'], {'name': check['name'], 'units': check['units'], 'target': check['target'], 'reps': 0, 'failed': 0, 'values': [], 'worst': None})
            entry['reps'] += 1
            entry['values'].append(check['value'])
            if not check['passed']:
                entry['failed'] += 1
                if entry['worst'] is None or check['score'] < entry['worst']['score']:
                    entry['worst'] = check
    result = []
    for entry in sorted(by_name.values(), key=lambda e: (-e['failed'], e['name'])):
        average = round(sum(entry['values']) / len(entry['values']), 1)
        result.append({'name': entry['name'], 'failedReps': entry['failed'], 'totalReps': entry['reps'], 'average': average,
                       'units': entry['units'], 'target': entry['target'], 'passed': entry['failed'] == 0,
                       'cue': entry['worst']['cue'] if entry['worst'] else f"Consistent across {entry['reps']} reps (average {average}{'°' if entry['units'] == 'degrees' else ' ' + entry['units']}).",})
    return result


def headline(exercise_name, reps, score, focus):
    if not reps or score is None:
        return 'Not enough visible movement to score yet.'
    failed = [f for f in focus if not f['passed']]
    if not failed:
        return f"{exercise_name}: {len(reps)} reps at {score}/100 — every visible check passed."
    top = failed[0]
    return f"{exercise_name}: {len(reps)} reps at {score}/100. Main focus: {top['name'].lower()} ({top['failedReps']} of {top['totalReps']} reps)."


def analyze(payload: AnalysisRequest):
    cameras = [features(s) for s in payload.streams]
    warnings = []
    if len(cameras) > 1:
        overlap_start = max(c['rows'][0]['t'] for c in cameras)
        overlap_end = min(c['rows'][-1]['t'] for c in cameras)
        if overlap_end-overlap_start < 1000:
            raise ValueError('Camera timelines need at least one second of overlap. Adjust clip offsets.')
        # Analyze only the shared timeline. A longer primary clip must not create
        # "multi-view" reps that the other synchronized cameras never captured.
        cameras = [{**c, 'rows': [r for r in c['rows'] if overlap_start <= r['t'] <= overlap_end]} for c in cameras]
        warnings.append('Analysis is limited to the timeline shared by every camera. Multi-view checks use your supplied synchronization; no 3D reconstruction or automatic clock calibration.')
    candidate, confidence = classify(cameras)
    exercise = payload.confirmedExercise or (candidate if confidence >= .68 else None)
    if payload.confirmedExercise and candidate and candidate != exercise:
        warnings.append('Observed movement differs from the confirmed exercise. Verify your selection before saving.')
    reps = []
    if exercise:
        key = PRIMARY_JOINT[exercise]
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
    score = round(sum(scores)/len(scores)) if scores else None
    focus = focus_areas(reps)
    missing = ['Load, pain, breathing and spinal curvature are not assessed.']
    if exercise in ('squat','lunge') and not any(c['name'] == 'Frontal knee tracking' for r in reps for c in r['checks']):
        missing.append('Knee tracking needs an aligned frontal view with hips, knees and feet visible.')
    name = NAMES.get(exercise, 'Undetermined')
    return {'modelVersion': VERSION, 'exercise': exercise, 'exerciseName': name,
            'candidate': candidate, 'confidence': confidence, 'selectionSource': 'confirmed' if payload.confirmedExercise else 'detected',
            'status': 'scored' if scores else 'insufficient_evidence', 'repCount': len(reps),
            'score': score, 'reps': reps, 'focus': focus, 'headline': headline(name, reps, score, focus),
            'views': [{k: v for k,v in c.items() if k != 'rows'} for c in cameras],
            'warnings': warnings, 'notAssessed': missing, 'disclaimer': DISCLAIMER,
            'durationSeconds': round((max(c['rows'][-1]['t'] for c in cameras)-min(c['rows'][0]['t'] for c in cameras))/1000, 2)}
