from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class RepData(BaseModel):
    rep: int
    tempo: float
    concentricTime: float
    eccentricTime: float
    peakAngle: float
    velocity: float
    formScore: float
    effort: float
    cue: str
    severity: Literal["good", "warn", "crit"]
    flaws: list[str] = []


class EndSessionPayload(BaseModel):
    exerciseId: str
    exerciseName: str
    cameraAngle: str
    durationSeconds: float
    totalReps: int
    avgFormScore: float
    peakEffort: float
    reps: list[RepData]


class SessionCreated(BaseModel):
    id: str
    createdAt: datetime


class WorkoutSummary(BaseModel):
    id: str
    exerciseId: str
    exerciseName: str
    cameraAngle: str
    durationSeconds: float
    totalReps: int
    avgFormScore: float
    peakEffort: float
    reps: list[RepData]
    createdAt: datetime
