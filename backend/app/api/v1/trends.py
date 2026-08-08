"""
최신 동향 분석 라우터.
- GET /trends/brief : 로그인 사용자의 공급망 동향 AI 요약 + 차트용 집계.
  로그인하면 그 사용자 데이터로 개인화, 없으면 전체 기준.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user_optional
from app.models.user import User
from app.services.real_cases import build_my_recent_news
from app.services.trends import build_trend_brief

router = APIRouter(prefix="/trends", tags=["trends"])


@router.get("/brief")
def trend_brief(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """공급망 최신 동향 요약과 차트용 집계를 반환한다."""
    return build_trend_brief(db, current_user.user_id if current_user else None)


@router.get("/news")
def trend_news(
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """내 등록 품목들의 실제 최근 뉴스(GDELT 최근 3개월, 기사 날짜 최신순)."""
    return build_my_recent_news(db, current_user.user_id if current_user else None)
