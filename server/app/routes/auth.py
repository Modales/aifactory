import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from ..config import Settings
from ..database import get_db
from ..deps import get_current_user, get_settings
from ..orm import UserProfileRecord, UserRecord
from ..schemas import AuthToken, LoginPayload, PublicUser, SignupPayload
from ..security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Checked when the email is unknown so a miss costs the same time as a wrong password (no account probing).
_DUMMY_HASH = hash_password("unused-dummy-password")

# Brute-force guard: per-email failed attempts in a sliding window (in-memory, per API process).
MAX_FAILED_LOGINS = 5
LOGIN_WINDOW_SECONDS = 15 * 60
_failed_logins: dict[str, list[float]] = {}


def _recent_failures(email: str) -> list[float]:
    cutoff = time.time() - LOGIN_WINDOW_SECONDS
    attempts = [t for t in _failed_logins.get(email, []) if t > cutoff]
    if attempts:
        _failed_logins[email] = attempts
    else:
        _failed_logins.pop(email, None)
    return attempts


def _to_public(user: UserRecord) -> PublicUser:
    return PublicUser(
        id=user.id,
        email=user.email,
        displayName=user.display_name,
        createdAt=user.created_at,
    )


def _issue_token(user: UserRecord, settings: Settings) -> AuthToken:
    token = create_access_token(
        user.id, settings.jwt_secret, settings.jwt_algorithm, settings.access_token_ttl_minutes
    )
    return AuthToken(
        accessToken=token,
        expiresInMinutes=settings.access_token_ttl_minutes,
        user=_to_public(user),
    )


@router.post("/signup", response_model=AuthToken, status_code=201, summary="Create an account")
async def signup(
    payload: SignupPayload,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    email = payload.email.lower()
    existing = await db.scalar(select(UserRecord).where(UserRecord.email == email))
    if existing is not None:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = UserRecord(
        email=email,
        password_hash=await run_in_threadpool(hash_password, payload.password),
        display_name=payload.displayName,
    )
    db.add(user)
    await db.flush()
    db.add(UserProfileRecord(user_id=user.id))
    await db.commit()
    await db.refresh(user)
    return _issue_token(user, settings)


@router.post("/login", response_model=AuthToken, summary="Exchange credentials for a token")
async def login(
    payload: LoginPayload,
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    email = payload.email.lower()
    attempts = _recent_failures(email)
    if len(attempts) >= MAX_FAILED_LOGINS:
        retry = int(attempts[0] + LOGIN_WINDOW_SECONDS - time.time()) + 1
        raise HTTPException(status_code=429, detail="Too many failed login attempts. Try again later.",
                            headers={"Retry-After": str(retry)})
    user = await db.scalar(select(UserRecord).where(UserRecord.email == email))
    # PBKDF2 is deliberately slow; run it off the event loop so logins don't stall live analysis.
    valid = await run_in_threadpool(verify_password, payload.password, user.password_hash if user else _DUMMY_HASH)
    if user is None or not valid:
        _failed_logins.setdefault(email, []).append(time.time())
        raise HTTPException(status_code=401, detail="Invalid email or password")
    _failed_logins.pop(email, None)
    return _issue_token(user, settings)


@router.get("/me", response_model=PublicUser, summary="Current authenticated user")
async def me(user: UserRecord = Depends(get_current_user)):
    return _to_public(user)
