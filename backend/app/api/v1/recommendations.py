"""
국가 추천 조회 라우터 (F-06, 프론트 recommendations 화면).
- GET /queries/{query_id}/countries : 특정 질의의 국가 추천 목록(순위순)
※ risks.py와 다른 점: 필터를 경로(path) {query_id}로 받는다.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.query import UserQuery
from app.models.recommendation import ProcurementRecommendation
from app.schemas.recommendation import RecommendationOut
from app.services.explain_ai import explain_country

router = APIRouter(prefix="/queries", tags=["recommendations"])


@router.get("/{query_id}/countries", response_model=list[RecommendationOut])
def list_country_recos(query_id: int, db: Session = Depends(get_db)):
    """query_id에 해당하는 국가 추천을 rank 오름차순으로 반환(6지표 포함)."""
    stmt = (
        select(ProcurementRecommendation)
        .where(ProcurementRecommendation.query_id == query_id)
        .order_by(ProcurementRecommendation.rank)
    )
    return db.execute(stmt).scalars().all()


@router.get("/{query_id}/countries/{country_code}/explain")
def explain_country_reco(query_id: int, country_code: str, db: Session = Depends(get_db)):
    """이 국가를 추천한 이유를 AI(Gemini)가 6지표 근거로 상세히 설명한다."""
    reco = db.execute(
        select(ProcurementRecommendation).where(
            ProcurementRecommendation.query_id == query_id,
            ProcurementRecommendation.country_code == country_code,
        )
    ).scalars().first()
    if reco is None:
        raise HTTPException(status_code=404, detail="recommendation not found")
    query = db.get(UserQuery, query_id)
    item_name = (query.item_name if query else None) or "해당 품목"
    country_name = db.execute(
        text("SELECT name_ko FROM countries WHERE country_code = :c"), {"c": country_code}
    ).scalar() or country_code
    reco_dict = {
        "rank": reco.rank, "sgri_score": reco.sgri_score, "fit_score": reco.fit_score,
        "score_s": reco.score_s, "score_c": reco.score_c, "score_v": reco.score_v,
        "score_l": reco.score_l, "score_p": reco.score_p, "score_e": reco.score_e,
        "est_unit_price": reco.est_unit_price, "tariff_percent": reco.tariff_percent,
        "est_lead_days": reco.est_lead_days,
    }
    return explain_country(item_name, country_name, reco_dict)
