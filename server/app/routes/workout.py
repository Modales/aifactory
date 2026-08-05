from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..orm import WorkoutSessionRecord
from ..schemas import EndSessionPayload, SessionCreated, WorkoutSummary

router = APIRouter(prefix="/api/workout", tags=["workout"])


@router.post("/session", response_model=SessionCreated, status_code=201)
async def create_session(payload: EndSessionPayload, db: AsyncSession = Depends(get_db)):
    record = WorkoutSessionRecord(
        exercise_id=payload.exerciseId,
        exercise_name=payload.exerciseName,
        camera_angle=payload.cameraAngle,
        duration_seconds=payload.durationSeconds,
        total_reps=payload.totalReps,
        avg_form_score=payload.avgFormScore,
        peak_effort=payload.peakEffort,
        reps=[rep.model_dump() for rep in payload.reps],
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return SessionCreated(id=record.id, createdAt=record.created_at)


@router.get("/summary/{session_id}", response_model=WorkoutSummary)
async def get_summary(session_id: str, db: AsyncSession = Depends(get_db)):
    record = await db.get(WorkoutSessionRecord, session_id)
    if record is None:
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
        reps=record.reps,
        createdAt=record.created_at,
    )
