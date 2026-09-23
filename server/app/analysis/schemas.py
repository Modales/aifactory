"""Versioned, bounded landmark contract. Raw video never leaves the device — only landmarks plus a
few downscaled stills that the detection model looks at and that are never stored."""
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

View = Literal['auto', 'side', 'frontal', 'oblique']
Snapshot = Annotated[str, StringConstraints(max_length=300_000, pattern=r'^data:image/(jpeg|webp);base64,[A-Za-z0-9+/=]+$')]


class Landmark(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    # MediaPipe places off-frame joints well outside the image; features.py only trusts 0–1 anyway.
    x: float = Field(ge=-50, le=50)
    y: float = Field(ge=-50, le=50)
    visibility: float = Field(default=0, ge=0, le=1)


class Frame(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    timestampMs: float = Field(ge=0, le=3_600_000)
    landmarks: list[Landmark] = Field(min_length=33, max_length=33)


class CameraStream(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    cameraId: str = Field(min_length=1, max_length=80)
    view: View = 'auto'
    aspectRatio: float = Field(gt=0.1, le=10)
    # Common timeline = clip timestamp + offset; required calibration for separate clips.
    offsetMs: float = Field(default=0, ge=-3_600_000, le=3_600_000)
    frames: list[Frame] = Field(min_length=1, max_length=2700)
    # Camera stills spread across the set, so the detection model can see the equipment.
    snapshots: list[Snapshot] = Field(default_factory=list, max_length=4)

    @model_validator(mode='after')
    def increasing_time(self):
        if any(b.timestampMs <= a.timestampMs for a, b in zip(self.frames, self.frames[1:])):
            raise ValueError('Frame timestamps must strictly increase per camera')
        return self


class AnalysisRequest(BaseModel):
    streams: list[CameraStream] = Field(min_length=1, max_length=3)
    # Any library id, including this user's taught exercises; validated against the library at evaluation time.
    confirmedExercise: str | None = Field(default=None, min_length=1, max_length=80)
    persist: bool = False
    synchronized: bool = False
    # Stable per-recording key so the LLM second opinion is asked once per set, not on every live tick.
    sessionKey: str | None = Field(default=None, min_length=1, max_length=80)

    @model_validator(mode='after')
    def unique_cameras(self):
        if len({s.cameraId for s in self.streams}) != len(self.streams):
            raise ValueError('Camera identifiers must be unique')
        if len(self.streams) > 1 and not self.synchronized:
            raise ValueError('Confirm that cameras show the same athlete and offsets align the same movement')
        return self


class TeachExerciseRequest(BaseModel):
    """Teach a new exercise from one recorded set. The spec is derived from the athlete's own reps."""
    name: str = Field(min_length=2, max_length=60)
    muscles: list[str] = Field(default_factory=list, max_length=6)
    family: str | None = Field(default=None, max_length=40)
    streams: list[CameraStream] = Field(min_length=1, max_length=3)
    synchronized: bool = False


class CalibrationConsentRequest(BaseModel):
    accepted: bool
