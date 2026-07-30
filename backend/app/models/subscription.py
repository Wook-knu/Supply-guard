"""
subscriptions 테이블 ORM (구독 변경 이력).
"""
from datetime import datetime

from sqlalchemy import BigInteger, Integer, String, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Subscription(Base):
    __tablename__ = "subscriptions"

    subscription_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger)
    plan: Mapped[str] = mapped_column(String(20))
    price_krw: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(String(20))
    started_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
    note: Mapped[str | None] = mapped_column(String(200))
