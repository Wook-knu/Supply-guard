"""
거래 희망 품목 입력 라우터 (F-01, 프론트 items/new 페이지).
- POST /queries        : 품목·조달조건 저장
- GET  /queries/{id}   : 저장된 질의 조회
※ 새 라우터를 추가할 때 이 파일을 템플릿으로 복사해서 쓰면 된다.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user_optional
from app.models.query import UserQuery
from app.models.user import User
from app.schemas.query import QueryCreate, QueryOut
from app.services.recommend import generate_recommendations
from app.services.ai_adapter import run_ai_analysis

router = APIRouter(prefix="/queries", tags=["queries"])


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


@router.post("/{query_id}/analyze")
def analyze_query(query_id: int, db: Session = Depends(get_db)):
    """AI_Model로 심층 분석: 기업 추천 정교화 + 보고서 + 가중치 생성 (결정 #5).
    국가 추천은 규칙 엔진 것 유지(건드리지 않음). 요약 결과를 반환한다."""
    query = db.get(UserQuery, query_id)
    if query is None:
        raise HTTPException(status_code=404, detail="query not found")
    return run_ai_analysis(db, query)


@router.get("/{query_id}", response_model=QueryOut)
def get_query(query_id: int, db: Session = Depends(get_db)):
    """query_id 로 저장된 질의를 조회한다. 없으면 404."""
    row = db.get(UserQuery, query_id)
    if row is None:
        raise HTTPException(status_code=404, detail="query not found")
    return row
