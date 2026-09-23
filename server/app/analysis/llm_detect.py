"""LLM-assisted exercise recognition — the second opinion behind the rule classifier.

The deterministic classifier in ``engine.classify`` is fast but only as good as its hand-tuned
signature bands. When it is unsure (low confidence, or nothing above threshold) we describe the
observed movement in plain measurements — joint-angle ranges, posture, rhythm, the rule
classifier's own guesses — and ask a language model to name the exercise from the library, or
to propose a new one when nothing fits. Only numbers derived from landmarks are sent; no video,
no images, no landmarks.

Results are cached per recording session so the live loop (one evaluation every few seconds)
asks the model only while the answer is still open.
"""
from __future__ import annotations
import json
import re
import time
from statistics import median
from .features import ANGLE_KEYS, extrema_envelope, stat
from .library import FAMILIES, MUSCLE_IDS

CONFIDENT = .6
RETRY_SECONDS = 6           # an unsure answer is re-asked after this many seconds of new data
# A confident answer is re-checked as the recording grows (early windows hold only a partial
# rep), until two consecutive answers agree.
RECHECK_GROWTH = 1.6
RECHECK_MIN_SECONDS = 6
SESSION_TTL = 15 * 60
SYSTEM = """You identify gym exercises — free weights, bodyweight, cables and machines — from 2D pose measurements captured by a phone camera.
You receive: a description of the movement (joint angle ranges in degrees, posture, how the hips/hands/feet travel through the frame, where the hands are at each end of the rep, joint visibility, rhythm), guesses from a rule-based classifier with scores, and the exercise library (id: name — primary joint, posture).
Angle conventions: knee/hip/elbow 180 = straight. Shoulder angle = elbow-shoulder-hip (arm at side ~15, horizontal ~90, overhead ~170). Trunk = lean from vertical (0 upright, 90 horizontal). Distances are in torso lengths.

How to reason, especially around machines and cables:
- Machines pin part of the body. Hips that stay fixed in the frame mean a seat, bench, pad or machine; hips that travel mean the body moves through space (free squat, lunge, pull-up, push-up).
- Machine parts (pads, seat backs, levers, weight stacks) often hide knees, hips or elbows. Low visibility of a joint is a clue about the setup, not proof the joint is still — lean on the joints and travel paths that ARE visible.
- Match the moving joint and the hand/foot path to the machine:
  seated/reclined, hips fixed, knee bends and straightens, feet at/above hip height, feet travel → leg press (hack squat if standing-ish against a pad with hips travelling along the sled);
  seated, knee straightens from ~90° with the thigh still → leg extension; seated/lying, knee bends from straight → leg curl;
  seated, hips fixed, elbow bends with hands travelling vertically from overhead down to the chin/chest → lat pulldown (hips travelling instead → pull-up);
  seated, hips fixed, hands travelling horizontally at chest height: starts arms-bent and pushes away → chest press; starts arms-straight and pulls in → seated row (pose alone barely separates these; use the start position and say so);
  seated, hands travelling vertically from shoulder height to overhead → seated/machine shoulder press;
  standing, upper arm pinned, elbow straightens with hands below the chest → triceps pushdown; elbow bends → cable curl;
  standing or seated, elbows almost fixed, shoulder angle opens/closes → raises or flys (pec deck/cable fly = fly family).
- The rule guesses are hand-tuned bands that often fail on machines; treat them as hints, not answers.

Reply with ONLY a JSON object, fields in this order:
{"observations": "<≤2 sentences: posture, what moves, what stays fixed, hand/foot path>", "exerciseId": "<library id or null>", "newExercise": null | {"name": "<short common name>", "family": "<family id>", "muscles": ["<up to 4 muscle ids>"]}, "confidence": 0.0-1.0, "reason": "<one sentence quoting the measurements that decided it>"}
Rules: prefer a library id when the movement plausibly matches one — a machine or cable version of a library movement IS that movement (pick the machine/cable variant id if one exists). Choose the parent movement, not a variant, unless the measurements clearly separate them. Use newExercise only when no library entry fits; then set exerciseId to null. Be honest with confidence: static holds, a single partial rep, or a movement two library entries explain equally well deserve ≤0.5."""


def _band(rows, key, unit='°'):
    # Partially occluded joints (machines!) still inform the model: accept 35% coverage and the
    # opposite-side twin, where the rule classifier would drop the joint entirely.
    for k in (key, OTHER.get(key)):
        if k and stat(rows, k, 'p10', .35) is not None:
            key = k
            break
    else:
        return None
    lo, hi, rng = stat(rows, key, 'p10', .35), stat(rows, key, 'p90', .35), stat(rows, key, 'range', .35)
    start = stat(rows, key, 'start', .35)
    fmt = (lambda v: f"{v:.0f}") if unit == '°' else (lambda v: f"{v:.2f}")
    return f"{fmt(lo)}–{fmt(hi)}{unit} (moves {fmt(rng)}{unit}, starts {fmt(start)}{unit})"


def _posture(rows):
    parts = []
    ha, trunk = stat(rows, 'hipAnkle', 'median'), stat(rows, 'trunk', 'median')
    if ha is not None:
        parts.append('standing' if ha > 1.1 else 'seated or kneeling' if ha > .25
                     else 'lying, reclined or in a plank' if ha > -.2 else 'feet at or above hip height (feet on a platform, pad or raised)')
    if trunk is not None:
        lean = stat(rows, 'leanFwd', 'median', .4)
        direction = '' if lean is None or abs(lean) < .15 else ' forward' if lean > 0 else ' backward (reclined)'
        parts.append('torso upright' if trunk < 25 else f'torso leaning{direction or " forward or back"} {trunk:.0f}°' if trunk < 55 else 'torso horizontal')
    wy, wh = stat(rows, 'wristY', 'median'), stat(rows, 'wristHip', 'median')
    if wy is not None:
        parts.append('hands above the shoulders' if wy > .5 else 'hands about shoulder height' if wy > -.4 else 'hands below the shoulders')
    if wh is not None and wh < -.3:
        parts.append('hands below the hips')
    fs = stat(rows, 'footSplit', 'median')
    if fs is not None:
        parts.append('feet split front-to-back' if fs > .8 else 'feet together side-on')
    ka = stat(rows, 'kneeAsym', 'p90')
    if ka is not None and ka > 35:
        parts.append(f'legs move asymmetrically (knee angles differ by up to {ka:.0f}°)')
    return ', '.join(parts)


OTHER = {'knee': 'otherKnee', 'hip': 'otherHip', 'elbow': 'otherElbow', 'shoulder': 'otherShoulder', 'ankle': 'otherAnkle'}


def _visibility(rows):
    """Share of frames each joint angle was measurable on either side — occlusion is itself a clue."""
    if not rows:
        return ''
    shares = {key: sum(r.get(key) is not None or r.get(OTHER[key]) is not None for r in rows) / len(rows)
              for key in ('knee', 'hip', 'elbow', 'shoulder', 'ankle')}
    hidden = [key for key, share in shares.items() if share < .6]
    note = f" — {', '.join(hidden)} often hidden (equipment such as a pad, seat or lever, or out of frame)" if hidden else ''
    return ', '.join(f"{key} {share * 100:.0f}%" for key, share in shares.items()) + note


def _travel(rows):
    """How far the hips, hands and feet move through the frame, in torso lengths."""
    torso = [r['torsoLen'] for r in rows if r.get('torsoLen')]
    if len(torso) < 4:
        return ''
    unit = median(torso)
    parts = []
    for label, key in (('hips', 'hip'), ('hands', 'wrist'), ('feet', 'ankle')):
        xs, ys = stat(rows, f'{key}Px', 'range', .5), stat(rows, f'{key}Py', 'range', .5)
        if xs is None or ys is None:
            continue
        x, y = xs / unit, ys / unit
        if max(x, y) < .15:
            parts.append(f"{label} fixed in place ({max(x, y):.2f})")
        else:
            path = 'mostly vertically' if y > 2 * x else 'mostly horizontally' if x > 2 * y else 'diagonally'
            parts.append(f"{label} travel {path} ({x:.2f} across, {y:.2f} up/down)")
    return '; '.join(parts)


def _ends(rows, key):
    """Where the hands and feet sit at the bent vs the straight end of the most-moving joint."""
    items = [r for r in rows if r.get(key) is not None]
    if len(items) < 8:
        return ''
    ordered = sorted(r[key] for r in items)
    lo, hi = ordered[len(ordered) // 5], ordered[len(ordered) * 4 // 5]
    if hi - lo < 15:
        return ''

    def at(group, feature):
        vals = [r[feature] for r in group if r.get(feature) is not None]
        return median(vals) if len(vals) >= 2 else None

    ends = []
    for label, group in (('bent', [r for r in items if r[key] <= lo]), ('straight', [r for r in items if r[key] >= hi])):
        bits = [f"{name} {v:+.2f}" for name, feature in (('wristY', 'wristY'), ('reach', 'reach'), ('hipAnkle', 'hipAnkle'))
                if (v := at(group, feature)) is not None]
        if bits:
            ends.append(f"{label} {key} ({lo if label == 'bent' else hi:.0f}°): " + ', '.join(bits))
    return '; '.join(ends)


def _most_moving(rows):
    ranges = {k: stat(rows, k, 'range', .8) for k in ANGLE_KEYS + ('trunk',)}
    ranges = {k: v for k, v in ranges.items() if v is not None}
    return max(ranges, key=ranges.get) if ranges else None


def _rhythm(rows, segments_fn):
    """Approximate rep count and tempo from the most-moving joint, using self-derived gates."""
    ranges = {k: stat(rows, k, 'range', .8) for k in ANGLE_KEYS + ('trunk',)}
    ranges = {k: v for k, v in ranges.items() if v is not None}
    if not ranges or max(ranges.values()) < 20:
        return 'Very little joint movement — could be a static hold or the athlete is not yet moving.'
    key = max(ranges, key=ranges.get)
    # Extrema first: a rest-heavy set skews percentiles toward the rest position and the model
    # would be told "0 cycles" while reps clearly happened.
    lo, hi = extrema_envelope(rows, key, 20) or (stat(rows, key, 'p10'), stat(rows, key, 'p90'))
    start = stat(rows, key, 'start')
    if lo is None or hi is None or start is None:
        return 'Movement was too brief or too occluded to judge the rhythm.'
    cycle = 'flex' if start >= (lo + hi) / 2 else 'extend'
    span = hi - lo
    rest = hi - .25 * span if cycle == 'flex' else lo + .25 * span
    work = lo + .4 * span if cycle == 'flex' else hi - .4 * span
    reps = segments_fn(rows, key, rest, work, cycle, .3)
    seconds = round(median((e - s) / 1000 for s, e in reps), 1) if reps else None
    verb = 'bends then straightens' if cycle == 'flex' else 'opens then closes'
    return f"The {key} angle moves most ({ranges[key]:.0f}°), it {verb} each cycle; about {len(reps)} complete cycles seen" + (f", ~{seconds}s each." if seconds else '.')


def describe(cameras, detection, segments_fn):
    """Plain-measurement summary of what the cameras saw. Rounded so repeated calls dedupe well."""
    lines = []
    for camera in cameras:
        rows = camera['rows']
        if len(rows) < 4:
            continue
        seconds = (rows[-1]['t'] - rows[0]['t']) / 1000
        lines.append(f"Camera {camera['id']} ({camera['view']} view, {seconds:.0f}s): {_posture(rows)}.")
        bands = [(k, _band(rows, k)) for k in ('knee', 'hip', 'elbow', 'shoulder', 'ankle', 'trunk')]
        lines.append('  Angles: ' + '; '.join(f"{k} {b}" for k, b in bands if b))
        ratios = [(k, _band(rows, k, '')) for k in ('wristY', 'wristHip', 'hipAnkle', 'reach', 'footSplit')]
        lines.append('  Positions (torso lengths; wristY + above shoulder, wristHip + above hip, hipAnkle standing≈2 lying≈0, reach = hand forward of shoulder): ' + '; '.join(f"{k} {b}" for k, b in ratios if b))
        if travel := _travel(rows):
            lines.append('  Travel through the frame (torso lengths): ' + travel)
        moving = _most_moving(rows)
        if moving and (ends := _ends(rows, moving)):
            lines.append('  At each end of the movement: ' + ends)
        lines.append('  Joint visibility: ' + _visibility(rows))
        lines.append('  Rhythm: ' + _rhythm(rows, segments_fn))
    if detection['candidates']:
        lines.append('Rule-based classifier guesses: ' + ', '.join(f"{c['id']} {c['score']:.2f}" for c in detection['candidates']))
    else:
        lines.append('Rule-based classifier: no library entry scored above its floor.')
    return '\n'.join(lines)


def _spec_posture(spec):
    """Posture a spec expects, read from its signature bands (hipAnkle median / trunk median)."""
    bands = {(key, name): (lo, hi) for key, name, lo, hi, *_ in spec['signature']}
    ha, trunk = bands.get(('hipAnkle', 'median')), bands.get(('trunk', 'median'))
    posture = None
    if ha:
        posture = 'standing' if ha[0] >= 1 else 'seated' if ha[0] >= .2 else 'feet raised/reclined' if ha[1] <= .6 else 'lying'
    if trunk and trunk[0] >= 50:
        posture = f"{posture}, torso horizontal" if posture else 'torso horizontal'
    return posture


def catalog(library):
    """One line per entry so the model knows what each id means, not just its name."""
    lines = []
    for s in library.values():
        if s['variantOf']:
            lines.append(f"{s['id']}: {s['name']} (variant of {s['variantOf']})")
            continue
        # Same wording as the Rhythm line in describe(), so the model can match them directly.
        motion = f"{s['primary']} {'bends then straightens' if s['cycle'] == 'flex' else 'opens then closes'}"
        posture = _spec_posture(s)
        lines.append(f"{s['id']}: {s['name']} — {motion}" + (f", {posture}" if posture else '') + (' [athlete-taught]' if s['custom'] else ''))
    return '\n'.join(lines)


def parse(text):
    text = text.strip()
    if not text.startswith('{'):
        found = re.search(r'\{.*\}', text, re.S)
        text = found.group(0) if found else '{}'
    data = json.loads(text)
    new = data.get('newExercise') if isinstance(data.get('newExercise'), dict) else None
    if new:
        muscles = [m for m in (new.get('muscles') or []) if m in MUSCLE_IDS][:4]
        family = new.get('family') if new.get('family') in FAMILIES else 'custom'
        name = str(new.get('name') or '').strip()[:60]
        new = {'name': name, 'family': family, 'muscles': muscles} if len(name) >= 2 else None
    exercise = data.get('exerciseId')
    try:
        confidence = max(0.0, min(1.0, float(data.get('confidence', 0))))
    except (TypeError, ValueError):
        confidence = 0.0
    return {'exerciseId': exercise if isinstance(exercise, str) and exercise else None, 'newExercise': new,
            'confidence': round(confidence, 2), 'reason': str(data.get('reason') or '')[:300]}


class LlmDetector:
    """Synchronous (runs inside the analysis threadpool). ``None`` means: no opinion, keep the rule result."""

    def __init__(self, api_key, base_url, model, timeout=8.0):
        self.api_key, self.base_url, self.model, self.timeout = api_key, base_url, model, timeout
        self._sessions: dict[str, tuple[float, dict]] = {}

    @property
    def available(self):
        return bool(self.api_key)

    def _cached(self, key, observed):
        now = time.time()
        self._sessions = {k: v for k, v in self._sessions.items() if now - v[0] < SESSION_TTL}
        hit = self._sessions.get(key)
        if not hit:
            return None
        asked, result, seen, stable = hit
        if result['confidence'] >= CONFIDENT:
            # An answer from a short window is re-checked once the set has grown enough to add
            # new evidence; two agreeing confident answers settle it for the session.
            grown = observed >= seen * RECHECK_GROWTH and observed - seen >= RECHECK_MIN_SECONDS
            return result if stable or not grown else None
        return result if now - asked < RETRY_SECONDS else None

    @staticmethod
    def _same(a, b):
        name = lambda r: (r['newExercise'] or {}).get('name', '').lower()
        return a['exerciseId'] == b['exerciseId'] and name(a) == name(b)

    def complete(self, summary, library):
        from openai import APIStatusError, OpenAI
        client = OpenAI(api_key=self.api_key, base_url=self.base_url, timeout=self.timeout,
                        default_headers={'HTTP-Referer': 'https://base44.com', 'X-Title': 'FormFit AI'})
        user = (f"MOVEMENT\n{summary}\n\nLIBRARY\n{catalog(library)}\n\nFAMILIES: {', '.join(FAMILIES)}\nMUSCLES: {', '.join(MUSCLE_IDS)}")
        request = {'model': self.model, 'max_tokens': 450, 'temperature': 0,
                   'messages': [{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}]}
        try:
            try:
                completion = client.chat.completions.create(**request, response_format={'type': 'json_object'})
            except APIStatusError as error:
                if error.status_code != 400:
                    raise
                # Some models reject response_format; the prompt still demands a JSON object.
                completion = client.chat.completions.create(**request)
        finally:
            client.close()
        return parse(completion.choices[0].message.content or '{}')

    def __call__(self, cameras, detection, library, segments_fn, session_key=None):
        if not self.available:
            return None
        observed = max(((c['rows'][-1]['t'] - c['rows'][0]['t']) / 1000 for c in cameras if c['rows']), default=0)
        if session_key:
            cached = self._cached(session_key, observed)
            if cached:
                return cached
        try:
            result = self.complete(describe(cameras, detection, segments_fn), library)
        except Exception as error:  # noqa: BLE001 — the rule result is always a valid fallback
            result = {'exerciseId': None, 'newExercise': None, 'confidence': 0, 'reason': f'unavailable: {type(error).__name__}'}
        if result['exerciseId'] and result['exerciseId'] not in library:
            result = {**result, 'exerciseId': None}
        if session_key:
            previous = self._sessions.get(session_key)
            stable = bool(previous and result['confidence'] >= CONFIDENT and previous[1]['confidence'] >= CONFIDENT
                          and self._same(previous[1], result))
            self._sessions[session_key] = (time.time(), result, observed, stable)
        return result
