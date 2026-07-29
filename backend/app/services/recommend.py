"""
규칙 기반 추천 엔진 (LLM 없이 데이터만으로).

동작:
  1) 품목(hs_code)의 국가별 SGRI(country_risk_scores)를 낮은(안전한) 순으로 랭킹
     → procurement_recommendations (국가 추천) 생성
  2) 그 품목을 취급하는 기업(companies)을 소속국 SGRI 기준으로 랭킹
     → supplier_recommendations (기업 추천) 생성

나중에 LLM을 붙이면 rationale(추천 근거)만 이 엔진 결과 위에 덮어쓰면 된다.
"""
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models.company import Company
from app.models.query import UserQuery
from app.models.recommendation import ProcurementRecommendation
from app.models.risk import CountryRiskScore
from app.models.supplier_recommendation import SupplierRecommendation


def _level(sgri: float) -> str:
    """SGRI 점수를 위험 수준 라벨로."""
    if sgri >= 50:
        return "높음"
    if sgri >= 25:
        return "중간"
    return "낮음"


def generate_recommendations(db: Session, query: UserQuery) -> int:
    """query에 대한 국가·기업 추천을 (재)생성한다. 생성한 국가 추천 수를 반환."""
    if not query.hs_code:
        return 0

    # 기존 추천 삭제 (재분석 대비)
    db.execute(delete(ProcurementRecommendation).where(ProcurementRecommendation.query_id == query.query_id))
    db.execute(delete(SupplierRecommendation).where(SupplierRecommendation.query_id == query.query_id))

    # 1) 해당 품목의 국가별 SGRI
    risks = db.execute(
        select(CountryRiskScore).where(CountryRiskScore.hs_code == query.hs_code)
    ).scalars().all()
    if not risks:
        db.commit()
        return 0

    # SGRI 낮은(안전한) 순 정렬 → 순위 부여
    risks.sort(key=lambda r: float(r.sgri_score))
    sgri_by_country: dict[str, float] = {}
    for rank, r in enumerate(risks, start=1):
        sgri = float(r.sgri_score)
        sgri_by_country[r.country_code] = sgri
        db.add(ProcurementRecommendation(
            query_id=query.query_id,
            country_code=r.country_code,
            rank=rank,
            sgri_score=r.sgri_score,
            score_s=r.score_s, score_c=r.score_c, score_v=r.score_v,
            score_l=r.score_l, score_p=r.score_p, score_e=r.score_e,
            fit_score=round(100 - sgri, 1),
            rationale=f"SGRI {sgri:.1f}점으로 위험 수준 {_level(sgri)}. 후보 국가 중 {rank}순위.",
        ))

    # 2) 해당 품목을 취급하는 기업 → 소속국 SGRI 기준 랭킹
    companies = db.execute(
        select(Company).where(Company.hs_codes.contains([query.hs_code]))
    ).scalars().all()
    ranked = sorted(
        [c for c in companies if c.country_code in sgri_by_country],
        key=lambda c: sgri_by_country[c.country_code],
    )
    for rank, c in enumerate(ranked, start=1):
        sgri = sgri_by_country[c.country_code]
        certs = ", ".join(c.certifications or []) or "인증 정보 없음"
        db.add(SupplierRecommendation(
            query_id=query.query_id,
            company_id=c.company_id,
            rank=rank,
            fit_score=round(100 - sgri, 1),
            delivery_feasibility=_level(100 - sgri),
            rationale=f"{c.country_code} 소재(SGRI {sgri:.1f}, {_level(sgri)} 위험). 보유 인증: {certs}.",
        ))

    db.commit()
    return len(risks)
