from typing import Any


DISCLAIMER = (
    "Estimated training demand from confirmed exercise, observed joint motion, rep volume, "
    "and form—not a direct EMG or muscle-force measurement."
)


def normalize_muscle_load(value: Any) -> dict[str, Any]:
    """Keeps historical rows valid after muscle-load logging was introduced."""
    if isinstance(value, dict) and value.get("source") == "biomechanical-estimate":
        return value
    return {
        "modelVersion": "1.0",
        "source": "biomechanical-estimate",
        "confidence": "low",
        "entries": [],
        "disclaimer": DISCLAIMER,
    }


NAMES = {
    "upper_chest": "Upper pectoralis", "mid_chest": "Mid pectoralis", "lower_chest": "Lower pectoralis",
    "anterior_delts": "Anterior deltoids", "lateral_delts": "Lateral deltoids", "rear_delts": "Rear deltoids",
    "triceps_long": "Triceps long head", "triceps_lateral": "Triceps lateral head",
    "biceps_long": "Biceps long head", "biceps_short": "Biceps short head", "brachialis": "Brachialis", "forearms": "Forearms",
    "rectus_abdominis": "Rectus abdominis", "obliques": "Obliques", "transverse_abdominis": "Deep core",
    "lats": "Latissimus dorsi", "traps": "Trapezius", "erector_spinae": "Erector spinae",
    "glutes": "Gluteus maximus", "hip_adductors": "Hip adductors", "quads": "Quadriceps", "hamstrings": "Hamstrings", "calves": "Calves",
}

# Mirrors src/lib/muscleModel.ts so analysis-derived workouts light up the anatomy heatmap.
EXERCISE_DEMAND = {
    "squat": {"quads": 95, "glutes": 88, "hip_adductors": 62, "rectus_abdominis": 58, "obliques": 55, "erector_spinae": 58, "hamstrings": 48, "calves": 35},
    "deadlift": {"erector_spinae": 94, "glutes": 84, "hamstrings": 82, "lats": 65, "traps": 62, "quads": 58, "forearms": 55, "rectus_abdominis": 54, "obliques": 54},
    "bench": {"mid_chest": 95, "lower_chest": 80, "upper_chest": 68, "triceps_lateral": 76, "triceps_long": 72, "anterior_delts": 66, "lats": 28},
    "ohp": {"anterior_delts": 95, "lateral_delts": 76, "triceps_long": 78, "triceps_lateral": 70, "upper_chest": 38, "traps": 54, "rectus_abdominis": 54, "obliques": 52},
    "curl": {"biceps_long": 94, "biceps_short": 86, "brachialis": 70, "forearms": 66, "anterior_delts": 18},
    "lunge": {"quads": 88, "glutes": 86, "hamstrings": 58, "hip_adductors": 52, "calves": 48, "rectus_abdominis": 46, "obliques": 46},
}


def _clamp(value: float, low: float = 0, high: float = 100) -> float:
    return max(low, min(high, value))


def estimate_muscle_load(exercise: str, reps: list[dict]) -> dict[str, Any]:
    """Anatomical demand prior scaled by observed volume, form, tempo and range — not EMG or force."""
    demand = EXERCISE_DEMAND.get(exercise, {})
    scored = [r for r in reps if r.get("score") is not None]
    if not scored or not demand:
        return normalize_muscle_load(None)
    mean = lambda values: sum(values) / len(values)
    form = _clamp(mean([r["score"] for r in scored]) / 100, .55, 1)
    volume = _clamp(len(scored) / 10, 0, 1)
    tempo = _clamp(mean([r["durationSeconds"] for r in scored]) / 3, .55, 1)
    range_checks = [c["score"] for r in scored for c in r["checks"] if c["name"].endswith(("depth", "range", "position", "hinge depth"))]
    rom = _clamp(mean(range_checks) / 100, .55, 1) if range_checks else .8
    exposure = _clamp(.25 + volume * .35 + form * .2 + tempo * .1 + rom * .1, 0, 1)
    entries = sorted(({"id": key, "name": NAMES[key], "score": round(_clamp(base * exposure)), "role": "primary" if base >= 70 else "secondary"}
                      for key, base in demand.items()), key=lambda e: -e["score"])
    return {"modelVersion": "1.0", "source": "biomechanical-estimate", "confidence": "moderate" if len(scored) >= 3 else "low",
            "entries": entries, "disclaimer": DISCLAIMER}
