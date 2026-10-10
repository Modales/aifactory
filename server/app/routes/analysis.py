from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from ..activity.service import user_library
from ..analysis.athlete import brief, history_item
from ..analysis.live_buffer import LiveBuffer, Mismatch
from ..analysis.schemas import AnalysisRequest, CameraStream, Frame, LiveRequest, TeachExerciseRequest
from ..analysis.engine import PROPOSED, analyze, learn_from, VERSION
from ..analysis.library import FAMILIES, LIBRARY, MUSCLE_IDS, catalog
from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..muscle_load import NAMES as MUSCLE_NAMES
from ..orm import AnalysisRecord, CustomExerciseRecord, UserProfileRecord, UserRecord

router = APIRouter(prefix='/api/analysis', tags=['analysis'])


@router.get('/capabilities')
async def capabilities(request: Request):
    detector = getattr(request.app.state, 'exercise_detector', None)
    return {'modelVersion': VERSION, 'exercises': {id: s['name'] for id, s in LIBRARY.items()}, 'families': FAMILIES,
            'llmDetection': bool(detector and detector.available), 'llmCoach': bool(detector and detector.available), 'detectModel': detector.model if detector and detector.available else None,
            'exerciseCount': len(LIBRARY), 'maxCameras': 3, 'maxFramesPerCamera': 1800,
            'input': '33 normalized MediaPipe landmarks per timestamp', 'validated': False}


@router.get('/exercises')
async def exercises(user: UserRecord | None = Depends(get_optional_user), db: AsyncSession = Depends(get_db)):
    """The full library the picker offers: built-ins, then the signed-in athlete's taught exercises."""
    library = await user_library(db, user)
    customs = [spec for spec in library.values() if spec['custom']]
    return {'exercises': catalog(customs), 'families': FAMILIES,
            'muscles': [{'id': m, 'name': MUSCLE_NAMES[m]} for m in MUSCLE_IDS]}


@router.post('/exercises', status_code=201)
async def teach_exercise(payload: TeachExerciseRequest, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Learn a new exercise from the athlete's own recorded set and add it to their library."""
    library = await user_library(db, user)
    if any(s['name'].lower() == payload.name.strip().lower() for s in library.values()):
        raise HTTPException(status_code=409, detail='An exercise with that name already exists in your library.')
    if any(m not in MUSCLE_IDS for m in payload.muscles):
        raise HTTPException(status_code=422, detail='Unknown muscle id')
    request = AnalysisRequest(streams=payload.streams, synchronized=payload.synchronized or len(payload.streams) == 1)
    try:
        spec = await run_in_threadpool(learn_from, request, payload.name, payload.muscles)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    if payload.family in FAMILIES:
        spec['family'] = payload.family
    record = CustomExerciseRecord(id=spec['id'], user_id=user.id, name=spec['name'], spec=spec)
    db.add(record)
    await db.commit()
    return {'exercise': catalog([spec])[-1], 'learned': spec['learned'], 'checks': [c['name'] for c in spec['checks']]}


@router.delete('/exercises/{exercise_id}', status_code=204)
async def forget_exercise(exercise_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await db.get(CustomExerciseRecord, exercise_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(status_code=404, detail='Exercise not found')
    await db.delete(record)
    await db.commit()


PROFILE_FIELDS = ('fitness_goal', 'experience_level', 'age', 'training_days_per_week', 'injuries', 'equipment')


async def athlete_context(db: AsyncSession, user: UserRecord, coach):
    """Profile + recent saved sets for the coach; skipped entirely when no coach will run."""
    if coach is None or not getattr(coach, 'available', True):
        return None
    record = await db.get(UserProfileRecord, user.id)
    profile = {f: getattr(record, f) for f in PROFILE_FIELDS} if record else None
    rows = (await db.execute(select(AnalysisRecord.result, AnalysisRecord.created_at).where(AnalysisRecord.user_id == user.id)
                             .order_by(AnalysisRecord.created_at.desc()).limit(15))).all()
    history = [history_item(result, created) for result, created in rows]
    return lambda exercise_id, library: brief(profile, history, exercise_id, library)


async def run_analysis(payload: AnalysisRequest, request: Request, user: UserRecord, db: AsyncSession):
    library = await user_library(db, user)
    detector = getattr(request.app.state, 'exercise_detector', None)
    coach = getattr(request.app.state, 'form_coach', None)
    athlete = await athlete_context(db, user, coach)
    try:
        return await run_in_threadpool(analyze, payload, library, detector, coach, athlete)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))


@router.post('/evaluate')
async def evaluate(payload: AnalysisRequest, request: Request, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await run_analysis(payload, request, user, db)
    if payload.persist and result['exercise'] != PROPOSED:
        record = AnalysisRecord(user_id=user.id, model_version=VERSION, result=result)
        db.add(record)
        await db.commit()
        await db.refresh(record)
        result = {**result, 'analysisId': record.id}
        if payload.sessionKey:
            live_buffer(request).drop(user.id, payload.sessionKey)
    return result


def live_buffer(request: Request) -> LiveBuffer:
    if not hasattr(request.app.state, 'live_buffer'):
        request.app.state.live_buffer = LiveBuffer()
    return request.app.state.live_buffer


@router.post('/live')
async def live(payload: LiveRequest, request: Request, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Live HUD update: append only new frames, analyse the buffered set. 409 = re-send from index 0."""
    try:
        streams = live_buffer(request).append(user.id, payload.sessionKey, payload.streams)
    except Mismatch as error:
        return JSONResponse(status_code=409, content={'detail': 'Live buffer out of sync; re-send all frames.', 'expected': error.expected})
    if any(not s['frames'] for s in streams):
        raise HTTPException(status_code=422, detail='Every camera needs frames before live analysis.')
    # Frames were validated on arrival; skip re-validating the whole set on every tick.
    full = AnalysisRequest.model_construct(
        streams=[CameraStream.model_construct(**{**s, 'frames': [f if isinstance(f, Frame) else Frame(**f) for f in s['frames']]}) for s in streams],
        confirmedExercise=payload.confirmedExercise, persist=False, synchronized=payload.synchronized, sessionKey=payload.sessionKey)
    return await run_analysis(full, request, user, db)


@router.get('/reports/{report_id}')
async def report(report_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await db.get(AnalysisRecord, report_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(status_code=404, detail='Analysis not found')
    return {**record.result, 'analysisId': record.id}
