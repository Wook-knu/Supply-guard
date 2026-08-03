"""
기업 추천 조회 라우터 (F-07/F-08, 프론트 suppliers 화면).
- GET /queries/{query_id}/suppliers : 특정 질의의 기업 추천 목록(순위순, 기업정보 포함)
※ recommendations.py와 구조 같음. 다른 점: 응답에 company(기업정보)가 중첩된다.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.company import Company
from app.models.query import UserQuery
from app.models.supplier_recommendation import SupplierRecommendation
from app.models.user import User
from app.schemas.supplier import SupplierRecommendationOut
from app.services.explain_ai import explain_supplier

router = APIRouter(prefix="/queries", tags=["suppliers"])


@router.get("/{query_id}/suppliers", response_model=list[SupplierRecommendationOut])
def list_supplier_recos(query_id: int, db: Session = Depends(get_db)):
    """query_id에 해당하는 기업 추천을 rank 오름차순으로 반환 (기업 정보 포함)."""
    stmt = (
        select(SupplierRecommendation)
        .where(SupplierRecommendation.query_id == query_id)
        .order_by(SupplierRecommendation.rank)
    )
    return db.execute(stmt).scalars().all()


class AiCompanyRequest(BaseModel):
    country_code: str  # AI 기업을 생성·추천할 국가(ISO2)


_LEVEL = lambda s: "높음" if s >= 50 else "중간" if s >= 25 else "낮음"  # noqa: E731


@router.post("/{query_id}/suppliers/ai", response_model=list[SupplierRecommendationOut])
def generate_ai_suppliers(
    query_id: int,
    payload: AiCompanyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """지정 국가에 대해 Gemini로 기업 후보를 생성하고 이 질의의 기업 추천에 추가한다.
    회사 DB에 그 국가 기업이 없어도 AI가 실제 기업 후보를 만들어 준다. (본인 질의만)"""
    query = db.get(UserQuery, query_id)
    if query is None or query.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="query not found")
    if not query.hs_code:
        raise HTTPException(status_code=400, detail="이 품목은 HS 코드가 없어 AI 추천이 불가합니다.")
    cc = payload.country_code.strip().upper()[:2]
    if len(cc) != 2:
        raise HTTPException(status_code=400, detail="국가 코드가 올바르지 않습니다.")

    # 1) Gemini로 해당 국가 기업 후보 생성 → companies 저장
    from app.services.company_ai import generate_ai_companies
    generate_ai_companies(db, query.hs_code, query.item_name or "", [cc])

    # 2) 이 품목 + 국가의 기업들을 이 질의의 추천으로 편입(중복 제외)
    companies = db.execute(
        select(Company).where(
            Company.hs_codes.contains([query.hs_code]), Company.country_code == cc
        )
    ).scalars().all()
    if not companies:
        raise HTTPException(status_code=502, detail="AI가 이 국가의 기업을 찾지 못했습니다. 잠시 후 다시 시도해 주세요.")

    existing_ids = set(db.execute(
        select(SupplierRecommendation.company_id).where(SupplierRecommendation.query_id == query_id)
    ).scalars().all())
    max_rank = db.execute(
        select(func.coalesce(func.max(SupplierRecommendation.rank), 0)).where(SupplierRecommendation.query_id == query_id)
    ).scalar() or 0

    # 국가 SGRI가 있으면 적합도 반영, 없으면 중립값.
    sgri_row = db.execute(text(
        "SELECT sgri_score FROM country_risk_scores WHERE hs_code = :h AND country_code = :c "
        "ORDER BY as_of_date DESC LIMIT 1"
    ), {"h": query.hs_code, "c": cc}).scalar()
    sgri = float(sgri_row) if sgri_row is not None else 45.0
    fit = round(100 - sgri, 1)

    added = 0
    for c in companies:
        if c.company_id in existing_ids:
            continue
        max_rank += 1
        certs = ", ".join(c.certifications or []) or "인증 정보 없음"
        db.add(SupplierRecommendation(
            query_id=query_id, company_id=c.company_id, rank=max_rank,
            fit_score=fit, delivery_feasibility=_LEVEL(100 - sgri),
            rationale=f"AI 추천 · {cc} 소재 기업. 보유 인증: {certs}.",
        ))
        added += 1
    db.commit()

    return db.execute(
        select(SupplierRecommendation).where(SupplierRecommendation.query_id == query_id).order_by(SupplierRecommendation.rank)
    ).scalars().all()


@router.get("/{query_id}/suppliers/{company_id}/explain")
def explain_supplier_reco(query_id: int, company_id: int, db: Session = Depends(get_db)):
    """이 기업을 추천한 이유를 AI(Gemini)가 단가·납기·품질 근거로 상세히 설명한다."""
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
