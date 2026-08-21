from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_optional_user
from ..muscle_load import normalize_muscle_load
from ..orm import UserRecord, WorkoutSessionRecord
from ..schemas import EndSessionPayload, SessionCreated, WorkoutSummary

router = APIRouter(prefix="/api/workout", tags=["workout"])


@router.post("/session", response_model=SessionCreated, status_code=201)
async def create_session(
    payload: EndSessionPayload,
    db: AsyncSession = Depends(get_db),
    user: UserRecord | None = Depends(get_optional_user),
):
    record = WorkoutSessionRecord(
        user_id=user.id if user is not None else None,
        exercise_id=payload.exerciseId,
        exercise_name=payload.exerciseName,
        camera_angle=payload.cameraAngle,
        duration_seconds=payload.durationSeconds,
        total_reps=payload.totalReps,
        avg_form_score=payload.avgFormScore,
        peak_effort=payload.peakEffort,
        muscle_load=payload.muscleLoad.model_dump(),
        reps=[rep.model_dump() for rep in payload.reps],
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return SessionCreated(id=record.id, createdAt=record.created_at)


@router.get("/summary/{session_id}", response_model=WorkoutSummary)
async def get_summary(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: UserRecord | None = Depends(get_optional_user),
):
    record = await db.get(WorkoutSessionRecord, session_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if record.user_id is not None and (user is None or user.id != record.user_id):
        raise HTTPException(status_code=404, detail="Session not found")
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
