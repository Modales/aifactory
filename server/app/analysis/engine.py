"""Deterministic 2D movement analysis, v2. Not a clinically validated form model.

No LLM decides scores. Missing landmarks, ambiguous views and incomplete reps abstain.
Every exercise — built-in or taught by the athlete — is a spec from ``library.py``:
the classifier scores how well the observed motion statistics fit each spec's signature,
the segmenter counts extended→flexed→extended (or the reverse) cycles of the spec's primary
joint — failing over to the opposite-side joint when the dominant side is occluded — and each
rep is graded 0–100 on the spec's templated checks with cues that quote the measured angle. Multiple views contribute independent checks on an aligned timeline; this is
NOT uncalibrated 3D triangulation.
"""
from statistics import median
from time import time
from .features import angle, extrema_envelope, features, stat, values, percentile  # noqa: F401 (angle re-exported for tests)
from .library import DEFAULT_SCALE, FAMILIES, LIBRARY, SCALE
from .schemas import AnalysisRequest

VERSION = 'pose-rules-2.0'
DETECT_THRESHOLD = .68
MIN_DETECT_MS = 1000
MIN_DETECT_ROWS = 8
MAX_GAP_MS = 1500       # a joint hidden for longer than this ends the rep in progress
MOVER_SHARE = .5        # a spec's primary joint must move at least this share of the busiest joint
DISCLAIMER = 'Experimental 2D movement estimates, not medical advice or a safety verdict. Scores cover only visible checks, not overall technique. Equipment, load, pain and spinal curvature cannot be determined from landmarks.'
NAMES = {id: spec['name'] for id, spec in LIBRARY.items()}


# ─── Classification ────────────────────────────────────────────────────────────────────────────
def fit(value, lo, hi, scale):
    """1 inside the band, linearly down to 0 at ``scale`` past either edge."""
    if lo <= value <= hi:
        return 1.0
    distance = lo - value if value < lo else value - hi
    return max(0.0, 1 - distance / scale)


def _stat2(rows, key, name):
    """A signal's statistic, falling back to the opposite-side twin when the dominant side is occluded."""
    value = stat(rows, key, name)
    if value is None and key in OTHER_SIDE:
        value = stat(rows, OTHER_SIDE[key], name)
    return value


def match(spec, camera):
    """How well one camera's observed motion fits a spec's signature (0–1). None = cannot judge.

    Only visible evidence scores: unseen bands are excluded from the mean and the floor instead
    of voting a flat 0.5, and the result is discounted by how many bands were visible at all
    (capped at six). The primary joint's bands weigh double — they define the movement. Fewer
    than three visible bands is not detection, it is guessing: abstain and let the LLM or the
    athlete decide.
    """
    rows = camera['rows']
    fits = []
    for key, name, lo, hi, *rest in spec['signature']:
        value = _stat2(rows, key, name)
        if value is None:
            if key == spec['primary']:
                return None
            fits.append((None, 1))
            continue
        fits.append((fit(value, lo, hi, rest[0] if rest else SCALE.get(key, DEFAULT_SCALE)),
                     2 if key == spec['primary'] else 1))
    seen = [(f, w) for f, w in fits if f is not None]
    if len(seen) < min(3, len(fits)):
        return None
    mean = sum(f * w for f, w in seen) / sum(w for _, w in seen)
    quality = 0.5 * mean + 0.5 * min(f for f, _ in seen)
    # Absolute evidence count (capped at 6): more independent confirmations beat a short spec
    # that happens to fit the same few signals — a standing squat must not lose to a hanging
    # knee raise just because the wrists are out of frame.
    return round(quality * (0.6 + 0.4 * min(1, len(seen) / 6)), 3)


def classify(cameras, library=None):
    """Rank every non-variant spec against every usable camera. Fast: works on partial reps."""
    library = library or LIBRARY
    scores = {}
    for camera in cameras:
        rows = camera['rows']
        if camera['view'] not in ('side', 'frontal') or len(rows) < MIN_DETECT_ROWS or rows[-1]['t'] - rows[0]['t'] < MIN_DETECT_MS:
            continue
        moving = {k: _stat2(rows, k, 'range') for k in ('knee', 'hip', 'elbow', 'shoulder', 'trunk', 'ankle')}
        moving = {k: v for k, v in moving.items() if v is not None}
        busiest = max(moving.values(), default=0)
        if busiest < 15:
            continue
        for spec in library.values():
            if spec['variantOf'] or camera['view'] not in spec['views']:
                continue
            # The joint that defines a spec must be one of the joints actually doing the work:
            # a still hip cannot be a kettlebell swing just because the other bands happen to fit.
            if spec['primary'] in moving and moving[spec['primary']] < MOVER_SHARE * busiest:
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
    lateral raise). Frames where the joint is hidden are skipped; only a visibility gap longer
    than ``MAX_GAP_MS`` or a 15 s stall resets the state machine.
    """
    sign = 1 if cycle == 'flex' else -1
    start, low, last_t, window, result = None, False, None, [], []
    for row in rows:
        value = row.get(key)
        if value is None:
            # Live landmarks flicker below the visibility threshold for a frame or two all the
            # time; skipping them (rather than resetting) keeps the rep in progress.
            continue
        if last_t is not None and row['t'] - last_t > MAX_GAP_MS:
            start, low, window = None, False, []
        last_t = row['t']
        window = (window + [value])[-3:]
        # The median rejects flicker, but at ~8 fps a fast rep tops out for a single frame and the
        # median erases it; the 3-frame mean keeps it (a lone flicker spike still can't reach the gate).
        smooth, mean = median(window), sum(window) / len(window)
        in_work = sign * smooth < sign * work
        at_rest = sign * smooth >= sign * rest or sign * mean >= sign * rest
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


MIN_RANGE = 20          # degrees the primary joint must travel before any rep can count
MIN_COVERAGE = .5       # share of frames the primary joint must be visible in to drive counting
# When the dominant-side joint is hidden or foreshortened, the same joint on the opposite side
# is tried next: it is a real joint angle, so reps counted from it can still be graded (the
# spec's standards are symmetric). Only when both sides are unusable does counting fall back to
# a body-position proxy, which rises and falls with every rep but can never be graded.
OTHER_SIDE = {'knee': 'otherKnee', 'hip': 'otherHip', 'elbow': 'otherElbow',
              'shoulder': 'otherShoulder', 'ankle': 'otherAnkle'}
PROXIES = {'elbow': ('wristY', .25, 'the height of the shoulders above the hands'),
           'shoulder': ('wristY', .3, 'the height of the hands relative to the shoulders'),
           'knee': ('hipAnkle', .3, 'the height of the hips above the feet'),
           'hip': ('hipAnkle', .3, 'the height of the hips above the feet'),
           'trunk': ('hipAnkle', .3, 'the height of the hips above the feet')}
JOINT_HINTS = {'elbow': 'shoulder, elbow and wrist', 'knee': 'hip, knee and ankle', 'hip': 'shoulder, hip and knee',
               'shoulder': 'elbow, shoulder and hip', 'ankle': 'knee, ankle and foot', 'trunk': 'shoulders and hips'}


def coverage(rows, key):
    """Share of frames (0–1) in which a signal was visible enough to trust."""
    return round(sum(r.get(key) is not None for r in rows) / len(rows), 2) if rows else 0


def adaptive_gates(rows, key, cycle, rest, work, min_range):
    """Relax the spec's rest/work gates toward the athlete's own observed range.

    A foreshortened elbow that only reads 100–140° never crosses a 150° rest gate even though the
    push-up is obvious. The gates move inward only — never outward — so a full-range rep is still
    judged by the spec, while a shallow or oblique one still counts (its depth check will say so).
    The observed range comes from the movement's extrema (``extrema_envelope``): whole-window
    percentiles drift toward the rest position when the athlete rests between reps, and then the
    gates collapse and every rep is missed. Percentiles remain as a fallback for signals too
    short or irregular to zigzag. Returns None when the signal barely moves.
    """
    envelope = extrema_envelope(rows, key, min_range)
    if envelope is None:
        lo, hi = stat(rows, key, 'p10', MIN_COVERAGE), stat(rows, key, 'p90', MIN_COVERAGE)
        if lo is None or hi - lo < min_range:
            return None
    else:
        lo, hi = envelope
    span = hi - lo
    if cycle == 'flex':
        rest, work = min(rest, hi - .2 * span), max(work, lo + .35 * span)
        if rest - work < .2 * span:
            work = rest - .2 * span
    else:
        rest, work = max(rest, lo + .2 * span), min(work, hi - .35 * span)
        if work - rest < .2 * span:
            work = rest + .2 * span
    return rest, work


def count_reps(spec, camera):
    """Segment reps on the spec's primary joint, its opposite-side twin, or a proxy signal.

    Returns (segments, signal) — ``signal`` is the key that drove counting: the spec's primary
    joint, the opposite-side joint (gradeable, symmetric standards), or a coarse proxy (counts
    only, never graded).
    """
    rows, key = camera['rows'], spec['primary']
    for candidate in (key, OTHER_SIDE.get(key)):
        if candidate is None or coverage(rows, candidate) < MIN_COVERAGE:
            continue
        gates = adaptive_gates(rows, candidate, spec['cycle'], spec['rest'], spec['work'], MIN_RANGE)
        if gates:
            return segments(rows, candidate, gates[0], gates[1], spec['cycle'], spec['minSeconds']), candidate
    proxy = PROXIES.get(key)
    if not proxy:
        return [], key
    proxy_key, min_range, _ = proxy
    gates = self_gates(rows, proxy_key, min_range)
    if not gates:
        return [], key
    return segments(rows, proxy_key, *gates, spec['minSeconds']), proxy_key


def self_gates(rows, key, min_range):
    """(rest, work, cycle) derived purely from a signal's own observed range, or None if it barely moves."""
    envelope = extrema_envelope(rows, key, min_range)
    if envelope is None:
        lo, hi = stat(rows, key, 'p10', MIN_COVERAGE), stat(rows, key, 'p90', MIN_COVERAGE)
        if lo is None or hi - lo < min_range:
            return None
    else:
        lo, hi = envelope
    start = stat(rows, key, 'start', MIN_COVERAGE)
    if start is None:
        return None
    span = hi - lo
    cycle = 'flex' if start >= (lo + hi) / 2 else 'extend'    # rest at the high end, or at the low end
    rest = hi - .25 * span if cycle == 'flex' else lo + .25 * span
    work = lo + .4 * span if cycle == 'flex' else hi - .4 * span
    return rest, work, cycle


def full_cycle(cameras):
    """True once any joint has completed one rest → work → rest cycle.

    Auto-detection waits for this: half a rep (a descent, an arm lifting) fits many specs
    equally well, and committing to a guess that early is what made detections look random.
    """
    keys = ('knee', 'hip', 'elbow', 'shoulder', 'ankle', 'trunk') + tuple(OTHER_SIDE.values())
    for camera in cameras:
        for key in keys:
            gates = self_gates(camera['rows'], key, MIN_RANGE)
            if gates and segments(camera['rows'], key, *gates, .3):
                return True
    return False


ACTIVE_PAD_MS = 600


def active_window(cameras):
    """Trim to the span where reps actually repeat, so getting into position doesn't count as the exercise.

    Kneeling down into a plank or standing up after the set swings joints the exercise keeps
    still (a push-up's knees), which wrecked every signature. The joint with the most self-gated
    cycles marks the working span; with fewer than two cycles there is nothing to trim against.
    """
    keys = ('knee', 'hip', 'elbow', 'shoulder', 'ankle', 'trunk') + tuple(OTHER_SIDE.values())
    best = []
    for camera in cameras:
        for key in keys:
            gates = self_gates(camera['rows'], key, MIN_RANGE)
            reps = segments(camera['rows'], key, *gates, .3) if gates else []
            if len(reps) > len(best):
                best = reps
    if len(best) < 2:
        return cameras
    lo, hi = best[0][0] - ACTIVE_PAD_MS, best[-1][1] + ACTIVE_PAD_MS
    return [{**c, 'rows': [r for r in c['rows'] if lo <= r['t'] <= hi]} for c in cameras]


def side_swapped(camera, key, other):
    """A copy of one camera whose rows read the opposite-side joint as the primary one.

    Grading keys (``_primary`` → ``spec['primary']``) then resolve to the visible joint, so a
    set counted on the opposite side is graded by exactly the same checks. Symmetric signals
    (kneeAsym, hipAsym) are unchanged; unrelated checks are untouched.
    """
    rows = [{**r, key: r.get(other), other: r.get(key)} for r in camera['rows']]
    return {**camera, 'rows': rows}


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


PROPOSED = 'proposed'   # provisional id for an exercise the LLM named but the athlete has not added yet


def resolve(cameras, detection, library, detector, session_key):
    """Pick the exercise. The AI model decides alone whenever one is configured; the rule classifier
    only runs offline (no API key / tests). Returns (exercise_id, confidence, library, proposal, note)."""
    candidate, confidence = detection['exercise'], detection['confidence']
    if detector is None:
        return (candidate if confidence >= DETECT_THRESHOLD else None), confidence, library, None, None
    opinion = detector(cameras, detection, library, segments, session_key)
    if not opinion or opinion['confidence'] < .5:
        return None, confidence, library, None, None
    if opinion['exerciseId']:
        return opinion['exerciseId'], opinion['confidence'], library, None, opinion['reason']
    new = opinion['newExercise']
    if not new:
        return None, confidence, library, None, None
    from .library import learn
    try:
        spec = learn(new['name'], cameras, segments, new['muscles'], exercise_id=PROPOSED)
    except ValueError:
        # Named but not enough complete reps yet to build a provisional template; keep the name for the UI.
        return None, confidence, library, {**new, 'confidence': opinion['confidence'], 'reason': opinion['reason']}, opinion['reason']
    spec['family'] = new['family']
    proposal = {**new, 'confidence': opinion['confidence'], 'reason': opinion['reason']}
    return PROPOSED, opinion['confidence'], {**library, PROPOSED: spec}, proposal, opinion['reason']


SWITCH_AFTER = 3            # consecutive disagreeing evaluations before a detected exercise changes
LOCK_TTL = 15 * 60
_locks: dict[str, dict] = {}


def hold(session_key, exercise, confidence, source, note):
    """Keep one auto-detected exercise per recording session.

    The live loop re-classifies the whole set every few seconds; without memory, every window
    that happens to fit another spec slightly better flips the label (and the rep count with it).
    A detection sticks until a *different* exercise wins ``SWITCH_AFTER`` evaluations in a row;
    an ambiguous window never erases it. Returns (exercise, confidence, source, note).
    """
    if not session_key:
        return exercise, confidence, source, note
    now = time()
    for key in [k for k, v in _locks.items() if now - v['at'] > LOCK_TTL]:
        del _locks[key]
    lock = _locks.get(session_key)
    if lock is None or lock['exercise'] == exercise:
        if exercise and exercise != PROPOSED:
            _locks[session_key] = {'exercise': exercise, 'confidence': confidence, 'source': source, 'note': note,
                                   'challenger': None, 'streak': 0, 'at': now}
        return exercise, confidence, source, note
    lock['at'] = now
    if exercise and exercise != PROPOSED:
        lock['streak'] = lock['streak'] + 1 if lock['challenger'] == exercise else 1
        lock['challenger'] = exercise
        if lock['streak'] >= SWITCH_AFTER:
            _locks[session_key] = {'exercise': exercise, 'confidence': confidence, 'source': source, 'note': note,
                                   'challenger': None, 'streak': 0, 'at': now}
            return exercise, confidence, source, note
    return lock['exercise'], lock['confidence'], lock['source'], lock['note']


def analyze(payload: AnalysisRequest, library=None, detector=None, coach=None):
    library = library or LIBRARY
    cameras = [{**features(s), 'snapshots': s.snapshots} for s in payload.streams]
    warnings = []
    if detector is not None and not getattr(detector, 'available', True):
        detector = None     # no API key: fall back to the rule classifier
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
    active = active_window(cameras)
    detection = classify(active, library) if detector is None else {'exercise': None, 'confidence': 0, 'candidates': [], 'alternatives': []}
    candidate, confidence = detection['exercise'], detection['confidence']
    proposal, note, source = None, None, 'detected'
    if payload.confirmedExercise:
        exercise, source = payload.confirmedExercise, 'confirmed'
    else:
        exercise = None
        if full_cycle(cameras):
            exercise, resolved_confidence, library, proposal, note = resolve(active, detection, library, detector, payload.sessionKey)
            if note is not None:
                confidence, source = resolved_confidence, 'llm'
        exercise, confidence, source, note = hold(payload.sessionKey, exercise, confidence, source, note)
        if exercise not in library and exercise != PROPOSED:
            exercise = None     # a held custom exercise that has since been deleted
        if exercise:
            candidate = exercise
            if exercise != PROPOSED and not any(c['id'] == exercise for c in detection['candidates']):
                detection['candidates'].insert(0, {'id': exercise, 'name': library[exercise]['name'], 'score': confidence})
        if exercise != PROPOSED:
            proposal = None if exercise else proposal
    if payload.confirmedExercise and candidate and root(candidate, library) != root(exercise, library) and confidence >= DETECT_THRESHOLD:
        warnings.append(f"Observed movement looks more like {library[candidate]['name'].lower()} than the confirmed exercise. Verify your selection before saving.")

    reps = []
    spec = library.get(exercise)
    if spec:
        usable = [c for c in cameras if c['view'] in spec['views']]
        estimated = [c for c in cameras if c['viewSource'] == 'estimated']
        if not usable and source == 'confirmed' and estimated:
            # The athlete told us the exercise; an estimated oblique/unknown angle must not silence it.
            best = max(estimated, key=lambda c: coverage(c['rows'], spec['primary']))
            relabeled = {**best, 'view': spec['views'][0], 'viewSource': 'assumed'}
            cameras = [relabeled if c is best else c for c in cameras]
            usable = [relabeled]
            warnings.append(f"Camera angle was estimated as {best['view']}; scoring as a {spec['views'][0]} view because you confirmed {spec['name'].lower()}. Angles may be foreshortened — a true {spec['views'][0]} view is more accurate.")
        if usable:
            primary = max(usable, key=lambda c: coverage(c['rows'], spec['primary']))
            seen = coverage(primary['rows'], spec['primary'])
            found, signal = count_reps(spec, primary)
            graded_cameras = cameras
            if found and signal == OTHER_SIDE.get(spec['primary']):
                # The dominant side was unusable but the opposite side drove counting; grade that
                # side through the same checks by presenting its joint as the primary one. The
                # returned camera views still report the rows as actually observed.
                swapped = side_swapped(primary, spec['primary'], signal)
                graded_cameras = [swapped if c is primary else c for c in cameras]
            reps = [dict(index=i + 1, **evaluate_rep(spec, start, end, graded_cameras)) for i, (start, end) in enumerate(found)]
            if seen < MIN_COVERAGE:
                warnings.append(f"Your {spec['primary']} was visible in only {round(seen * 100)}% of frames. Move the camera so your {JOINT_HINTS.get(spec['primary'], spec['primary'])} stay in frame for the whole rep.")
            if signal != spec['primary'] and found:
                if signal == OTHER_SIDE.get(spec['primary']):
                    warnings.append(f"Reps were counted and graded from your opposite-side {spec['primary']} because the {spec['primary']} signal was not measurable. The same standards apply to both sides; side-to-side differences are not assessed.")
                else:
                    warnings.append(f"Reps were counted from {PROXIES[spec['primary']][2]} because the {spec['primary']} was not measurable; form checks need the {spec['primary']} in view.")
        else:
            needed = ' or '.join(spec['views'])
            warnings.append(f"A clear {needed} view is required to count and score {spec['name'].lower()} repetitions." + (' Frontal views add knee-tracking checks.' if 'side' in spec['views'] else ''))
    elif proposal:
        warnings.append(f"This looks like {proposal['name'].lower()}, which is not in the library yet. Finish a few full reps, then add it to your library to count and score them.")
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
    if exercise == PROPOSED:
        warnings.insert(0, f"New exercise recognised: {spec['name']}. Reps are counted from your own movement — add it to your library to save this set.")
    name = spec['name'] if spec else proposal['name'] if proposal else 'Undetermined'
    alternatives = detection['alternatives'] if spec and source == 'detected' and root(spec['id'], library) == root(candidate or spec['id'], library) else []
    if spec and not alternatives and exercise != PROPOSED:
        base = root(spec['id'], library)
        alternatives = [{'id': id, 'name': s['name']} for id, s in library.items() if id == base or s['variantOf'] == base]
    duration = round((max(c['rows'][-1]['t'] for c in cameras) - min(c['rows'][0]['t'] for c in cameras)) / 1000, 2)
    coach_notes = None
    if spec and coach is not None and (reps or duration >= 5):
        from .llm_detect import describe
        summary = describe(cameras, detection, segments)   # includes per-camera joint visibility
        coach_notes = coach(spec['name'], summary, reps, payload.sessionKey, duration)
    return {'modelVersion': VERSION, 'exercise': exercise, 'exerciseName': name,
            'family': spec['family'] if spec else None, 'familyName': FAMILIES.get(spec['family'], spec['family']) if spec else None,
            'primaryJoint': spec['primary'] if spec else None, 'muscleDemand': spec['muscles'] if spec else {},
            'candidate': candidate, 'confidence': confidence, 'candidates': detection['candidates'],
            'alternatives': alternatives if len(alternatives) > 1 else [],
            'selectionSource': source, 'detectionNote': note, 'proposal': proposal,
            'status': 'scored' if scores else 'insufficient_evidence', 'repCount': len(reps),
            'score': score, 'reps': reps, 'focus': focus, 'headline': headline(name, reps, score, focus),
            'coach': coach_notes,
            'views': [{**{k: v for k, v in c.items() if k not in ('rows', 'snapshots')},
                       'coverage': {k: coverage(c['rows'], k) for k in ('elbow', 'shoulder', 'hip', 'knee', 'ankle', 'trunk')}} for c in cameras],
            'warnings': warnings, 'notAssessed': missing, 'disclaimer': DISCLAIMER,
            'durationSeconds': duration}


def learn_from(payload: AnalysisRequest, name, muscles=()):
    """Build a custom spec from the athlete's own recording (see library.learn)."""
    from .library import learn
    cameras = [features(s) for s in payload.streams]
    return learn(name, cameras, segments, muscles)
