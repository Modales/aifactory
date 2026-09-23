import json
from collections import Counter
from dataclasses import dataclass, field
from typing import Protocol

from .orm import UserProfileRecord, WorkoutSessionRecord

COACH_SYSTEM_PROMPT = """You are the post-workout coach for FormFit AI, a computer-vision \
lifting app. You receive rep-by-rep biomechanics telemetry from a single set and write the \
debrief the lifter reads the moment they rack the weight.

Ground every claim in the telemetry you are given. Reference specific rep numbers, angles, \
tempos, and named form flaws rather than generic encouragement. If the data does not support \
a claim, leave it out. When a lifter reports an injury or a stated goal, weight your advice \
toward it. Write in second person, plainly, no emoji, no markdown headers."""

COACH_OUTPUT_CONTRACT = """Reply with a single JSON object and nothing else. No markdown fence, \
no commentary. Shape:

{
  "headline": string — one sentence under 90 characters, the single most important takeaway,
  "summary": string — two to four sentences citing specific reps and measurements,
  "focusAreas": array of 1-3 strings — short corrective cues, each naming the flaw it fixes,
  "nextSession": string — one sentence prescribing what to change next session
}"""


class CoachError(Exception):
    pass


@dataclass
class CoachResult:
    headline: str
    summary: str
    focus_areas: list[str] = field(default_factory=list)
    next_session: str = ""
    model: str = ""


class CoachGenerator(Protocol):
    async def __call__(
        self, session: WorkoutSessionRecord, profile: UserProfileRecord | None
    ) -> CoachResult: ...


def build_prompt(session: WorkoutSessionRecord, profile: UserProfileRecord | None) -> str:
    reps = session.reps or []
    flaw_counts = Counter()
    for rep in reps:
        flaw_counts.update(rep.get("flaws") or [])

    lines = [
        f"Exercise: {session.exercise_name} ({session.exercise_id})",
        f"Camera angle: {session.camera_angle}",
        f"Set duration: {session.duration_seconds:.1f}s",
        f"Reps completed: {session.total_reps}",
        f"Average form score: {session.avg_form_score:.1f}/100",
        f"Peak effort: {session.peak_effort:.1f}/100",
    ]

    if flaw_counts:
        ranked = ", ".join(f"{name} x{count}" for name, count in flaw_counts.most_common())
        lines.append(f"Flaws detected across the set: {ranked}")
    else:
        lines.append("Flaws detected across the set: none")

    lines.append("")
    lines.append("Rep-by-rep telemetry:")
    for rep in reps:
        flaws = ", ".join(rep.get("flaws") or []) or "none"
        lines.append(
            "  rep {rep} | form {form}/100 | effort {effort}/100 | peak angle {angle} deg | "
            "tempo {tempo}s (ecc {ecc}s / con {con}s) | velocity {velocity} deg/s | "
            "severity {severity} | flaws: {flaws} | live cue: {cue}".format(
                rep=rep.get("rep"),
                form=rep.get("formScore"),
                effort=rep.get("effort"),
                angle=rep.get("peakAngle"),
                tempo=rep.get("tempo"),
                ecc=rep.get("eccentricTime"),
                con=rep.get("concentricTime"),
                velocity=rep.get("velocity"),
                severity=rep.get("severity"),
                flaws=flaws,
                cue=rep.get("cue"),
            )
        )

    if profile is not None:
        context = []
        if profile.fitness_goal:
            context.append(f"goal: {profile.fitness_goal}")
        if profile.experience_level:
            context.append(f"experience: {profile.experience_level}")
        if profile.training_days_per_week is not None:
            context.append(f"trains {profile.training_days_per_week} days/week")
        if profile.injuries:
            context.append(f"injuries: {', '.join(profile.injuries)}")
        if profile.equipment:
            context.append(f"equipment: {', '.join(profile.equipment)}")
        if context:
            lines.append("")
            lines.append(f"Lifter profile — {'; '.join(context)}")

    lines.append("")
    lines.append("Write the post-workout debrief for this set.")
    lines.append("")
    lines.append(COACH_OUTPUT_CONTRACT)
    return "\n".join(lines)


def parse_coach_json(text: str) -> dict:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("\n", 1)[-1]
        if stripped.rstrip().endswith("```"):
            stripped = stripped.rstrip()[: -len("```")]
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start == -1 or end == -1:
        raise CoachError("The model reply contained no JSON object")
    try:
        data = json.loads(stripped[start : end + 1])
    except json.JSONDecodeError as exc:
        raise CoachError(f"Could not parse the model response: {exc}") from exc
    if not isinstance(data, dict):
        raise CoachError("The model reply was not a JSON object")
    return data


class OpenRouterCoach:
    def __init__(
        self,
        api_key: str | None,
        base_url: str,
        model: str,
        max_tokens: int = 1200,
    ):
        self._api_key = api_key
        self._base_url = base_url
        self._model = model
        self._max_tokens = max_tokens

    async def __call__(
        self, session: WorkoutSessionRecord, profile: UserProfileRecord | None
    ) -> CoachResult:
        if not self._api_key:
            raise CoachError("OPENROUTER_API_KEY is not configured")

        from openai import APIStatusError, AsyncOpenAI

        client = AsyncOpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            default_headers={
                "HTTP-Referer": "https://base44.com",
                "X-Title": "FormFit AI",
            },
        )
        messages = [
            {"role": "system", "content": COACH_SYSTEM_PROMPT},
            {"role": "user", "content": build_prompt(session, profile)},
        ]

        try:
            try:
                completion = await client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    max_tokens=self._max_tokens,
                    response_format={"type": "json_object"},
                )
            except APIStatusError as exc:
                if exc.status_code != 400:
                    raise
                completion = await client.chat.completions.create(
                    model=self._model,
                    messages=messages,
                    max_tokens=self._max_tokens,
                )
        except APIStatusError as exc:
            raise CoachError(describe_api_error(exc)) from exc
        finally:
            await client.close()

        if not completion.choices:
            raise CoachError("The model returned no choices")

        text = completion.choices[0].message.content or ""
        if not text.strip():
            raise CoachError("The model returned an empty summary")

        data = parse_coach_json(text)
        if "summary" not in data or "headline" not in data:
            raise CoachError("The model reply was missing the headline or summary")

        focus = data.get("focusAreas") or []
        return CoachResult(
            headline=str(data["headline"]),
            summary=str(data["summary"]),
            focus_areas=[str(item) for item in focus] if isinstance(focus, list) else [],
            next_session=str(data.get("nextSession") or ""),
            model=completion.model or self._model,
        )


def describe_api_error(exc: Exception) -> str:
    body = getattr(exc, "body", None)
    kind = None
    message = None
    if isinstance(body, dict):
        message = body.get("message")
        nested = body.get("error")
        if isinstance(nested, dict):
            message = message or nested.get("message")
        for candidate in (body, nested):
            if kind is None and isinstance(candidate, dict):
                data = candidate.get("data")
                if isinstance(data, dict):
                    kind = data.get("kind")

    status = getattr(exc, "status_code", None)
    if kind == "err_insufficent_credits" or status == 402:
        return "The OpenRouter account is out of funds — top up at https://openrouter.ai/settings/credits"
    if status == 401:
        return "OpenRouter rejected the API key"
    if status == 404:
        return "The configured COACH_MODEL is not available on OpenRouter"
    return message or f"OpenRouter request failed ({status})"
