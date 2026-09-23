"""LLM coaching notes — plain-language feedback when the rule checks cannot say much.

The deterministic checks in ``engine`` only fire when the exact joint they need is visible for
most of a rep. Real recordings (a laptop webcam at floor level, a foreshortened arm, a body that
half leaves the frame) often defeat them while still showing an obvious movement. Here we hand a
language model the same measurements the classifier sees — angle bands, posture, rhythm, joint
visibility, the reps we did count and every graded check — together with the exercise the athlete
is doing, and ask for two or three short cues. The model never produces a score; it explains what
the camera saw, what to fix in the movement and, when nothing counted, how to reposition the camera.

Only numbers derived from landmarks are sent. Results are cached per session + rep count so the
live loop asks once per new rep (or once per ten seconds while nothing counts yet).
"""
from __future__ import annotations
import json
import re
import time

SESSION_TTL = 15 * 60
SYSTEM = """You are a concise strength coach reading 2D pose measurements from a phone or laptop camera.
You get: the exercise the athlete is performing, a measurement summary (joint angle ranges in degrees, posture, rhythm, joint visibility), the reps counted so far and any graded form checks with measured values.
Angle conventions: knee/hip/elbow 180 = straight. Shoulder angle = elbow-shoulder-hip (arm at side ~15, horizontal ~90, overhead ~170). Trunk = lean from vertical (0 upright, 90 horizontal). Distances are in torso lengths.
Reply with ONLY a JSON object: {"cues": ["<up to 3 short cues, each one sentence quoting a measurement when possible>"], "camera": "<one sentence on camera placement, or empty string if the view is fine>"}
Rules: be specific and practical. If no reps were counted, say what the measurements suggest (too little range, joint not visible, movement too fast/slow) and how to fix it. Never invent measurements. No scores, no medical claims. Plain language, no markdown."""


def parse(text):
    text = text.strip()
    if not text.startswith('{'):
        found = re.search(r'\{.*\}', text, re.S)
        text = found.group(0) if found else '{}'
    data = json.loads(text)
    cues = [str(c).strip()[:220] for c in (data.get('cues') or []) if str(c).strip()][:3]
    camera = str(data.get('camera') or '').strip()[:220]
    return {'cues': cues, 'camera': camera}


def reps_summary(reps):
    if not reps:
        return 'Reps counted: 0.'
    lines = [f"Reps counted: {len(reps)}."]
    for rep in reps[-5:]:
        checks = '; '.join(f"{c['name']} {c['value']}{'°' if c['units'] == 'degrees' else ' ' + c['units']} (target {c['target']}, {'ok' if c['passed'] else 'missed'})" for c in rep['checks'])
        lines.append(f"  Rep {rep['index']}: {rep['durationSeconds']}s" + (f" — {checks}" if checks else ' — joints not visible enough for graded checks'))
    return '\n'.join(lines)


class LlmCoach:
    """Synchronous (runs inside the analysis threadpool). ``None`` means: no notes, keep the rule result."""

    def __init__(self, api_key, base_url, model, timeout=8.0):
        self.api_key, self.base_url, self.model, self.timeout = api_key, base_url, model, timeout
        self._cache: dict[str, tuple[float, dict]] = {}

    @property
    def available(self):
        return bool(self.api_key)

    def complete(self, exercise_name, summary, reps):
        from openai import OpenAI
        client = OpenAI(api_key=self.api_key, base_url=self.base_url, timeout=self.timeout,
                        default_headers={'HTTP-Referer': 'https://base44.com', 'X-Title': 'FormFit AI'})
        user = f"EXERCISE: {exercise_name}\n\nMEASUREMENTS\n{summary}\n\n{reps_summary(reps)}"
        try:
            completion = client.chat.completions.create(
                model=self.model, max_tokens=260, temperature=0.2,
                messages=[{'role': 'system', 'content': SYSTEM}, {'role': 'user', 'content': user}],
                response_format={'type': 'json_object'})
        finally:
            client.close()
        return parse(completion.choices[0].message.content or '{}')

    def __call__(self, exercise_name, summary, reps, session_key=None, seconds=0):
        if not self.available:
            return None
        now = time.time()
        self._cache = {k: v for k, v in self._cache.items() if now - v[0] < SESSION_TTL}
        key = f"{session_key}|{exercise_name}|{len(reps)}|{int(seconds // 10) if not reps else ''}" if session_key else None
        if key and key in self._cache:
            return self._cache[key][1]
        try:
            result = self.complete(exercise_name, summary, reps)
        except Exception:  # noqa: BLE001 — coaching notes are optional; the rule result stands
            result = None
        if key and result is not None:
            self._cache[key] = (now, result)
        return result
