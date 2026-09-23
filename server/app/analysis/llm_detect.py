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
SESSION_TTL = 15 * 60
SYSTEM = """You identify resistance and bodyweight exercises from 2D pose measurements captured by a phone camera.
You receive: a compact description of the movement (joint angle ranges in degrees, posture, rhythm), guesses from a rule-based classifier with scores, and the exercise library (id: name).
Angle conventions: knee/hip/elbow 180 = straight. Shoulder angle = elbow-shoulder-hip (arm at side ~15, horizontal ~90, overhead ~170). Trunk = lean from vertical (0 upright, 90 horizontal). Distances are in torso lengths.
Reply with ONLY a JSON object:
{"exerciseId": "<library id or null>", "newExercise": null | {"name": "<short common name>", "family": "<family id>", "muscles": ["<up to 4 muscle ids>"]}, "confidence": 0.0-1.0, "reason": "<one sentence quoting the measurements that decided it>"}
Rules: prefer a library id when the movement plausibly matches one (the athlete can refine the variant). Choose the parent movement, not a variant, unless the measurements clearly separate them. Use newExercise only when no library entry fits; then set exerciseId to null. Be honest with confidence — the rule guesses may be wrong. Static holds and ambiguous partial movement deserve low confidence."""


def _band(rows, key, unit='°'):
    lo, hi, rng = stat(rows, key, 'p10'), stat(rows, key, 'p90'), stat(rows, key, 'range')
    if lo is None:
        return None
    start = stat(rows, key, 'start')
    fmt = (lambda v: f"{v:.0f}") if unit == '°' else (lambda v: f"{v:.2f}")
    return f"{fmt(lo)}–{fmt(hi)}{unit} (moves {fmt(rng)}{unit}, starts {fmt(start)}{unit})"


def _posture(rows):
    parts = []
    ha, trunk = stat(rows, 'hipAnkle', 'median'), stat(rows, 'trunk', 'median')
    if ha is not None:
        parts.append('standing' if ha > 1.1 else 'seated or kneeling' if ha > .25 else 'lying or in a plank / on the floor')
    if trunk is not None:
        parts.append('torso upright' if trunk < 25 else 'torso hinged forward' if trunk < 55 else 'torso horizontal')
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
        lines.append('  Rhythm: ' + _rhythm(rows, segments_fn))
    if detection['candidates']:
        lines.append('Rule-based classifier guesses: ' + ', '.join(f"{c['id']} {c['score']:.2f}" for c in detection['candidates']))
    else:
        lines.append('Rule-based classifier: no library entry scored above its floor.')
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

    def _cached(self, key):
        now = time.time()
        self._sessions = {k: v for k, v in self._sessions.items() if now - v[0] < SESSION_TTL}
        hit = self._sessions.get(key)
        if not hit:
            return None
        asked, result = hit
        if result['confidence'] >= CONFIDENT or now - asked < RETRY_SECONDS:
            return result
        return None

    def complete(self, summary, library):
        from openai import APIStatusError, OpenAI
        client = OpenAI(api_key=self.api_key, base_url=self.base_url, timeout=self.timeout,
                        default_headers={'HTTP-Referer': 'https://base44.com', 'X-Title': 'FormFit AI'})
        catalog = '\n'.join(f"{s['id']}: {s['name']}" + (f" (variant of {s['variantOf']})" if s['variantOf'] else '') + (' [athlete-taught]' if s['custom'] else '')
                            for s in library.values())
        user = (f"MOVEMENT\n{summary}\n\nLIBRARY\n{catalog}\n\nFAMILIES: {', '.join(FAMILIES)}\nMUSCLES: {', '.join(MUSCLE_IDS)}")
        request = {'model': self.model, 'max_tokens': 300, 'temperature': 0,
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
        if session_key:
            cached = self._cached(session_key)
            if cached:
                return cached
        try:
            result = self.complete(describe(cameras, detection, segments_fn), library)
        except Exception as error:  # noqa: BLE001 — the rule result is always a valid fallback
            result = {'exerciseId': None, 'newExercise': None, 'confidence': 0, 'reason': f'unavailable: {type(error).__name__}'}
        if result['exerciseId'] and result['exerciseId'] not in library:
            result = {**result, 'exerciseId': None}
        if session_key:
            self._sessions[session_key] = (time.time(), result)
        return result
