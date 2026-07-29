"""
추천 피드백 라우터 (요구사항 11, 프론트 recommendations 화면 👍/👎).
- POST /feedback         : 추천에 피드백 저장 (로그인 시 user_id 기록)
- GET  /feedback         : 피드백 조회 (reco_type/reco_id 필터)
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user_optional
from app.models.feedback import RecommendationFeedback
from app.models.user import User
from app.schemas.feedback import FeedbackCreate, FeedbackOut

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackOut, status_code=201)
def create_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """추천(country/supplier)에 대한 피드백을 저장한다. 토큰 있으면 그 사용자로 기록."""
    row = RecommendationFeedback(**payload.model_dump(exclude_none=True))
    if current_user is not None:
        row.user_id = current_user.user_id
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("", response_model=list[FeedbackOut])
def list_feedback(
    reco_type: str | None = Query(default=None, description="country / supplier"),
    reco_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
):
    """조건에 맞는 피드백을 최신순으로 반환."""
    stmt = select(RecommendationFeedback)
    if reco_type:
        stmt = stmt.where(RecommendationFeedback.reco_type == reco_type)
    if reco_id:
        stmt = stmt.where(RecommendationFeedback.reco_id == reco_id)
    stmt = stmt.order_by(RecommendationFeedback.feedback_id.desc())
    return db.execute(stmt).scalars().all()
