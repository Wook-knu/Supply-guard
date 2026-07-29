"""
supplier_recommendations 테이블 ORM 매핑 (기업 추천 결과).
company_id로 companies와 연결(relationship)해, 조회 시 기업 정보를 함께 가져온다.
"""
from datetime import datetime

from sqlalchemy import BigInteger, ForeignKey, Integer, Numeric, String, Text, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base
from app.models.company import Company


class SupplierRecommendation(Base):
    __tablename__ = "supplier_recommendations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    query_id: Mapped[int] = mapped_column(BigInteger)
    company_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("companies.company_id"))
    rank: Mapped[int] = mapped_column(Integer)
    fit_score: Mapped[float | None] = mapped_column(Numeric(6, 3))
    est_unit_price: Mapped[float | None] = mapped_column(Numeric(18, 4))
    est_lead_days: Mapped[int | None] = mapped_column(Integer)
    delivery_feasibility: Mapped[str | None] = mapped_column(String(10))  # 높음/중간/낮음
    past_trade_summary: Mapped[str | None] = mapped_column(Text)
    rationale: Mapped[str | None] = mapped_column(Text)  # LLM 추천 근거
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))

    # company_id → companies 연결. 조회하면 .company 로 기업 정보 접근 가능.
    company: Mapped["Company"] = relationship()
