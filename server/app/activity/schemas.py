"""API contract for the activity endpoints. Field naming follows the app's camelCase style."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..analysis.schemas import CameraStream
from ..schemas import MuscleLoadSummary, RepData

Visibility = Literal['public', 'followers', 'private']


class RecordActivityPayload(BaseModel):
    """One recorded set. The pipeline detects the exercise unless the athlete confirmed one."""
    streams: list[CameraStream] = Field(min_length=1, max_length=3)
    confirmedExercise: str | None = Field(default=None, min_length=1, max_length=80)
    sessionKey: str | None = Field(default=None, min_length=1, max_length=80)
    synchronized: bool = False
    workoutId: str | None = Field(default=None, max_length=80)
    caption: str = Field(default='', max_length=2000)
    # 'private' keeps the set out of every feed; anything else is shared like a Strava activity.
    visibility: Visibility = 'followers'


class FocusArea(BaseModel):
    name: str
    failedReps: int
    totalReps: int
    average: float
    units: str
    target: str
    passed: bool
    cue: str


class ActivityCoach(BaseModel):
    status: str
    model: str | None = None
    headline: str | None = None
    summary: str | None = None
    focusAreas: list[str] = []
    nextSession: str | None = None


class ActivityDetail(BaseModel):
    """The full activity page: processed result, legacy telemetry shape, social fields, coach."""
    id: str
    status: str                      # engine status: 'scored' activities are the only ones saved
    exerciseId: str
    exerciseName: str
    family: str | None
    familyName: str | None
    confidence: float
    selectionSource: str             # detected | llm | confirmed
    repCount: int
    score: float
    durationSeconds: float
    headline: str
    focus: list[FocusArea]
    warnings: list[str]
    notAssessed: list[str]
    disclaimer: str
    muscleLoad: MuscleLoadSummary
    reps: list[RepData]
    analysisId: str
    workoutId: str | None
    caption: str
    visibility: Visibility
    reactionCount: int
    commentCount: int
    coach: ActivityCoach | None
    createdAt: datetime


class ActivityListItem(BaseModel):
    """One row in the athlete's training log."""
    id: str
    exerciseId: str
    exerciseName: str
    status: str
    repCount: int
    score: float
    durationSeconds: float
    muscleLoad: MuscleLoadSummary
    caption: str
    visibility: Visibility
    reactionCount: int
    commentCount: int
    createdAt: datetime


class ActivityLogPage(BaseModel):
    items: list[ActivityListItem]
    total: int
    limit: int
    offset: int
