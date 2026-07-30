"""
품목 SGRI 빌드 라우터 (품목 일반화).
- POST /items/{hs_code}/build-sgri : 임의 품목의 SGRI를 비동기로 구축 (202 + job_id)
- GET  /items/build/jobs/{job_id}  : 구축 진행 상태 폴링
- POST /items/{hs_code}/reweight    : 가중치만 재계산 (가벼움)
※ build-sgri 는 무거운 작업(Comtrade 다년치 수집). 로그인 필수.
"""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.pipeline import build_item_sgri
from app.services.weighting_ai import apply_gemini_sgri

router = APIRouter(prefix="/items", tags=["pipeline"])

# 빌드 작업 상태 저장소 (개발용 인메모리 — 단일 프로세스 전용, 재시작 시 초기화)
_BUILD_JOBS: dict[str, dict] = {}


def _run_build_job(job_id: str, hs_code: str) -> None:
    """백그라운드 SGRI 구축. 자체 DB 세션을 연다(요청 세션은 이미 닫힘)."""
    db = SessionLocal()
    try:
        result = build_item_sgri(db, hs_code)
        _BUILD_JOBS[job_id] = {"status": "done", "result": result}
    except Exception as exc:  # noqa: BLE001 - 실패를 상태로 노출
        _BUILD_JOBS[job_id] = {"status": "error", "error": str(exc)}
    finally:
        db.close()


@router.post("/{hs_code}/build-sgri", status_code=202)
def build_item(
    hs_code: str,
    background: BackgroundTasks,
    current_user: User = Depends(get_current_user),
):
    """해당 HS 코드의 SGRI 구축을 백그라운드로 시작하고 즉시 job_id를 반환(202).
    진행 상황은 GET /items/build/jobs/{job_id} 로 폴링한다."""
    job_id = uuid.uuid4().hex
    _BUILD_JOBS[job_id] = {"status": "pending"}
    background.add_task(_run_build_job, job_id, hs_code)
    return {"job_id": job_id, "status": "pending"}


@router.get("/build/jobs/{job_id}")
def build_job_status(job_id: str):
    """구축 작업 상태 조회: pending / done(+result) / error(+error)."""
    job = _BUILD_JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job_id": job_id, **job}


@router.post("/{hs_code}/reweight")
def reweight_item(
    hs_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """이미 계산된 6지표를 근거로 제미나이 가중치만 다시 받아 SGRI를 재계산한다.
    (Comtrade 재수집 없이 가벼움 — 가중치 실험/갱신용)"""
    return apply_gemini_sgri(db, hs_code)
