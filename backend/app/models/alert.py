"""
alerts 테이블 ORM 매핑 (위험 알림).
"""
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, String, Text, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Alert(Base):
    __tablename__ = "alerts"

    alert_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger)
    query_id: Mapped[int | None] = mapped_column(BigInteger)
    country_code: Mapped[str | None] = mapped_column(String(2))
    hs_code: Mapped[str | None] = mapped_column(String(10))
    alert_type: Mapped[str | None] = mapped_column(String(30))   # 납기지연/가격급등/정책위험/재해
    severity: Mapped[str | None] = mapped_column(String(10))      # high/medium/low
    title: Mapped[str | None] = mapped_column(String(255))
    message: Mapped[str | None] = mapped_column(Text)
    is_read: Mapped[bool | None] = mapped_column(Boolean)
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
