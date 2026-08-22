"""Populate the development social feed with deterministic demo athlete activity.

Run from the repository root:
  docker compose -f docker-compose.base44.yml exec api python -m scripts.seed_social_feed

The script is idempotent: each demo athlete owns one public post, so it is safe to run again.
"""

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.config import load_settings
from app.database import make_engine_and_session_factory
from app.orm import ActivityRecord, UserRecord, WorkoutSessionRecord
from app.security import hash_password

ATHLETES = [
    ("Maya Chen", "Back Squat", "squat", 8, 94, "Dialed in depth today. Building confidence under the bar."),
    ("Jordan Lee", "Deadlift", "deadlift", 6, 91, "Smooth pulls. Resetting between reps made all the difference."),
    ("Sofia Patel", "Bench Press", "bench", 10, 96, "Bench volume before work — clean tempo all set."),
    ("Marcus Reed", "Overhead Press", "press", 7, 89, "Kept the ribs down and the lockout strong."),
    ("Nina Alvarez", "Walking Lunge", "lunge", 16, 93, "Leg day finished with controlled lunges on both sides."),
    ("Ethan Brooks", "Bicep Curl", "curl", 12, 97, "No swinging, just patient reps."),
    ("Ava Thompson", "Back Squat", "squat", 5, 90, "A lighter day to groove the pattern."),
    ("Theo Morgan", "Deadlift", "deadlift", 4, 95, "Heavy doubles moved better than expected."),
    ("Priya Shah", "Bench Press", "bench", 9, 92, "Working on a consistent touch point."),
    ("Caleb Wright", "Overhead Press", "press", 8, 88, "Pressing felt honest today. One more week of this block."),
    ("Zoe Kim", "Walking Lunge", "lunge", 20, 94, "Long stride, steady pace, no shortcuts."),
    ("Noah Davis", "Bicep Curl", "curl", 14, 91, "Finisher was spicy, form stayed tidy."),
    ("Lena Ortiz", "Back Squat", "squat", 6, 98, "Best squat session of the month. Small wins add up."),
    ("Miles Carter", "Deadlift", "deadlift", 5, 87, "Technique first today. The bar stayed close."),
    ("Hannah Park", "Bench Press", "bench", 11, 95, "Back-off sets done. Really happy with the control."),
    ("Owen Foster", "Overhead Press", "press", 6, 90, "Strict press and a little patience."),
    ("Ivy Nguyen", "Walking Lunge", "lunge", 18, 96, "Unilateral work is paying off."),
    ("Lucas Bennett", "Bicep Curl", "curl", 15, 93, "Chasing a pump without losing the elbow position."),
    ("Grace Wilson", "Back Squat", "squat", 10, 92, "Ten quality reps. Calling that a good day."),
    ("Henry Adams", "Deadlift", "deadlift", 3, 99, "Three crisp reps and out. Save something for next week."),
    ("Mia Roberts", "Bench Press", "bench", 8, 94, "Paused every rep and stayed patient off the chest."),
    ("Daniel Cooper", "Overhead Press", "press", 9, 86, "Fighting for every rep, but the bar path held."),
    ("Chloe Martinez", "Walking Lunge", "lunge", 22, 91, "A little more range each set."),
    ("Ryan Phillips", "Bicep Curl", "curl", 10, 95, "Quick arm session, high-quality contractions."),
    ("Ella Turner", "Back Squat", "squat", 7, 93, "Found a better brace cue today."),
    ("Jack Harris", "Deadlift", "deadlift", 7, 90, "Volume pulls with zero rushed reps."),
    ("Ruby Collins", "Bench Press", "bench", 12, 89, "Last few reps slowed down, form stayed intact."),
    ("Leo Stewart", "Overhead Press", "press", 5, 97, "Press felt snappy. Great way to start the weekend."),
    ("Amara Bailey", "Walking Lunge", "lunge", 14, 92, "Mobility work is making these feel much smoother."),
    ("Finn Ward", "Bicep Curl", "curl", 13, 94, "Controlled eccentrics for the whole set."),
]


def muscle_load(exercise_id: str, reps: int) -> dict:
    primary = {
        "squat": ("quads", "Quadriceps"),
        "deadlift": ("glutes", "Glutes"),
        "bench": ("chest", "Chest"),
        "press": ("front_delts", "Front delts"),
        "lunge": ("quads", "Quadriceps"),
        "curl": ("biceps", "Biceps"),
    }[exercise_id]
    return {
        "modelVersion": "1.0",
        "source": "biomechanical-estimate",
        "confidence": "moderate",
        "entries": [{"id": primary[0], "name": primary[1], "score": min(100, 45 + reps * 3), "role": "primary"}],
        "disclaimer": "Estimated training demand from confirmed exercise and rep volume.",
    }


async def seed() -> None:
    settings = load_settings()
    engine, session_factory = make_engine_and_session_factory(settings.database_url)
    created = 0
    now = datetime.now(timezone.utc)

    try:
        async with session_factory() as session:
            for index, (name, exercise_name, exercise_id, reps, score, caption) in enumerate(ATHLETES):
                email = f"demo-athlete-{index + 1:02d}@formfit.local"
                user = await session.scalar(select(UserRecord).where(UserRecord.email == email))
                if user is None:
                    user = UserRecord(email=email, display_name=name, password_hash=hash_password("demo-athlete"))
                    session.add(user)
                    await session.flush()

                existing = await session.scalar(select(ActivityRecord).where(ActivityRecord.user_id == user.id))
                if existing is not None:
                    continue

                created_at = now - timedelta(minutes=index * 19 + 3)
                workout = WorkoutSessionRecord(
                    user_id=user.id,
                    exercise_id=exercise_id,
                    exercise_name=exercise_name,
                    camera_angle="Side",
                    duration_seconds=110 + reps * 9,
                    total_reps=reps,
                    avg_form_score=score,
                    peak_effort=min(99, 62 + reps * 2),
                    muscle_load=muscle_load(exercise_id, reps),
                    reps=[],
                    created_at=created_at,
                )
                session.add(workout)
                await session.flush()
                session.add(ActivityRecord(
                    user_id=user.id,
                    session_id=workout.id,
                    caption=caption,
                    visibility="public",
                    created_at=created_at,
                ))
                created += 1

            await session.commit()
    finally:
        await engine.dispose()

    print(f"Social demo bot complete: created {created} public workout posts ({len(ATHLETES)} athletes total).")


if __name__ == "__main__":
    asyncio.run(seed())
