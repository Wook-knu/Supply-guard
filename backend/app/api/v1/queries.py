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


@router.post("/{query_id}/analyze", response_model=QueryOut)
def analyze_query(query_id: int, db: Session = Depends(get_db)):
    """기존 질의의 추천을 다시 생성한다(재분석). 데이터가 갱신됐을 때 사용."""
    query = db.get(UserQuery, query_id)
    if query is None:
        raise HTTPException(status_code=404, detail="query not found")
    generate_recommendations(db, query)
    return query


@router.get("/{query_id}", response_model=QueryOut)
def get_query(query_id: int, db: Session = Depends(get_db)):
    """query_id 로 저장된 질의를 조회한다. 없으면 404."""
    row = db.get(UserQuery, query_id)
    if row is None:
        raise HTTPException(status_code=404, detail="query not found")
    return row
