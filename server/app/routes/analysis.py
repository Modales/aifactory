from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from ..analysis.schemas import AnalysisRequest, TeachExerciseRequest
from ..analysis.engine import analyze, learn_from, VERSION
from ..analysis.library import FAMILIES, LIBRARY, MUSCLE_IDS, catalog
from ..database import get_db
from ..deps import get_current_user, get_optional_user
from ..muscle_load import NAMES as MUSCLE_NAMES
from ..orm import AnalysisRecord, CustomExerciseRecord, UserRecord

router = APIRouter(prefix='/api/analysis', tags=['analysis'])


async def user_library(db: AsyncSession, user: UserRecord | None) -> dict[str, dict]:
    """Built-in specs plus this user's taught exercises, keyed by id."""
    library = dict(LIBRARY)
    if user is not None:
        rows = (await db.execute(select(CustomExerciseRecord).where(CustomExerciseRecord.user_id == user.id))).scalars()
        for record in rows:
            library[record.id] = record.spec
    return library


@router.get('/capabilities')
async def capabilities():
    return {'modelVersion': VERSION, 'exercises': {id: s['name'] for id, s in LIBRARY.items()}, 'families': FAMILIES,
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


@router.post('/evaluate')
async def evaluate(payload: AnalysisRequest, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    library = await user_library(db, user)
    try:
        result = await run_in_threadpool(analyze, payload, library)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    if payload.persist:
        record = AnalysisRecord(user_id=user.id, model_version=VERSION, result=result)
        db.add(record)
        await db.commit()
        await db.refresh(record)
        result = {**result, 'analysisId': record.id}
    return result


@router.get('/reports/{report_id}')
async def report(report_id: str, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    record = await db.get(AnalysisRecord, report_id)
    if record is None or record.user_id != user.id:
        raise HTTPException(status_code=404, detail='Analysis not found')
    return {**record.result, 'analysisId': record.id}
