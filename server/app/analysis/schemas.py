"""Versioned, bounded landmark contract. Raw video never leaves the device."""
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

Exercise = Literal['squat', 'deadlift', 'bench', 'ohp', 'curl', 'lunge']
View = Literal['auto', 'side', 'frontal', 'oblique']


class Landmark(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    x: float = Field(ge=-2, le=3)
    y: float = Field(ge=-2, le=3)
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
    frames: list[Frame] = Field(min_length=1, max_length=1800)

    @model_validator(mode='after')
    def increasing_time(self):
        if any(b.timestampMs <= a.timestampMs for a, b in zip(self.frames, self.frames[1:])):
            raise ValueError('Frame timestamps must strictly increase per camera')
        return self


class AnalysisRequest(BaseModel):
    streams: list[CameraStream] = Field(min_length=1, max_length=3)
    confirmedExercise: Exercise | None = None
    persist: bool = False
    synchronized: bool = False

    @model_validator(mode='after')
    def unique_cameras(self):
        if len({s.cameraId for s in self.streams}) != len(self.streams):
            raise ValueError('Camera identifiers must be unique')
        if len(self.streams) > 1 and not self.synchronized:
            raise ValueError('Confirm that cameras show the same athlete and offsets align the same movement')
        return self
