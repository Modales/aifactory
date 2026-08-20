from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import get_current_user
from ..orm import (
    ActivityCommentRecord,
    ActivityReactionRecord,
    ActivityRecord,
    ChallengeParticipantRecord,
    ChallengeRecord,
    ClubMemberRecord,
    ClubRecord,
    FollowRecord,
    UserRecord,
    WorkoutSessionRecord,
)
from ..schemas import (
    Activity,
    ActivityAuthor,
    ActivityComment,
    ActivityCreatePayload,
    ActivityFeed,
    ActivityWorkout,
    Challenge,
    ChallengeCreatePayload,
    ChallengeLeaderboard,
    ChallengeLeaderboardEntry,
    Club,
    ClubCreatePayload,
    FollowStatus,
)

router = APIRouter(prefix="/api/social", tags=["social"])


def _author(user: UserRecord) -> ActivityAuthor:
    return ActivityAuthor(id=user.id, displayName=user.display_name)


def _as_utc(value: datetime) -> datetime:
    """SQLite returns naive timestamps while PostgreSQL preserves UTC tzinfo."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


async def _activity_is_visible(db: AsyncSession, activity: ActivityRecord, viewer_id: str) -> bool:
    if activity.user_id == viewer_id or activity.visibility == "public":
        return True
    return await db.get(FollowRecord, {"follower_id": viewer_id, "followed_id": activity.user_id}) is not None


async def _activity_schema(db: AsyncSession, activity: ActivityRecord, viewer_id: str) -> Activity:
    author = await db.get(UserRecord, activity.user_id)
    if author is None:
        raise HTTPException(status_code=404, detail="Activity author not found")
    workout = await db.get(WorkoutSessionRecord, activity.session_id) if activity.session_id else None
    reactions = await db.scalar(
        select(func.count()).select_from(ActivityReactionRecord).where(ActivityReactionRecord.activity_id == activity.id)
    ) or 0
    comments = await db.scalar(
        select(func.count()).select_from(ActivityCommentRecord).where(ActivityCommentRecord.activity_id == activity.id)
    ) or 0
    reacted = await db.get(ActivityReactionRecord, {"activity_id": activity.id, "user_id": viewer_id}) is not None
    return Activity(
        id=activity.id,
        author=_author(author),
        caption=activity.caption,
        visibility=activity.visibility,
        workout=ActivityWorkout(
            exerciseName=workout.exercise_name,
            totalReps=workout.total_reps,
            durationSeconds=workout.duration_seconds,
            avgFormScore=workout.avg_form_score,
        ) if workout else None,
        reactionCount=reactions,
        commentCount=comments,
        reactedByMe=reacted,
        createdAt=activity.created_at,
    )


async def _get_visible_activity(db: AsyncSession, activity_id: str, viewer_id: str) -> ActivityRecord:
    activity = await db.get(ActivityRecord, activity_id)
    if activity is None or not await _activity_is_visible(db, activity, viewer_id):
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


@router.put("/follows/{user_id}", response_model=FollowStatus, summary="Follow an athlete")
async def follow(user_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="You cannot follow yourself")
    if await db.get(UserRecord, user_id) is None:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if await db.get(FollowRecord, {"follower_id": user.id, "followed_id": user_id}) is None:
        db.add(FollowRecord(follower_id=user.id, followed_id=user_id))
        await db.commit()
    return FollowStatus(userId=user_id, following=True)


@router.delete("/follows/{user_id}", response_model=FollowStatus, summary="Unfollow an athlete")
async def unfollow(user_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await db.get(FollowRecord, {"follower_id": user.id, "followed_id": user_id})
    if record is not None:
        await db.delete(record)
        await db.commit()
    return FollowStatus(userId=user_id, following=False)


@router.get("/feed", response_model=ActivityFeed, summary="Read activities from followed athletes")
async def feed(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: UserRecord = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    followed = select(FollowRecord.followed_id).where(FollowRecord.follower_id == user.id)
    activities = list(await db.scalars(
        select(ActivityRecord)
        .where(or_(ActivityRecord.user_id == user.id, ActivityRecord.visibility == "public", ActivityRecord.user_id.in_(followed)))
        .order_by(ActivityRecord.created_at.desc()).limit(limit).offset(offset)
    ))
    return ActivityFeed(items=[await _activity_schema(db, item, user.id) for item in activities], limit=limit, offset=offset)


@router.post("/activities", response_model=Activity, status_code=status.HTTP_201_CREATED, summary="Share a workout or update")
async def create_activity(payload: ActivityCreatePayload, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if payload.sessionId:
        session = await db.get(WorkoutSessionRecord, payload.sessionId)
        if session is None or session.user_id != user.id:
            raise HTTPException(status_code=404, detail="Workout session not found")
        if await db.scalar(select(ActivityRecord).where(ActivityRecord.session_id == session.id)):
            raise HTTPException(status_code=409, detail="This workout is already shared")
    if not payload.sessionId and not payload.caption.strip():
        raise HTTPException(status_code=422, detail="A post needs a caption or workout")
    activity = ActivityRecord(user_id=user.id, session_id=payload.sessionId, caption=payload.caption.strip(), visibility=payload.visibility)
    db.add(activity)
    await db.commit()
    await db.refresh(activity)
    return await _activity_schema(db, activity, user.id)


@router.put("/activities/{activity_id}/reaction", response_model=Activity, summary="Give kudos to an activity")
async def react(activity_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    activity = await _get_visible_activity(db, activity_id, user.id)
    if await db.get(ActivityReactionRecord, {"activity_id": activity.id, "user_id": user.id}) is None:
        db.add(ActivityReactionRecord(activity_id=activity.id, user_id=user.id))
        await db.commit()
    return await _activity_schema(db, activity, user.id)


@router.delete("/activities/{activity_id}/reaction", response_model=Activity, summary="Remove kudos from an activity")
async def remove_reaction(activity_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    activity = await _get_visible_activity(db, activity_id, user.id)
    reaction = await db.get(ActivityReactionRecord, {"activity_id": activity.id, "user_id": user.id})
    if reaction is not None:
        await db.delete(reaction)
        await db.commit()
    return await _activity_schema(db, activity, user.id)


@router.post("/activities/{activity_id}/comments", response_model=ActivityComment, status_code=status.HTTP_201_CREATED, summary="Comment on an activity")
async def comment(activity_id: str, body: str = Query(min_length=1, max_length=1000), user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    activity = await _get_visible_activity(db, activity_id, user.id)
    record = ActivityCommentRecord(activity_id=activity.id, user_id=user.id, body=body.strip())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return ActivityComment(id=record.id, author=_author(user), body=record.body, createdAt=record.created_at)


@router.get("/activities/{activity_id}/comments", response_model=list[ActivityComment], summary="List activity comments")
async def list_comments(activity_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    await _get_visible_activity(db, activity_id, user.id)
    rows = list(await db.execute(select(ActivityCommentRecord, UserRecord).join(UserRecord, UserRecord.id == ActivityCommentRecord.user_id).where(ActivityCommentRecord.activity_id == activity_id).order_by(ActivityCommentRecord.created_at.asc())))
    return [ActivityComment(id=comment.id, author=_author(author), body=comment.body, createdAt=comment.created_at) for comment, author in rows]


async def _club_schema(db: AsyncSession, club: ClubRecord, user_id: str) -> Club:
    count = await db.scalar(select(func.count()).select_from(ClubMemberRecord).where(ClubMemberRecord.club_id == club.id)) or 0
    joined = await db.get(ClubMemberRecord, {"club_id": club.id, "user_id": user_id}) is not None
    return Club(id=club.id, name=club.name, description=club.description, isPrivate=club.is_private, memberCount=count, joined=joined, createdAt=club.created_at)


@router.post("/clubs", response_model=Club, status_code=status.HTTP_201_CREATED, summary="Create a training club")
async def create_club(payload: ClubCreatePayload, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    club = ClubRecord(owner_id=user.id, name=payload.name.strip(), description=payload.description.strip(), is_private=payload.isPrivate)
    db.add(club)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A club with that name already exists")
    db.add(ClubMemberRecord(club_id=club.id, user_id=user.id, role="owner"))
    await db.commit()
    await db.refresh(club)
    return await _club_schema(db, club, user.id)


@router.get("/clubs", response_model=list[Club], summary="Discover training clubs")
async def list_clubs(user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    clubs = list(await db.scalars(select(ClubRecord).order_by(ClubRecord.created_at.desc())))
    return [await _club_schema(db, club, user.id) for club in clubs]


@router.put("/clubs/{club_id}/membership", response_model=Club, summary="Join a public training club")
async def join_club(club_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    club = await db.get(ClubRecord, club_id)
    if club is None:
        raise HTTPException(status_code=404, detail="Club not found")
    if club.is_private and club.owner_id != user.id:
        raise HTTPException(status_code=403, detail="This is a private club")
    if await db.get(ClubMemberRecord, {"club_id": club.id, "user_id": user.id}) is None:
        db.add(ClubMemberRecord(club_id=club.id, user_id=user.id))
        await db.commit()
    return await _club_schema(db, club, user.id)


async def _challenge_schema(db: AsyncSession, challenge: ChallengeRecord, user_id: str) -> Challenge:
    count = await db.scalar(select(func.count()).select_from(ChallengeParticipantRecord).where(ChallengeParticipantRecord.challenge_id == challenge.id)) or 0
    joined = await db.get(ChallengeParticipantRecord, {"challenge_id": challenge.id, "user_id": user_id}) is not None
    return Challenge(id=challenge.id, name=challenge.name, description=challenge.description, metric=challenge.metric, startsAt=challenge.starts_at, endsAt=challenge.ends_at, participantCount=count, joined=joined)


@router.post("/challenges", response_model=Challenge, status_code=status.HTTP_201_CREATED, summary="Create a training challenge")
async def create_challenge(payload: ChallengeCreatePayload, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if payload.endsAt <= payload.startsAt:
        raise HTTPException(status_code=422, detail="Challenge end must be after its start")
    if payload.clubId and await db.get(ClubMemberRecord, {"club_id": payload.clubId, "user_id": user.id}) is None:
        raise HTTPException(status_code=403, detail="Join the club before creating its challenge")
    challenge = ChallengeRecord(creator_id=user.id, club_id=payload.clubId, name=payload.name.strip(), description=payload.description.strip(), metric=payload.metric, starts_at=payload.startsAt, ends_at=payload.endsAt)
    db.add(challenge)
    await db.flush()
    db.add(ChallengeParticipantRecord(challenge_id=challenge.id, user_id=user.id))
    await db.commit()
    await db.refresh(challenge)
    return await _challenge_schema(db, challenge, user.id)


@router.get("/challenges", response_model=list[Challenge], summary="Browse current training challenges")
async def list_challenges(user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    challenges = list(await db.scalars(select(ChallengeRecord).where(ChallengeRecord.ends_at >= now).order_by(ChallengeRecord.ends_at.asc())))
    return [await _challenge_schema(db, challenge, user.id) for challenge in challenges]


@router.put("/challenges/{challenge_id}/participation", response_model=Challenge, summary="Join a training challenge")
async def join_challenge(challenge_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    challenge = await db.get(ChallengeRecord, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if _as_utc(challenge.ends_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="This challenge has ended")
    if challenge.club_id and await db.get(ClubMemberRecord, {"club_id": challenge.club_id, "user_id": user.id}) is None:
        raise HTTPException(status_code=403, detail="Join the club before joining its challenge")
    if await db.get(ChallengeParticipantRecord, {"challenge_id": challenge.id, "user_id": user.id}) is None:
        db.add(ChallengeParticipantRecord(challenge_id=challenge.id, user_id=user.id))
        await db.commit()
    return await _challenge_schema(db, challenge, user.id)


@router.get("/challenges/{challenge_id}/leaderboard", response_model=ChallengeLeaderboard, summary="Read a challenge leaderboard")
async def leaderboard(challenge_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    challenge = await db.get(ChallengeRecord, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found")
    if await db.get(ChallengeParticipantRecord, {"challenge_id": challenge.id, "user_id": user.id}) is None:
        raise HTTPException(status_code=403, detail="Join the challenge to view its leaderboard")
    metric_column = {"reps": WorkoutSessionRecord.total_reps, "sessions": WorkoutSessionRecord.id, "durationSeconds": WorkoutSessionRecord.duration_seconds}[challenge.metric]
    aggregate = func.count(metric_column) if challenge.metric == "sessions" else func.coalesce(func.sum(metric_column), 0)
    rows = list(await db.execute(
        select(UserRecord, aggregate.label("value"))
        .join(ChallengeParticipantRecord, ChallengeParticipantRecord.user_id == UserRecord.id)
        .outerjoin(WorkoutSessionRecord, (WorkoutSessionRecord.user_id == UserRecord.id) & (WorkoutSessionRecord.created_at >= challenge.starts_at) & (WorkoutSessionRecord.created_at <= challenge.ends_at))
        .where(ChallengeParticipantRecord.challenge_id == challenge.id)
        .group_by(UserRecord.id)
        .order_by(aggregate.desc(), UserRecord.display_name.asc())
    ))
    return ChallengeLeaderboard(challenge=await _challenge_schema(db, challenge, user.id), entries=[ChallengeLeaderboardEntry(rank=index + 1, athlete=_author(athlete), value=float(value)) for index, (athlete, value) in enumerate(rows)])
