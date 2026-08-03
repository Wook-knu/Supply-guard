"""
user_queries 테이블 ORM 매핑.
※ 테이블 자체는 database/ 의 SQL(스키마 v2 + v3)로 이미 생성돼 있다.
  여기서는 그 테이블에 '연결'만 한다 (테이블을 새로 만들지 않음).
"""
from datetime import datetime

from sqlalchemy import BigInteger, Integer, Numeric, String, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class UserQuery(Base):
    __tablename__ = "user_queries"

    query_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)  # v3에서 추가된 컬럼
    item_name: Mapped[str | None] = mapped_column(String(255))
    hs_code: Mapped[str | None] = mapped_column(String(10))
    required_qty: Mapped[float | None] = mapped_column(Numeric(18, 3))
    qty_unit: Mapped[str | None] = mapped_column(String(20))
    target_price: Mapped[float | None] = mapped_column(Numeric(18, 2))
    lead_time_days: Mapped[int | None] = mapped_column(Integer)
    importer_code: Mapped[str | None] = mapped_column(String(2))
    origin_country: Mapped[str | None] = mapped_column(String(100))  # 현재 거래 중인 공급국(콤마구분, 선택)
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
