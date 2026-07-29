"""
추천 피드백 요청/응답 스키마.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FeedbackCreate(BaseModel):
    """POST /feedback 요청. 어떤 추천(country/supplier)에 대한 👍/👎."""
    reco_type: str = Field(examples=["country"])          # country / supplier
    reco_id: int = Field(examples=[1])
    rating: int | None = Field(default=None, examples=[1])  # 1=👍 / -1=👎
    comment: str | None = None


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    feedback_id: int
    user_id: int | None = None
    reco_type: str
    reco_id: int
    rating: int | None = None
    comment: str | None = None
    created_at: datetime | None = None
