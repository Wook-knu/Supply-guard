"""
국가 추천 조회 라우터 (F-06, 프론트 recommendations 화면).
- GET /queries/{query_id}/countries : 특정 질의의 국가 추천 목록(순위순)
※ risks.py와 다른 점: 필터를 경로(path) {query_id}로 받는다.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.recommendation import ProcurementRecommendation
from app.schemas.recommendation import RecommendationOut

router = APIRouter(prefix="/queries", tags=["recommendations"])


@router.get("/{query_id}/countries", response_model=list[RecommendationOut])
def list_country_recos(query_id: int, db: Session = Depends(get_db)):
    """query_id에 해당하는 국가 추천을 rank 오름차순으로 반환."""
    stmt = (
        select(ProcurementRecommendation)
        .where(ProcurementRecommendation.query_id == query_id)
        .order_by(ProcurementRecommendation.rank)
    )
    return db.execute(stmt).scalars().all()
