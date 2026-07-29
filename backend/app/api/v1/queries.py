"""
거래 희망 품목 입력 라우터 (F-01, 프론트 items/new 페이지).
- POST /queries        : 품목·조달조건 저장
- GET  /queries/{id}   : 저장된 질의 조회
※ 새 라우터를 추가할 때 이 파일을 템플릿으로 복사해서 쓰면 된다.
"""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal, get_db
from app.core.security import get_current_user, get_current_user_optional
from app.models.query import UserQuery
from app.models.user import User
from app.schemas.query import QueryCreate, QueryOut
from app.services.recommend import generate_recommendations
from app.services.ai_adapter import run_ai_analysis

router = APIRouter(prefix="/queries", tags=["queries"])

# 분석 작업 상태 저장소 (개발용 인메모리 — 단일 프로세스에서만 유효, 서버 재시작 시 초기화)
_ANALYZE_JOBS: dict[str, dict] = {}


def _run_analyze_job(job_id: str, query_id: int) -> None:
    """백그라운드에서 실행되는 AI 분석. 자체 DB 세션을 연다(요청 세션은 이미 닫힘)."""
    db = SessionLocal()
    try:
        query = db.get(UserQuery, query_id)
        if query is None:
            _ANALYZE_JOBS[job_id] = {"status": "error", "error": "query not found"}
            return
        result = run_ai_analysis(db, query)
        _ANALYZE_JOBS[job_id] = {"status": "done", "result": result}
    except Exception as exc:  # noqa: BLE001 - 작업 실패를 상태로 노출
        _ANALYZE_JOBS[job_id] = {"status": "error", "error": str(exc)}
    finally:
        db.close()


@router.post("", response_model=QueryOut, status_code=201)
def create_query(
    payload: QueryCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """품목·조달조건을 user_queries 에 저장하고, 규칙 기반 추천을 자동 생성한다.
    Authorization 토큰이 있으면 그 사용자의 것으로(user_id) 기록, 없으면 NULL."""
    row = UserQuery(**payload.model_dump(exclude_none=True))
    if current_user is not None:
        row.user_id = current_user.user_id
    db.add(row)
    db.commit()
    db.refresh(row)
    generate_recommendations(db, row)  # 국가·기업 추천 자동 생성
    return row


@router.get("", response_model=list[QueryOut])
def list_queries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 로그인 사용자가 등록한 모니터링 품목을 최신순으로 반환한다."""
    stmt = (
        select(UserQuery)
        .where(UserQuery.user_id == current_user.user_id)
        .order_by(UserQuery.query_id.desc())
    )
    return db.execute(stmt).scalars().all()


@router.post("/{query_id}/analyze", status_code=202)
def analyze_query(
    query_id: int,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI_Model 심층 분석을 백그라운드로 시작하고 즉시 job_id를 반환(202).
    진행 상황은 GET /queries/analyze/jobs/{job_id} 로 폴링한다. (본인 질의만)"""
    query = db.get(UserQuery, query_id)
    if query is None or query.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="query not found")
    job_id = uuid.uuid4().hex
    _ANALYZE_JOBS[job_id] = {"status": "pending"}
    background.add_task(_run_analyze_job, job_id, query_id)
    return {"job_id": job_id, "status": "pending"}


@router.get("/analyze/jobs/{job_id}")
def analyze_job_status(job_id: str):
    """분석 작업 상태 조회: pending / done(+result) / error(+error)."""
    job = _ANALYZE_JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job_id": job_id, **job}


@router.get("/{query_id}", response_model=QueryOut)
def get_query(
    query_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """query_id 로 저장된 질의를 조회한다 (본인 것만). 없거나 남의 것이면 404."""
    row = db.get(UserQuery, query_id)
    if row is None or row.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="query not found")
    return row
