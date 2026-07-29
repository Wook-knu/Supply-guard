"""
country_risk_scores 테이블 ORM 매핑 (국가별 SGRI 종합점수).
※ 이 테이블은 원래 database/ 배치(calc_sgri.sql)가 채운다. API는 조회만 한다.
"""
from datetime import date, datetime

from sqlalchemy import BigInteger, Date, Numeric, String, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class CountryRiskScore(Base):
    __tablename__ = "country_risk_scores"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    country_code: Mapped[str] = mapped_column(String(2))
    hs_code: Mapped[str | None] = mapped_column(String(10))
    as_of_date: Mapped[date] = mapped_column(Date)
    score_s: Mapped[float | None] = mapped_column(Numeric(6, 3))  # 수급 불안정
    score_c: Mapped[float | None] = mapped_column(Numeric(6, 3))  # 집중도
    score_v: Mapped[float | None] = mapped_column(Numeric(6, 3))  # 가격 변동
    score_l: Mapped[float | None] = mapped_column(Numeric(6, 3))  # 물류
    score_p: Mapped[float | None] = mapped_column(Numeric(6, 3))  # 정책
    score_e: Mapped[float | None] = mapped_column(Numeric(6, 3))  # ESG
    sgri_score: Mapped[float] = mapped_column(Numeric(6, 3))      # 종합
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
