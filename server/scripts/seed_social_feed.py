"""Create or refresh 30 deterministic, full-workout social demo posts.

Run from the repository root:
  docker compose -f docker-compose.base44.yml exec api python -m scripts.seed_social_feed

Existing demo posts are updated in place, so reactions/comments survive reruns.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import load_settings
from app.database import make_engine_and_session_factory
from app.orm import ActivityRecord, UserRecord, WorkoutSessionRecord
from app.security import hash_password

ATHLETE_NAMES = [
    "Maya Chen", "Jordan Lee", "Sofia Patel", "Marcus Reed", "Nina Alvarez", "Ethan Brooks",
    "Ava Thompson", "Theo Morgan", "Priya Shah", "Caleb Wright", "Zoe Kim", "Noah Davis",
    "Lena Ortiz", "Miles Carter", "Hannah Park", "Owen Foster", "Ivy Nguyen", "Lucas Bennett",
    "Grace Wilson", "Henry Adams", "Mia Roberts", "Daniel Cooper", "Chloe Martinez", "Ryan Phillips",
    "Ella Turner", "Jack Harris", "Ruby Collins", "Leo Stewart", "Amara Bailey", "Finn Ward",
]

WORKOUTS = [
    ("Lower Body Strength", [("squat", "Back Squat", 8), ("lunge", "Walking Lunge", 16), ("deadlift", "Romanian Deadlift", 10)], "Lower-body session complete — strong positions from the first set to the last."),
    ("Push Day", [("bench", "Bench Press", 10), ("ohp", "Overhead Press", 8), ("bench", "Paused Bench Press", 6)], "Full push workout logged. Tempo stayed controlled across every set."),
    ("Full Body Power", [("deadlift", "Deadlift", 6), ("bench", "Bench Press", 8), ("squat", "Back Squat", 8), ("curl", "Bicep Curl", 12)], "Full-body work done. Kept the quality high without rushing the final sets."),
    ("Posterior Chain", [("deadlift", "Deadlift", 5), ("lunge", "Reverse Lunge", 14), ("deadlift", "Romanian Deadlift", 10)], "Posterior-chain day complete — bracing and bar path felt consistent."),
    ("Upper Body Volume", [("ohp", "Overhead Press", 8), ("bench", "Bench Press", 12), ("curl", "Bicep Curl", 14)], "Upper-body volume finished with clean reps and steady effort."),
]

DEMAND = {
    "squat": {"quads": 95, "glutes": 88, "hip_adductors": 62, "rectus_abdominis": 58},
    "deadlift": {"erector_spinae": 94, "glutes": 84, "hamstrings": 82, "lats": 65, "forearms": 55},
    "bench": {"mid_chest": 95, "lower_chest": 80, "upper_chest": 68, "triceps_lateral": 76, "anterior_delts": 66},
    "ohp": {"anterior_delts": 95, "lateral_delts": 76, "triceps_long": 78, "traps": 54},
    "lunge": {"quads": 88, "glutes": 86, "hamstrings": 58, "hip_adductors": 52, "calves": 48},
    "curl": {"biceps_long": 94, "biceps_short": 86, "brachialis": 70, "forearms": 66},
}

NAMES = {
    "upper_chest": "Upper pectoralis", "mid_chest": "Mid pectoralis", "lower_chest": "Lower pectoralis",
    "anterior_delts": "Anterior deltoids", "lateral_delts": "Lateral deltoids", "triceps_long": "Triceps long head",
    "triceps_lateral": "Triceps lateral head", "biceps_long": "Biceps long head", "biceps_short": "Biceps short head",
    "brachialis": "Brachialis", "forearms": "Forearms", "rectus_abdominis": "Rectus abdominis",
    "lats": "Latissimus dorsi", "traps": "Trapezius", "erector_spinae": "Erector spinae", "glutes": "Gluteus maximus",
    "hip_adductors": "Hip adductors", "quads": "Quadriceps", "hamstrings": "Hamstrings", "calves": "Calves",
}


def aggregate_muscle_load(sets: list[tuple[str, str, int]]) -> dict:
    totals: dict[str, float] = {}
    for exercise_id, _, reps in sets:
        for muscle_id, demand in DEMAND[exercise_id].items():
            totals[muscle_id] = totals.get(muscle_id, 0) + demand * min(1, reps / 10)
    peak = max(totals.values())
    entries = [
        {"id": muscle_id, "name": NAMES[muscle_id], "score": round(total / peak * 100), "role": "primary" if total / peak >= .7 else "secondary"}
        for muscle_id, total in sorted(totals.items(), key=lambda item: item[1], reverse=True)
    ]
    return {"modelVersion": "1.0", "source": "biomechanical-estimate", "confidence": "moderate", "entries": entries, "disclaimer": "Relative workout-wide anatomical demand, normalized across all logged sets. It is not direct EMG, force, or medical assessment."}


async def seed() -> None:
    settings = load_settings()
    engine, session_factory = make_engine_and_session_factory(settings.database_url)
    created = updated = 0
    now = datetime.now(timezone.utc)
    try:
        async with session_factory() as session:
            for index, name in enumerate(ATHLETE_NAMES):
                title, sets, caption = WORKOUTS[index % len(WORKOUTS)]
                email = f"demo-athlete-{index + 1:02d}@formfit.local"
                user = await session.scalar(select(UserRecord).where(UserRecord.email == email))
                if user is None:
                    user = UserRecord(email=email, display_name=name, password_hash=hash_password("demo-athlete"))
                    session.add(user)
                    await session.flush()
                created_at = now - timedelta(minutes=index * 19 + 3)
                activity = await session.scalar(select(ActivityRecord).where(ActivityRecord.user_id == user.id))
                workout = await session.get(WorkoutSessionRecord, activity.session_id) if activity and activity.session_id else None
                total_reps = sum(item[2] for item in sets)
                fields = dict(user_id=user.id, exercise_id="full_workout", exercise_name=f"{title} · {len(sets)} sets", camera_angle="Multiple", duration_seconds=total_reps * 8 + len(sets) * 70, total_reps=total_reps, avg_form_score=86 + index % 12, peak_effort=82 + index % 15, muscle_load=aggregate_muscle_load(sets), reps=[], created_at=created_at)
                if workout is None:
                    workout = WorkoutSessionRecord(**fields)
                    session.add(workout)
                    await session.flush()
                else:
                    for key, value in fields.items():
                        setattr(workout, key, value)
                set_list = " · ".join(f"{exercise_name} {reps}" for _, exercise_name, reps in sets)
                if activity is None:
                    session.add(ActivityRecord(user_id=user.id, session_id=workout.id, caption=f"{caption} {set_list}", visibility="public", created_at=created_at))
                    created += 1
                else:
                    activity.caption = f"{caption} {set_list}"
                    activity.visibility = "public"
                    activity.created_at = created_at
                    updated += 1
            await session.commit()
    finally:
        await engine.dispose()
    print(f"Social demo bot complete: {created} created, {updated} refreshed ({len(ATHLETE_NAMES)} full workouts total).")


if __name__ == "__main__":
    asyncio.run(seed())
