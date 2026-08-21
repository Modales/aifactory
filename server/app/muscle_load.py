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
