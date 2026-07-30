"""
조달 검토 워크스페이스 ORM.
  ReviewBoard : 검토 보드   ReviewItem : 보드 카드(국가·기업·메모)
"""
from datetime import datetime

from sqlalchemy import BigInteger, Integer, String, Text, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ReviewBoard(Base):
    __tablename__ = "review_boards"

    board_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger)
    query_id: Mapped[int | None] = mapped_column(BigInteger)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
    updated_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))


class ReviewItem(Base):
    __tablename__ = "review_items"

    item_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    board_id: Mapped[int] = mapped_column(BigInteger)
    kind: Mapped[str] = mapped_column(String(20))        # country | company | note
    ref_code: Mapped[str | None] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    memo: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(String(20))  # candidate|reviewing|selected|rejected
    position: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
    updated_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=False))
