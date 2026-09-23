"""Application service for activities — one write path, one read path, one aggregate.

Every recorded set flows through ``persist_activity``: the processed report, the session row,
the social feed entry and the coach job are written together, so the log, the feed and the
stats can never disagree about what happened. Reads assemble the same aggregate for the
training log (``/api/activities``), and ``athlete_stats`` is the single aggregation used by
both the new stats endpoint and the legacy history route.
"""
from collections import Counter
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..analysis.library import LIBRARY
from ..muscle_load import normalize_muscle_load
from ..orm import (
    ActivityCommentRecord,
    ActivityReactionRecord,
    ActivityRecord,
    AnalysisRecord,
    CoachSummaryRecord,
    CustomExerciseRecord,
    UserRecord,
    WorkoutSessionRecord,
)
from ..schemas import ExerciseBreakdown, HistoryStats, RepData
from .pipeline import ProcessedActivity
from .schemas import ActivityCoach, ActivityDetail, ActivityListItem, FocusArea


async def user_library(db: AsyncSession, user: UserRecord | None) -> dict[str, dict]:
    """Built-in specs plus this user's taught exercises, keyed by id."""
    library = dict(LIBRARY)
    if user is not None:
        rows = (await db.execute(select(CustomExerciseRecord).where(CustomExerciseRecord.user_id == user.id))).scalars()
        for record in rows:
            library[record.id] = record.spec
    return library


async def persist_activity(
    db: AsyncSession, *,
    user: UserRecord,
    processed: ProcessedActivity,
    caption: str,
    visibility: str,
    workout_id: str | None,
    queue_coach: bool,
) -> tuple[WorkoutSessionRecord, AnalysisRecord, CoachSummaryRecord | None]:
    """Write one processed set as activity + analysis (+ coach job). Raises ValueError when unscored."""
    report = processed.report
    if not processed.scored:
        guidance = report['warnings'][0] if report['warnings'] else 'No complete, visible repetitions.'
        raise ValueError(f"{report['headline']} {guidance}")

    payload = processed.session_payload(workout_id)
    session = WorkoutSessionRecord(
        user_id=user.id,
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
        caption=caption,
    )
    analysis = AnalysisRecord(user_id=user.id, model_version=report['modelVersion'], result=report)
    db.add(session)
    db.add(analysis)
    await db.flush()
    analysis.session_id = session.id

    if visibility != 'private':
        # A recorded set is a feed item by default, exactly like a Strava upload.
        db.add(ActivityRecord(user_id=user.id, session_id=session.id, caption=caption, visibility=visibility))

    job = None
    if queue_coach:
        # The debrief is part of processing: queued with the upload, not as a separate action.
        job = CoachSummaryRecord(session_id=session.id, user_id=user.id, status='pending')
        db.add(job)

    await db.commit()
    await db.refresh(session)
    await db.refresh(analysis)
    if job is not None:
        await db.refresh(job)
    return session, analysis, job


async def _social_rows(db: AsyncSession, session_ids: list[str]) -> tuple[dict[str, ActivityRecord], dict[str, int], dict[str, int]]:
    """Feed entries and their reaction/comment counts for a page of sessions (4 queries total)."""
    if not session_ids:
        return {}, {}, {}
    socials = list((await db.scalars(select(ActivityRecord).where(ActivityRecord.session_id.in_(session_ids)))).all())
    by_session = {row.session_id: row for row in socials}
    activity_ids = [row.id for row in socials]
    reactions, comments = {}, {}
    if activity_ids:
        reactions = dict((await db.execute(
            select(ActivityReactionRecord.activity_id, func.count())
            .where(ActivityReactionRecord.activity_id.in_(activity_ids))
            .group_by(ActivityReactionRecord.activity_id))).all())
        comments = dict((await db.execute(
            select(ActivityCommentRecord.activity_id, func.count())
            .where(ActivityCommentRecord.activity_id.in_(activity_ids))
            .group_by(ActivityCommentRecord.activity_id))).all())
    return by_session, reactions, comments


async def get_activity(db: AsyncSession, user: UserRecord, session_id: str) -> ActivityDetail | None:
    """The athlete's own full activity page. None when missing or owned by someone else."""
    session = await db.get(WorkoutSessionRecord, session_id)
    if session is None or session.user_id != user.id:
        return None
    analysis = await db.scalar(select(AnalysisRecord).where(AnalysisRecord.session_id == session.id))
    by_session, reactions, comments = await _social_rows(db, [session.id])
    social = by_session.get(session.id)
    coach = await db.scalar(
        select(CoachSummaryRecord)
        .where(CoachSummaryRecord.session_id == session.id)
        .order_by(CoachSummaryRecord.created_at.desc())
        .limit(1))
    report = analysis.result if analysis else {}
    return ActivityDetail(
        id=session.id,
        status=report.get('status', 'scored'),
        exerciseId=session.exercise_id,
        exerciseName=session.exercise_name,
        family=report.get('family'),
        familyName=report.get('familyName'),
        confidence=report.get('confidence', 0),
        selectionSource=report.get('selectionSource', 'confirmed'),
        repCount=session.total_reps,
        score=session.avg_form_score,
        durationSeconds=session.duration_seconds,
        headline=report.get('headline', ''),
        focus=[FocusArea(**f) for f in report.get('focus', [])],
        warnings=report.get('warnings', []),
        notAssessed=report.get('notAssessed', []),
        disclaimer=report.get('disclaimer', ''),
        muscleLoad=normalize_muscle_load(session.muscle_load),
        reps=[RepData(**rep) for rep in session.reps or []],
        analysisId=analysis.id if analysis else '',
        workoutId=session.workout_id,
        caption=session.caption,
        visibility=social.visibility if social else 'private',
        reactionCount=reactions.get(social.id, 0) if social else 0,
        commentCount=comments.get(social.id, 0) if social else 0,
        coach=ActivityCoach(status=coach.status, model=coach.model, headline=coach.headline,
                            summary=coach.summary, focusAreas=coach.focus_areas or [],
                            nextSession=coach.next_session) if coach else None,
        createdAt=session.created_at,
    )


async def list_activities(
    db: AsyncSession,
    user: UserRecord,
    exercise_id: str | None,
    since: datetime | None,
    until: datetime | None,
    limit: int,
    offset: int,
) -> tuple[list[ActivityListItem], int]:
    """The athlete's training log, newest first."""
    filters = [WorkoutSessionRecord.user_id == user.id]
    if exercise_id is not None:
        filters.append(WorkoutSessionRecord.exercise_id == exercise_id)
    if since is not None:
        filters.append(WorkoutSessionRecord.created_at >= since)
    if until is not None:
        filters.append(WorkoutSessionRecord.created_at <= until)
    total = await db.scalar(select(func.count()).select_from(WorkoutSessionRecord).where(*filters)) or 0
    rows = list((await db.scalars(
        select(WorkoutSessionRecord)
        .where(*filters)
        .order_by(WorkoutSessionRecord.created_at.desc())
        .limit(limit)
        .offset(offset))).all())
    by_session, reactions, comments = await _social_rows(db, [row.id for row in rows])
    items = []
    for row in rows:
        social = by_session.get(row.id)
        items.append(ActivityListItem(
            id=row.id,
            exerciseId=row.exercise_id,
            exerciseName=row.exercise_name,
            status='scored',
            repCount=row.total_reps,
            score=row.avg_form_score,
            durationSeconds=row.duration_seconds,
            muscleLoad=normalize_muscle_load(row.muscle_load),
            caption=row.caption,
            visibility=social.visibility if social else 'private',
            reactionCount=reactions.get(social.id, 0) if social else 0,
            commentCount=comments.get(social.id, 0) if social else 0,
            createdAt=row.created_at,
        ))
    return items, total


async def delete_activity(db: AsyncSession, user: UserRecord, session_id: str) -> bool:
    """Delete the whole aggregate: session, analysis, feed entry (with reactions/comments), coach jobs."""
    session = await db.get(WorkoutSessionRecord, session_id)
    if session is None or session.user_id != user.id:
        return False
    socials = list((await db.scalars(select(ActivityRecord).where(ActivityRecord.session_id == session.id))).all())
    for social in socials:
        await db.execute(ActivityReactionRecord.__table__.delete().where(ActivityReactionRecord.activity_id == social.id))
        await db.execute(ActivityCommentRecord.__table__.delete().where(ActivityCommentRecord.activity_id == social.id))
        await db.delete(social)
    await db.execute(CoachSummaryRecord.__table__.delete().where(CoachSummaryRecord.session_id == session.id))
    await db.execute(AnalysisRecord.__table__.delete().where(AnalysisRecord.session_id == session.id))
    await db.delete(session)
    await db.commit()
    return True


async def athlete_stats(db: AsyncSession, user: UserRecord) -> HistoryStats:
    """All-time aggregation over the athlete's log. Shared by /api/athletes/me/stats and the legacy route."""
    rows = list((await db.scalars(
        select(WorkoutSessionRecord)
        .where(WorkoutSessionRecord.user_id == user.id)
        .order_by(WorkoutSessionRecord.created_at.desc()))).all())
    if not rows:
        return HistoryStats(
            totalSessions=0, totalReps=0, totalDurationSeconds=0.0, avgFormScore=0.0,
            peakEffort=0.0, topFlaws=[], byExercise=[], lastSessionAt=None)

    flaw_counts = Counter()
    grouped: dict[str, list[WorkoutSessionRecord]] = {}
    for row in rows:
        grouped.setdefault(row.exercise_id, []).append(row)
        for rep in row.reps or []:
            flaw_counts.update(rep.get('flaws') or [])

    by_exercise = [
        ExerciseBreakdown(
            exerciseId=exercise_id,
            exerciseName=group[0].exercise_name,
            sessions=len(group),
            totalReps=sum(item.total_reps for item in group),
            avgFormScore=round(sum(item.avg_form_score for item in group) / len(group), 2),
            bestFormScore=max(item.avg_form_score for item in group),
        )
        for exercise_id, group in grouped.items()
    ]
    by_exercise.sort(key=lambda entry: entry.sessions, reverse=True)

    return HistoryStats(
        totalSessions=len(rows),
        totalReps=sum(row.total_reps for row in rows),
        totalDurationSeconds=round(sum(row.duration_seconds for row in rows), 2),
        avgFormScore=round(sum(row.avg_form_score for row in rows) / len(rows), 2),
        peakEffort=max(row.peak_effort for row in rows),
        topFlaws=flaw_counts.most_common(5),
        byExercise=by_exercise,
        lastSessionAt=rows[0].created_at,
    )
