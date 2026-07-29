"""
품목 조달 질의(user_queries)의 요청/응답 스키마.
이 Pydantic 클래스들이 곧 API 계약(OpenAPI)이 된다.
"""
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class QueryCreate(BaseModel):
    """POST /queries 요청 본문 (거래 희망 품목 입력, F-01).
    ※ user_id는 클라이언트가 보내지 않는다. 나중에 로그인 토큰에서 서버가 채운다."""
    item_name: str | None = Field(default=None, examples=["리튬 탄산염"])
    hs_code: str | None = Field(default=None, examples=["283691"])
    required_qty: Decimal | None = Field(default=None, examples=[100000])
    qty_unit: str | None = Field(default=None, examples=["kg"])
    target_price: Decimal | None = Field(default=None, examples=[19])
    lead_time_days: int | None = Field(default=None, examples=[60])
    importer_code: str | None = Field(default=None, examples=["KR"])


class QueryOut(QueryCreate):
    """질의 응답 (DB에 저장된 뒤 돌려주는 형태)."""
    model_config = ConfigDict(from_attributes=True)

    query_id: int
    user_id: int | None = None
    created_at: datetime | None = None
