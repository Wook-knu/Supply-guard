"""
companies 테이블 ORM 매핑 (기업 고정정보).
"""
from sqlalchemy import BigInteger, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Company(Base):
    __tablename__ = "companies"

    company_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    name_en: Mapped[str | None] = mapped_column(String(255))
    country_code: Mapped[str | None] = mapped_column(String(2))
    company_type: Mapped[str | None] = mapped_column(String(20))
    website: Mapped[str | None] = mapped_column(String(500))
    hs_codes: Mapped[list | None] = mapped_column(JSONB)          # 취급 품목 배열
    certifications: Mapped[list | None] = mapped_column(JSONB)    # 보유 인증 배열
    annual_capacity: Mapped[float | None] = mapped_column(Numeric(20, 2))
    capacity_unit: Mapped[str | None] = mapped_column(String(20))
    status: Mapped[str | None] = mapped_column(String(20))
    # 조달/추천용 (migrate_companies_procurement.sql 로 추가)
    unit_price: Mapped[float | None] = mapped_column(Numeric(18, 4))
    available_quantity: Mapped[float | None] = mapped_column(Numeric(20, 2))
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    on_time_delivery_rate: Mapped[float | None] = mapped_column(Numeric(5, 2))
    defect_rate_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
