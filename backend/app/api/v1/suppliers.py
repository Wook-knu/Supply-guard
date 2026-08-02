"""
기업 추천 조회 라우터 (F-07/F-08, 프론트 suppliers 화면).
- GET /queries/{query_id}/suppliers : 특정 질의의 기업 추천 목록(순위순, 기업정보 포함)
※ recommendations.py와 구조 같음. 다른 점: 응답에 company(기업정보)가 중첩된다.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.company import Company
from app.models.query import UserQuery
from app.models.recommendation import ProcurementRecommendation
from app.models.supplier_recommendation import SupplierRecommendation
from app.schemas.supplier import SupplierRecommendationOut
from app.services.explain_ai import explain_supplier

router = APIRouter(prefix="/queries", tags=["suppliers"])


@router.get("/{query_id}/suppliers", response_model=list[SupplierRecommendationOut])
def list_supplier_recos(query_id: int, db: Session = Depends(get_db)):
    """query_id에 해당하는 기업 추천을 rank 오름차순으로 반환 (기업 정보 포함)."""
    country_reco_exists = db.execute(
        select(ProcurementRecommendation.id)
        .where(ProcurementRecommendation.query_id == query_id)
        .limit(1)
    ).first()
    if country_reco_exists is None:
        return []
    stmt = (
        select(SupplierRecommendation)
        .where(SupplierRecommendation.query_id == query_id)
        .order_by(SupplierRecommendation.rank)
    )
    return db.execute(stmt).scalars().all()


@router.get("/{query_id}/suppliers/{company_id}/explain")
def explain_supplier_reco(query_id: int, company_id: int, db: Session = Depends(get_db)):
    """이 기업을 추천한 이유를 AI(Gemini)가 단가·납기·품질 근거로 상세히 설명한다."""
    country_reco_exists = db.execute(
        select(ProcurementRecommendation.id)
        .where(ProcurementRecommendation.query_id == query_id)
        .limit(1)
    ).first()
    if country_reco_exists is None:
        raise HTTPException(status_code=409, detail="country risk analysis is required first")
    reco = db.execute(
        select(SupplierRecommendation).where(
            SupplierRecommendation.query_id == query_id,
            SupplierRecommendation.company_id == company_id,
        )
    ).scalars().first()
    if reco is None:
        raise HTTPException(status_code=404, detail="recommendation not found")
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="company not found")
    query = db.get(UserQuery, query_id)
    item_name = (query.item_name if query else None) or "해당 품목"
    company_dict = {
        "name": company.name, "country_code": company.country_code,
        "unit_price": company.unit_price, "lead_time_days": company.lead_time_days,
        "on_time_delivery_rate": company.on_time_delivery_rate,
        "defect_rate_pct": company.defect_rate_pct,
        "certifications": company.certifications or [],
    }
    reco_dict = {"rank": reco.rank, "fit_score": reco.fit_score}
    return explain_supplier(
        item_name, company_dict, reco_dict,
        target_price=query.target_price if query else None,
        desired_lead=query.lead_time_days if query else None,
    )
