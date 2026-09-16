from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from ..analysis.schemas import AnalysisRequest
from ..analysis.engine import analyze, NAMES, VERSION
from ..database import get_db
from ..deps import get_current_user
from ..orm import AnalysisRecord, UserRecord

router = APIRouter(prefix='/api/analysis', tags=['analysis'])


@router.get('/capabilities')
async def capabilities():
    return {'modelVersion': VERSION, 'exercises': NAMES, 'maxCameras': 3, 'maxFramesPerCamera': 1800,
            'input': '33 normalized MediaPipe landmarks per timestamp', 'validated': False}


@router.post('/evaluate')
async def evaluate(payload: AnalysisRequest, user: UserRecord = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        result = await run_in_threadpool(analyze, payload)
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
