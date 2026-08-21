from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field


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


class MuscleLoadEntry(BaseModel):
    id: str
    name: str
    score: int = Field(ge=0, le=100)
    role: Literal["primary", "secondary"]


class MuscleLoadSummary(BaseModel):
    modelVersion: str
    source: Literal["biomechanical-estimate"]
    confidence: Literal["moderate", "low"]
    entries: list[MuscleLoadEntry]
    disclaimer: str


class EndSessionPayload(BaseModel):
    exerciseId: str
    exerciseName: str
    cameraAngle: str
    durationSeconds: float
    totalReps: int
    avgFormScore: float
    peakEffort: float
    muscleLoad: MuscleLoadSummary = Field(
        default_factory=lambda: MuscleLoadSummary(
            modelVersion="1.0",
            source="biomechanical-estimate",
            confidence="low",
            entries=[],
            disclaimer=(
                "Estimated training demand from confirmed exercise, observed joint motion, "
                "rep volume, and form—not a direct EMG or muscle-force measurement."
            ),
        )
    )
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
    muscleLoad: MuscleLoadSummary
    reps: list[RepData]
    createdAt: datetime


class SignupPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    displayName: str = Field(min_length=1, max_length=120)


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class PublicUser(BaseModel):
    id: str
    email: EmailStr
    displayName: str
    createdAt: datetime


class AuthToken(BaseModel):
    accessToken: str
    tokenType: Literal["bearer"] = "bearer"
    expiresInMinutes: int
    user: PublicUser


class ProfilePayload(BaseModel):
    fitnessGoal: str | None = Field(default=None, max_length=80)
    experienceLevel: Literal["Beginner", "Intermediate", "Advanced"] | None = None
    age: int | None = Field(default=None, ge=13, le=120)
    heightCm: float | None = Field(default=None, gt=0, le=280)
    weightKg: float | None = Field(default=None, gt=0, le=500)
    trainingDaysPerWeek: int | None = Field(default=None, ge=0, le=7)
    primaryExercises: list[str] = []
    injuries: list[str] = []
    equipment: list[str] = []
    onboardingAnswers: dict[str, Any] = {}
    onboardingCompleted: bool = False


class UserProfile(ProfilePayload):
    userId: str
    updatedAt: datetime


class HistoryItem(BaseModel):
    id: str
    exerciseId: str
    exerciseName: str
    cameraAngle: str
    durationSeconds: float
    totalReps: int
    avgFormScore: float
    peakEffort: float
    muscleLoad: MuscleLoadSummary
    createdAt: datetime


class HistoryPage(BaseModel):
    items: list[HistoryItem]
    total: int
    limit: int
    offset: int


class TelemetryLog(BaseModel):
    sessionId: str
    exerciseId: str
    exerciseName: str
    recordedAt: datetime
    muscleLoad: MuscleLoadSummary
    reps: list[RepData]
    flawCounts: dict[str, int]


class ExerciseBreakdown(BaseModel):
    exerciseId: str
    exerciseName: str
    sessions: int
    totalReps: int
    avgFormScore: float
    bestFormScore: float


class HistoryStats(BaseModel):
    totalSessions: int
    totalReps: int
    totalDurationSeconds: float
    avgFormScore: float
    peakEffort: float
    topFlaws: list[tuple[str, int]]
    byExercise: list[ExerciseBreakdown]
    lastSessionAt: datetime | None


class FollowStatus(BaseModel):
    userId: str
    following: bool


class ActivityCreatePayload(BaseModel):
    sessionId: str | None = None
    caption: str = Field(default="", max_length=2000)
    visibility: Literal["public", "followers"] = "followers"


class ActivityAuthor(BaseModel):
    id: str
    displayName: str


class ActivityWorkout(BaseModel):
    exerciseId: str
    exerciseName: str
    totalReps: int
    durationSeconds: float
    avgFormScore: float
    muscleLoad: MuscleLoadSummary


class ActivityComment(BaseModel):
    id: str
    author: ActivityAuthor
    body: str
    createdAt: datetime


class Activity(BaseModel):
    id: str
    author: ActivityAuthor
    caption: str
    visibility: Literal["public", "followers"]
    workout: ActivityWorkout | None
    reactionCount: int
    commentCount: int
    reactedByMe: bool
    createdAt: datetime


class ActivityFeed(BaseModel):
    items: list[Activity]
    limit: int
    offset: int


class ClubCreatePayload(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str = Field(default="", max_length=2000)
    isPrivate: bool = False


class Club(BaseModel):
    id: str
    name: str
    description: str
    isPrivate: bool
    memberCount: int
    joined: bool
    createdAt: datetime


class ChallengeCreatePayload(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=2000)
    metric: Literal["reps", "sessions", "durationSeconds"]
    startsAt: datetime
    endsAt: datetime
    clubId: str | None = None


class Challenge(BaseModel):
    id: str
    name: str
    description: str
    metric: Literal["reps", "sessions", "durationSeconds"]
    startsAt: datetime
    endsAt: datetime
    participantCount: int
    joined: bool


class ChallengeLeaderboardEntry(BaseModel):
    rank: int
    athlete: ActivityAuthor
    value: float


class ChallengeLeaderboard(BaseModel):
    challenge: Challenge
    entries: list[ChallengeLeaderboardEntry]


class GenerateSummaryPayload(BaseModel):
    sessionId: str


class CoachSummary(BaseModel):
    jobId: str
    sessionId: str
    status: Literal["pending", "running", "complete", "failed"]
    model: str | None = None
    headline: str | None = None
    summary: str | None = None
    focusAreas: list[str] = []
    nextSession: str | None = None
    error: str | None = None
    createdAt: datetime
    completedAt: datetime | None = None
