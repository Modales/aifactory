from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from ..database import get_db
from ..deps import get_current_user
from ..orm import UserRecord, FollowRecord, ActivityRecord
from .social import _activity_schema

router = APIRouter(prefix='/api/social/athletes', tags=['athletes'])


async def athlete_schema(db, athlete, viewer_id):
    following = await db.get(FollowRecord, {'follower_id': viewer_id, 'followed_id': athlete.id}) is not None
    followers = await db.scalar(select(func.count()).select_from(FollowRecord).where(FollowRecord.followed_id == athlete.id)) or 0
    follows = await db.scalar(select(func.count()).select_from(FollowRecord).where(FollowRecord.follower_id == athlete.id)) or 0
    return {'id': athlete.id, 'displayName': athlete.display_name, 'createdAt': athlete.created_at,
            'following': following, 'followerCount': followers, 'followingCount': follows}


@router.get('')
async def discover(q: str = Query(default='', max_length=100), limit: int = Query(default=20, ge=1, le=50),
                   user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    query = select(UserRecord).where(UserRecord.id != user.id)
    if q.strip():
        query = query.where(UserRecord.display_name.icontains(q.strip(), autoescape=True))
    athletes = list(await db.scalars(query.order_by(UserRecord.display_name, UserRecord.id).limit(limit)))
    return [await athlete_schema(db, athlete, user.id) for athlete in athletes]


@router.get('/{athlete_id}')
async def profile(athlete_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    athlete = await db.get(UserRecord, athlete_id)
    if athlete is None:
        raise HTTPException(status_code=404, detail='Athlete not found')
    result = await athlete_schema(db, athlete, user.id)
    query = select(ActivityRecord).where(ActivityRecord.user_id == athlete_id)
    if athlete_id != user.id and not result['following']:
        query = query.where(ActivityRecord.visibility == 'public')
    records = list(await db.scalars(query.order_by(ActivityRecord.created_at.desc()).limit(30)))
    return {**result, 'activities': [await _activity_schema(db, item, user.id) for item in records]}
