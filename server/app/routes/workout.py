from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_optional_user
from ..muscle_load import normalize_muscle_load
from ..orm import AnalysisRecord, UserRecord, WorkoutSessionRecord
from ..schemas import EndSessionPayload, SessionCreated, WorkoutSummary

router = APIRouter(prefix="/api/workout", tags=["workout"])


@router.post("/session", response_model=SessionCreated, status_code=201)
async def create_session(
    payload: EndSessionPayload,
    db: AsyncSession = Depends(get_db),
    user: UserRecord | None = Depends(get_optional_user),
):
    analysis = None
    if payload.analysisId:
        analysis = await db.get(AnalysisRecord, payload.analysisId, with_for_update=True)
        if user is None or analysis is None or analysis.user_id != user.id:
            raise HTTPException(status_code=404, detail='Analysis not found')
        if analysis.session_id:
            existing = await db.get(WorkoutSessionRecord, analysis.session_id)
            return SessionCreated(id=existing.id, createdAt=existing.created_at)
        result = analysis.result
        if result['score'] is None or not result['exercise'] or not result['repCount']:
            raise HTTPException(status_code=422, detail='Only scored analysis can be saved as a workout')
        # The saved workout is derived from the server report, never caller-supplied scores.
        from ..analysis.persistence import apply_report
        apply_report(payload, result)
    record = WorkoutSessionRecord(
        user_id=user.id if user is not None else None,
        workout_id=payload.workoutId,
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
    if analysis is not None:
        await db.flush()
        analysis.session_id = record.id
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
