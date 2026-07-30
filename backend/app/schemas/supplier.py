"""
기업 추천 조회 응답 스키마.
추천 결과(순위·근거) 안에 기업 정보(company)를 중첩(nested)해서 함께 내보낸다.
"""
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class CompanyOut(BaseModel):
    """추천에 딸려 나가는 기업 정보."""
    model_config = ConfigDict(from_attributes=True)

    company_id: int
    name: str
    country_code: str | None = None
    certifications: list[str] | None = None
    annual_capacity: Decimal | None = None
    capacity_unit: str | None = None
    status: str | None = None
    # 비교·설명용 조달 지표
    unit_price: Decimal | None = None
    lead_time_days: int | None = None
    on_time_delivery_rate: Decimal | None = None
    defect_rate_pct: Decimal | None = None


class SupplierRecommendationOut(BaseModel):
    """기업 추천 한 건 (+ 중첩된 company)."""
    model_config = ConfigDict(from_attributes=True)

    rank: int
    fit_score: Decimal | None = None
    est_unit_price: Decimal | None = None
    est_lead_days: int | None = None
    delivery_feasibility: str | None = None
    rationale: str | None = None
    company: CompanyOut   # ← 중첩: relationship으로 가져온 기업 정보가 여기 들어감
