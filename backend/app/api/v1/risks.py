"""
국가별 SGRI 위험도 조회 라우터 (F-05, 프론트 risks / dashboard 화면).
- GET /risks                         : 전체 (SGRI 높은 순)
- GET /risks?hs_code=283691          : 특정 품목
- GET /risks?hs_code=283691&country=CL : 특정 품목·국가
※ queries.py 를 복사해 만든 '조회 전용' 라우터 패턴.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.risk import CountryRiskScore
from app.schemas.risk import RiskScoreOut

router = APIRouter(prefix="/risks", tags=["risks"])


@router.get("", response_model=list[RiskScoreOut])
def list_risks(
    hs_code: str | None = Query(default=None, description="HS 코드로 필터"),
    country: str | None = Query(default=None, description="국가코드(ISO2)로 필터"),
    db: Session = Depends(get_db),
):
    """조건에 맞는 국가별 SGRI 점수를 위험도 높은 순으로 반환."""
    stmt = select(CountryRiskScore)
    if hs_code:
        stmt = stmt.where(CountryRiskScore.hs_code == hs_code)
    if country:
        stmt = stmt.where(CountryRiskScore.country_code == country)
    stmt = stmt.order_by(CountryRiskScore.sgri_score.desc())
    return db.execute(stmt).scalars().all()
