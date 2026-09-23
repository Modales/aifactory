from collections import Counter
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..muscle_load import normalize_muscle_load
from ..orm import AnalysisRecord, UserRecord, WorkoutSessionRecord
from ..schemas import (
    HistoryItem,
    HistoryPage,
    HistoryStats,
    TelemetryLog,
    WorkoutSummary,
)

router = APIRouter(prefix="/api/workouts", tags=["history"])


def _to_item(record: WorkoutSessionRecord) -> HistoryItem:
    return HistoryItem(
        id=record.id,
        workoutId=record.workout_id,
        exerciseId=record.exercise_id,
        exerciseName=record.exercise_name,
        cameraAngle=record.camera_angle,
        durationSeconds=record.duration_seconds,
        totalReps=record.total_reps,
        avgFormScore=record.avg_form_score,
        peakEffort=record.peak_effort,
        muscleLoad=normalize_muscle_load(record.muscle_load),
        createdAt=record.created_at,
    )


async def _owned_session(
    db: AsyncSession, session_id: str, user_id: str
) -> WorkoutSessionRecord:
    record = await db.get(WorkoutSessionRecord, session_id)
    if record is None or record.user_id != user_id:
        raise HTTPException(status_code=404, detail="Session not found")
    return record


@router.get("/history", response_model=HistoryPage, summary="List past workouts")
async def list_history(
    exerciseId: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    filters = [WorkoutSessionRecord.user_id == user.id]
    if exerciseId is not None:
        filters.append(WorkoutSessionRecord.exercise_id == exerciseId)
    if since is not None:
        filters.append(WorkoutSessionRecord.created_at >= since)
    if until is not None:
        filters.append(WorkoutSessionRecord.created_at <= until)

    total = await db.scalar(
        select(func.count()).select_from(WorkoutSessionRecord).where(*filters)
    )
    rows = await db.scalars(
        select(WorkoutSessionRecord)
        .where(*filters)
        .order_by(WorkoutSessionRecord.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return HistoryPage(
        items=[_to_item(row) for row in rows],
        total=total or 0,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/history/{session_id}", response_model=WorkoutSummary, summary="Read one past workout"
)
async def read_history_entry(
    session_id: str,
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await _owned_session(db, session_id, user.id)
    return WorkoutSummary(
        id=record.id,
        exerciseId=record.exercise_id,
        exerciseName=record.exercise_name,
        cameraAngle=record.camera_angle,
        durationSeconds=record.duration_seconds,
        totalReps=record.total_reps,
        avgFormScore=record.avg_form_score,
        peakEffort=record.peak_effort,
        muscleLoad=normalize_muscle_load(record.muscle_load),
        reps=record.reps,
        createdAt=record.created_at,
    )


@router.get(
    "/history/{session_id}/telemetry",
    response_model=TelemetryLog,
    summary="Rep-by-rep telemetry log for one workout",
)
async def read_telemetry(
    session_id: str,
    severity: str | None = Query(default=None, pattern="^(good|warn|crit)$"),
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    record = await _owned_session(db, session_id, user.id)
    reps = record.reps or []
    if severity is not None:
        reps = [rep for rep in reps if rep.get("severity") == severity]

    flaw_counts = Counter()
    for rep in record.reps or []:
        flaw_counts.update(rep.get("flaws") or [])

    analysis = await db.scalar(select(AnalysisRecord).where(AnalysisRecord.session_id == record.id))
    return TelemetryLog(
        analysis={**analysis.result, 'analysisId': analysis.id} if analysis else None,
        sessionId=record.id,
        exerciseId=record.exercise_id,
        exerciseName=record.exercise_name,
        recordedAt=record.created_at,
        muscleLoad=normalize_muscle_load(record.muscle_load),
        reps=reps,
        flawCounts=dict(flaw_counts),
    )


@router.get("/stats", response_model=HistoryStats, summary="Aggregate stats across past workouts")
async def read_stats(
    user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    from ..activity.service import athlete_stats
    return await athlete_stats(db, user)
