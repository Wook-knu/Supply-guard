"""
recommendation_feedback 테이블 ORM 매핑 (추천에 대한 사용자 피드백, 요구사항 11).
국가/기업 추천 모두에 달 수 있게 (reco_type, reco_id) polymorphic 구조.
"""
from datetime import datetime

from sqlalchemy import BigInteger, SmallInteger, String, Text, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class RecommendationFeedback(Base):
    __tablename__ = "recommendation_feedback"

    feedback_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(BigInteger)      # 로그인 시 자동 기록
    reco_type: Mapped[str] = mapped_column(String(20))           # 'country' / 'supplier'
    reco_id: Mapped[int] = mapped_column(BigInteger)             # 해당 추천 행 id
    rating: Mapped[int | None] = mapped_column(SmallInteger)     # 1=👍 / -1=👎
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime | None] = mapped_column(TIMESTAMP(timezone=True))
