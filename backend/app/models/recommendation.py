"""
procurement_recommendations 테이블 ORM 매핑 (국가 추천 결과).
※ 원래 추천 엔진이 채우는 테이블. API는 조회만 한다.
"""
from datetime import datetime

from sqlalchemy import BigInteger, Integer, Numeric, String, Text, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ProcurementRecommendation(Base):
    __tablename__ = "procurement_recommendations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    query_id: Mapped[int] = mapped_column(BigInteger)
    country_code: Mapped[str] = mapped_column(String(2))
    rank: Mapped[int] = mapped_column(Integer)
    sgri_score: Mapped[float | None] = mapped_column(Numeric(6, 3))
    fit_score: Mapped[float | None] = mapped_column(Numeric(6, 3))
    est_unit_price: Mapped[float | None] = mapped_column(Numeric(18, 4))
    tariff_percent: Mapped[float | None] = mapped_column(Numeric(6, 3))
    est_lead_days: Mapped[int | None] = mapped_column(Integer)
    rationale: Mapped[str | None] = mapped_column(Text)  # LLM 추천 근거
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
