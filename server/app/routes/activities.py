"""Strava-style activity API — the primary interface for new clients.

One recorded set = one activity. ``POST /api/activities`` ingests the landmark streams, runs
the processing pipeline (detect → segment → grade → enrich), persists the activity, shares it
unless marked private, and queues the coach debrief — a single call replacing the legacy
evaluate → save → share sequence, which keeps working unchanged for the current frontend.
"""
from datetime import datetime

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from ..activity.pipeline import process
from ..activity.schemas import ActivityDetail, ActivityListItem, ActivityLogPage, RecordActivityPayload
from ..activity import service
from ..analysis.schemas import AnalysisRequest
from ..database import get_db
from ..deps import get_current_user
from ..orm import UserRecord
from ..schemas import HistoryStats
from .summary import run_coach_job

router = APIRouter(tags=['activities'])


@router.post('/api/activities', response_model=ActivityDetail, status_code=201,
             summary='Record a set: upload landmarks, get a fully processed activity')
async def record_activity(
    payload: RecordActivityPayload,
    request: Request,
    background_tasks: BackgroundTasks,
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        analysis_request = AnalysisRequest(
            streams=payload.streams,
            confirmedExercise=payload.confirmedExercise,
            sessionKey=payload.sessionKey,
            synchronized=payload.synchronized or len(payload.streams) == 1)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))

    library = await service.user_library(db, user)
    detector = getattr(request.app.state, 'exercise_detector', None)
    coach = getattr(request.app.state, 'form_coach', None)
    try:
        processed = await run_in_threadpool(process, analysis_request, library, detector, coach)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))

    queue_coach = bool(request.app.state.settings.openrouter_api_key)
    try:
        session, _, job = await service.persist_activity(
            db, user=user, processed=processed, caption=payload.caption.strip(),
            visibility=payload.visibility, workout_id=payload.workoutId, queue_coach=queue_coach)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))

    if job is not None:
        background_tasks.add_task(
            run_coach_job, job.id, request.app.state.session_factory, request.app.state.coach_generator)
    return await service.get_activity(db, user, session.id)


@router.get('/api/activities', response_model=ActivityLogPage, summary="The athlete's training log")
async def list_activities(
    exerciseId: str | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await service.list_activities(db, user, exerciseId, since, until, limit, offset)
    return ActivityLogPage(items=items, total=total, limit=limit, offset=offset)


@router.get('/api/activities/{activity_id}', response_model=ActivityDetail, summary='One full activity')
async def read_activity(
    activity_id: str,
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    detail = await service.get_activity(db, user, activity_id)
    if detail is None:
        raise HTTPException(status_code=404, detail='Activity not found')
    return detail


@router.delete('/api/activities/{activity_id}', status_code=204, summary='Delete an activity and everything attached')
async def remove_activity(
    activity_id: str,
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not await service.delete_activity(db, user, activity_id):
        raise HTTPException(status_code=404, detail='Activity not found')


@router.get('/api/athletes/me/stats', response_model=HistoryStats, summary="All-time stats over the athlete's log")
async def read_athlete_stats(
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await service.athlete_stats(db, user)
