"""Opt-in calibration dataset: body-point landmarks (never video) from every finished set.

Stored only while the athlete's consent for the current ``TERMS_VERSION`` is accepted.
One row per set (``sessionKey``); re-scoring the set under a confirmed exercise updates
the label, so the row ends up holding the athlete's final answer as ground truth.
"""
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..orm import CalibrationConsentRecord, CalibrationRecordingRecord
from .schemas import AnalysisRequest

TERMS_VERSION = '2026-09-23'


async def consent(db: AsyncSession, user_id: str) -> CalibrationConsentRecord | None:
    record = await db.get(CalibrationConsentRecord, user_id)
    return record if record and record.terms_version == TERMS_VERSION else None


async def set_consent(db: AsyncSession, user_id: str, accepted: bool) -> CalibrationConsentRecord:
    record = await db.get(CalibrationConsentRecord, user_id) or CalibrationConsentRecord(user_id=user_id)
    record.accepted, record.terms_version = accepted, TERMS_VERSION
    db.add(record)
    if not accepted:  # Declining (or withdrawing) removes everything already stored.
        await db.execute(delete(CalibrationRecordingRecord).where(CalibrationRecordingRecord.user_id == user_id))
    await db.commit()
    return record


async def recording_count(db: AsyncSession, user_id: str) -> int:
    rows = await db.execute(select(CalibrationRecordingRecord.id).where(CalibrationRecordingRecord.user_id == user_id))
    return len(rows.all())


def _summary(result: dict) -> dict:
    return {key: result.get(key) for key in ('exerciseName', 'confidence', 'selectionSource', 'candidates', 'durationSeconds', 'views', 'warnings', 'detectionNote')} | {
        'reps': [{'startMs': r['startMs'], 'endMs': r['endMs']} for r in result.get('reps', [])]}


async def record_set(db: AsyncSession, user_id: str, payload: AnalysisRequest, result: dict, version: str) -> bool:
    """Upsert the finished set if the athlete has opted in. Returns whether it was stored."""
    agreed = await consent(db, user_id)
    if not agreed or not agreed.accepted or not payload.sessionKey:
        return False
    found = await db.execute(select(CalibrationRecordingRecord).where(
        CalibrationRecordingRecord.user_id == user_id, CalibrationRecordingRecord.session_key == payload.sessionKey))
    record = found.scalar_one_or_none() or CalibrationRecordingRecord(user_id=user_id, session_key=payload.sessionKey)
    record.model_version = version
    record.streams = [s.model_dump(exclude={'snapshots'}) for s in payload.streams]   # body points only, never images
    record.confirmed_exercise = payload.confirmedExercise
    record.detected_exercise = result.get('exercise')
    record.rep_count = result.get('repCount', 0)
    record.summary = _summary(result)
    db.add(record)
    await db.commit()
    return True
