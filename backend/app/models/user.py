"""
users 테이블 ORM 매핑 (로그인 사용자).
"""
from datetime import datetime

from sqlalchemy import BigInteger, String, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class User(Base):
    __tablename__ = "users"

    user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    google_sub: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str] = mapped_column(String(255))
    name: Mapped[str | None] = mapped_column(String(100))
    picture_url: Mapped[str | None] = mapped_column(String(500))
    company_id: Mapped[int | None] = mapped_column(BigInteger)
    role: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
    last_login_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
