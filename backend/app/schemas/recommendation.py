"""
국가 추천 조회 응답 스키마.
"""
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class RecommendationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)  # ORM 객체 → JSON 변환 스위치

    country_code: str
    rank: int
    sgri_score: Decimal | None = None
    # 6지표 (비교·설명용) — S수급 C집중도 V가격 L물류 P정책 E ESG
    score_s: Decimal | None = None
    score_c: Decimal | None = None
    score_v: Decimal | None = None
    score_l: Decimal | None = None
    score_p: Decimal | None = None
    score_e: Decimal | None = None
    fit_score: Decimal | None = None
    est_unit_price: Decimal | None = None
    tariff_percent: Decimal | None = None
    est_lead_days: int | None = None
    rationale: str | None = None
