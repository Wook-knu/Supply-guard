"""
기업 상세 조회 응답 스키마 (공급사 상세 화면 /suppliers/{id}).
"""
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class CompanyDetailOut(BaseModel):
    """기업 공개 정보 + 조달 참고 지표."""
    model_config = ConfigDict(from_attributes=True)

    company_id: int
    name: str
    name_en: str | None = None
    country_code: str | None = None
    company_type: str | None = None
    website: str | None = None
    hs_codes: list[str] | None = None
    certifications: list[str] | None = None
    annual_capacity: Decimal | None = None
    capacity_unit: str | None = None
    status: str | None = None
    unit_price: Decimal | None = None
    available_quantity: Decimal | None = None
    lead_time_days: int | None = None
    on_time_delivery_rate: Decimal | None = None
    defect_rate_pct: Decimal | None = None
