"""Deterministic 2D movement analysis, v2. Not a clinically validated form model.

No LLM decides scores. Missing landmarks, ambiguous views and incomplete reps abstain.
Every exercise — built-in or taught by the athlete — is a spec from ``library.py``:
the classifier scores how well the observed motion statistics fit each spec's signature,
the segmenter counts extended→flexed→extended (or the reverse) cycles of the spec's primary
joint, and each rep is graded 0–100 on the spec's templated checks with cues that quote the
measured angle. Multiple views contribute independent checks on an aligned timeline; this is
NOT uncalibrated 3D triangulation.
"""
from statistics import median
from .features import angle, features, stat, values, percentile  # noqa: F401 (angle re-exported for tests)
from .library import DEFAULT_SCALE, FAMILIES, LIBRARY, SCALE
from .schemas import AnalysisRequest

VERSION = 'pose-rules-2.0'
DETECT_THRESHOLD = .68
MIN_DETECT_MS = 1000
MIN_DETECT_ROWS = 8
DISCLAIMER = 'Experimental 2D movement estimates, not medical advice or a safety verdict. Scores cover only visible checks, not overall technique. Equipment, load, pain and spinal curvature cannot be determined from landmarks.'
NAMES = {id: spec['name'] for id, spec in LIBRARY.items()}


# ─── Classification ────────────────────────────────────────────────────────────────────────────
def fit(value, lo, hi, scale):
    """1 inside the band, linearly down to 0 at ``scale`` past either edge."""
    if lo <= value <= hi:
        return 1.0
    distance = lo - value if value < lo else value - hi
    return max(0.0, 1 - distance / scale)


def match(spec, camera):
    """How well one camera's observed motion fits a spec's signature (0–1). None = cannot judge."""
    rows = camera['rows']
    fits = []
    for key, name, lo, hi, *rest in spec['signature']:
        value = stat(rows, key, name)
        if value is None:
            if key == spec['primary']:
                return None
            fits.append(.5)     # unseen joint: neither evidence for nor against
            continue
        fits.append(fit(value, lo, hi, rest[0] if rest else SCALE.get(key, DEFAULT_SCALE)))
    if not fits:
        return None
    return round(0.5 * sum(fits) / len(fits) + 0.5 * min(fits), 3)


def classify(cameras, library=None):
    """Rank every non-variant spec against every usable camera. Fast: works on partial reps."""
    library = library or LIBRARY
    scores = {}
    for camera in cameras:
        rows = camera['rows']
        if camera['view'] not in ('side', 'frontal') or len(rows) < MIN_DETECT_ROWS or rows[-1]['t'] - rows[0]['t'] < MIN_DETECT_MS:
            continue
        moving = [stat(rows, k, 'range') for k in ('knee', 'hip', 'elbow', 'shoulder', 'trunk', 'ankle')]
        if not any(v is not None and v >= 15 for v in moving):
            continue
        for spec in library.values():
            if spec['variantOf'] or camera['view'] not in spec['views']:
                continue
            score = match(spec, camera)
            if score is not None:
                scores[spec['id']] = max(scores.get(spec['id'], 0), score)
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    ranked = [(id, s) for id, s in ranked if s >= .45][:5]
    if not ranked:
        return {'exercise': None, 'confidence': 0, 'candidates': [], 'alternatives': []}
    best_id, best = ranked[0]
    family = library[best_id]['family']
    # Same-family look-alikes are offered as alternatives instead of eroding confidence:
    # the family is what pose can tell quickly; the exact variant is one tap for the athlete.
    rivals = [s for id, s in ranked[1:] if library[id]['family'] != family]
    second = rivals[0] if rivals else 0
    confidence = round(min(best, best * (.55 + (best - second))), 2)
    siblings = [id for id, s in ranked[1:] if library[id]['family'] == family and s >= best - .15]
    alternatives = [best_id] + [s['id'] for s in library.values() if s['variantOf'] == best_id] + siblings
    return {'exercise': best_id, 'confidence': confidence,
            'candidates': [{'id': id, 'name': library[id]['name'], 'score': s} for id, s in ranked],
            'alternatives': [{'id': id, 'name': library[id]['name']} for id in alternatives]}


# ─── Rep segmentation ──────────────────────────────────────────────────────────────────────────
def segments(rows, key='knee', rest=150, work=125, cycle='flex', min_seconds=.7):
    """Hysteresis gates on the primary signal; only rest → work → rest cycles count.

    ``flex`` cycles rest at a high angle (squat, curl); ``extend`` cycles rest low (leg extension,
    lateral raise). A gap in visibility or a 15 s stall resets the state machine.
    """
    sign = 1 if cycle == 'flex' else -1
    start, low, last_t, window, result = None, False, None, [], []
    for row in rows:
        value = row.get(key)
        if value is None or (last_t is not None and row['t'] - last_t > 800):
            start, low, window = None, False, []
        last_t = row['t']
        if value is None:
            continue
        window = (window + [value])[-3:]
        value = median(window)
        at_rest, in_work = sign * value >= sign * rest, sign * value < sign * work
        if start is None:
            if at_rest:
                start = row['t']
        elif row['t'] - start > 15_000:
            start, low = None, False
        elif in_work:
            low = True
        elif at_rest:
            if low and row['t'] - start >= min_seconds * 1000:
                result.append((start, row['t']))
            start, low = row['t'], False
    return result


# ─── Per-rep grading ───────────────────────────────────────────────────────────────────────────
def graded(check, camera, value):
    """Score one visible check 0–100 by how far the measurement sits outside its target band."""
    target, tolerance, direction, units = check['target'], check['tolerance'], check['direction'], check['units']
    deviation = round((value - target) if direction == 'max' else (target - value), 2)
    passed = deviation <= 0
    score = 100 if passed else max(0, round(100 - 100 * deviation / tolerance))
    shown = round(value, 1) if units in ('degrees', 's', '%') else round(value, 2)
    text = (check['ok'] if passed else check['fix']).format(v=shown, d=abs(round(deviation, 1 if units in ('degrees', 's', '%') else 2)), t=target)
    return {'name': check['name'], 'cameraId': camera['id'], 'view': camera['view'], 'value': round(value, 2), 'units': units,
            'target': f"{'≤' if direction == 'max' else '≥'} {target}{'' if units == 'degrees' else ' ' + units}",
            'score': score, 'passed': passed, 'cue': text}


def metric(spec, check, rows, seconds):
    """Resolve a templated check to a measured number over one rep, or None when not visible enough."""
    key = spec['primary'] if check['key'] == '_primary' else check['key']
    name, flex = check['stat'], spec['cycle'] == 'flex'
    if name == 'tempo':
        return seconds
    items = values(rows, key)
    if len(items) < max(3, len(rows) * .8):
        return None
    if name == 'bottom':
        return percentile(items, .1) if flex else percentile(items, .9)
    if name == 'top':
        # The segmenter closes a rep the moment the joint re-crosses its rest gate, so the finish
        # position is the best of the final frames, not the single crossing sample.
        tail = items[-3:]
        return max(tail) if flex else min(tail)
    if name == 'tail':
        return median(items[-3:])
    if name == 'tailPct':
        tail = items[-3:]
        return 100 * sum(1 for v in tail if v) / len(tail)
    if name == 'atBottom':
        primary = values(rows, spec['primary'])
        if len(primary) < 3:
            return None
        bottom = percentile(primary, .1) if flex else percentile(primary, .9)
        span = max(abs(percentile(primary, .9) - percentile(primary, .1)), 1e-6)
        near = [r[key] for r in rows if r.get(key) is not None and r.get(spec['primary']) is not None
                and abs(r[spec['primary']] - bottom) <= max(span * .2, 6)]
        return median(near) if near else None
    return stat(rows, key, name, .8)


def evaluate_rep(spec, start, end, cameras):
    checks = []
    for view in dict.fromkeys(c['view'] for c in spec['checks']):
        # One best-observed camera per view; never double-count a movement across cameras.
        options = [(c, [r for r in c['rows'] if start <= r['t'] <= end]) for c in cameras if c['view'] == view]
        options = [(c, rows) for c, rows in options if len(rows) >= 4 and rows[0]['t'] <= start + 300 and rows[-1]['t'] >= end - 300]
        probe = spec['primary'] if view in spec['views'] else 'kneeTrack'
        options.sort(key=lambda pair: sum(r.get(probe) is not None for r in pair[1]), reverse=True)
        if not options:
            continue
        camera, rows = options[0]
        for check in (c for c in spec['checks'] if c['view'] == view):
            value = metric(spec, check, rows, (end - start) / 1000)
            if value is not None:
                checks.append(graded(check, camera, value))
    score = round(sum(c['score'] for c in checks) / len(checks)) if checks else None
    return {'startMs': start, 'endMs': end, 'durationSeconds': round((end - start) / 1000, 2), 'score': score,
            'checks': checks, 'feedback': [c['cue'] for c in checks if not c['passed']]}


# ─── Session summary ───────────────────────────────────────────────────────────────────────────
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
                       'cue': entry['worst']['cue'] if entry['worst'] else f"Consistent across {entry['reps']} reps (average {average}{'°' if entry['units'] == 'degrees' else ' ' + entry['units']})."})
    return result


def headline(exercise_name, reps, score, focus):
    if not reps or score is None:
        return 'Not enough visible movement to score yet.'
    failed = [f for f in focus if not f['passed']]
    if not failed:
        return f"{exercise_name}: {len(reps)} reps at {score}/100 — every visible check passed."
    top = failed[0]
    return f"{exercise_name}: {len(reps)} reps at {score}/100. Main focus: {top['name'].lower()} ({top['failedReps']} of {top['totalReps']} reps)."


def root(spec_id, library):
    return library[spec_id]['variantOf'] or spec_id


def analyze(payload: AnalysisRequest, library=None):
    library = library or LIBRARY
    cameras = [features(s) for s in payload.streams]
    warnings = []
    if len(cameras) > 1:
        overlap_start = max(c['rows'][0]['t'] for c in cameras)
        overlap_end = min(c['rows'][-1]['t'] for c in cameras)
        if overlap_end - overlap_start < 1000:
            raise ValueError('Camera timelines need at least one second of overlap. Adjust clip offsets.')
        # Analyze only the shared timeline. A longer primary clip must not create
        # "multi-view" reps that the other synchronized cameras never captured.
        cameras = [{**c, 'rows': [r for r in c['rows'] if overlap_start <= r['t'] <= overlap_end]} for c in cameras]
        warnings.append('Analysis is limited to the timeline shared by every camera. Multi-view checks use your supplied synchronization; no 3D reconstruction or automatic clock calibration.')

    if payload.confirmedExercise and payload.confirmedExercise not in library:
        raise ValueError('Unknown exercise. Pick one from the library or teach it first.')
    detection = classify(cameras, library)
    candidate, confidence = detection['exercise'], detection['confidence']
    exercise = payload.confirmedExercise or (candidate if confidence >= DETECT_THRESHOLD else None)
    if payload.confirmedExercise and candidate and root(candidate, library) != root(exercise, library) and confidence >= DETECT_THRESHOLD:
        warnings.append(f"Observed movement looks more like {library[candidate]['name'].lower()} than the confirmed exercise. Verify your selection before saving.")

    reps = []
    spec = library.get(exercise)
    if spec:
        usable = [c for c in cameras if c['view'] in spec['views']]
        if usable:
            primary = max(usable, key=lambda c: sum(r.get(spec['primary']) is not None for r in c['rows']))
            reps = [dict(index=i + 1, **evaluate_rep(spec, start, end, cameras))
                    for i, (start, end) in enumerate(segments(primary['rows'], spec['primary'], spec['rest'], spec['work'], spec['cycle'], spec['minSeconds']))]
        else:
            needed = ' or '.join(spec['views'])
            warnings.append(f"A clear {needed} view is required to count and score {spec['name'].lower()} repetitions." + (' Frontal views add knee-tracking checks.' if 'side' in spec['views'] else ''))
    elif candidate:
        warnings.append(f"Movement resembles {library[candidate]['name'].lower()} but is not yet certain. Keep going, or confirm the exercise manually.")
    else:
        warnings.append('Movement is ambiguous. Show a full repetition with your whole body in frame, confirm the exercise manually, or teach it as a new exercise.')
    if not reps:
        warnings.append('No complete, sufficiently visible repetitions yet. Missing or partial reps are not scored.')

    scores = [r['score'] for r in reps if r['score'] is not None]
    score = round(sum(scores) / len(scores)) if scores else None
    focus = focus_areas(reps)
    missing = ['Load, pain, breathing and spinal curvature are not assessed.']
    if spec and any(c['view'] == 'frontal' for c in spec['checks']) and not any(c['view'] == 'frontal' for r in reps for c in r['checks']):
        missing.append('Knee tracking needs an aligned frontal view with hips, knees and feet visible.')
    if spec and spec['custom']:
        missing.append('Taught exercises are checked against your own recorded range and tempo, not a coaching standard.')
    name = spec['name'] if spec else 'Undetermined'
    alternatives = detection['alternatives'] if spec and root(spec['id'], library) == root(candidate or spec['id'], library) else []
    if spec and not alternatives:
        base = root(spec['id'], library)
        alternatives = [{'id': id, 'name': s['name']} for id, s in library.items() if id == base or s['variantOf'] == base]
    return {'modelVersion': VERSION, 'exercise': exercise, 'exerciseName': name,
            'family': spec['family'] if spec else None, 'familyName': FAMILIES.get(spec['family'], spec['family']) if spec else None,
            'primaryJoint': spec['primary'] if spec else None, 'muscleDemand': spec['muscles'] if spec else {},
            'candidate': candidate, 'confidence': confidence, 'candidates': detection['candidates'],
            'alternatives': alternatives if len(alternatives) > 1 else [],
            'selectionSource': 'confirmed' if payload.confirmedExercise else 'detected',
            'status': 'scored' if scores else 'insufficient_evidence', 'repCount': len(reps),
            'score': score, 'reps': reps, 'focus': focus, 'headline': headline(name, reps, score, focus),
            'views': [{k: v for k, v in c.items() if k != 'rows'} for c in cameras],
            'warnings': warnings, 'notAssessed': missing, 'disclaimer': DISCLAIMER,
            'durationSeconds': round((max(c['rows'][-1]['t'] for c in cameras) - min(c['rows'][0]['t'] for c in cameras)) / 1000, 2)}


def learn_from(payload: AnalysisRequest, name, muscles=()):
    """Build a custom spec from the athlete's own recording (see library.learn)."""
    from .library import learn
    cameras = [features(s) for s in payload.streams]
    return learn(name, cameras, segments, muscles)
