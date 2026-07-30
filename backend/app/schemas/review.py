"""
조달 검토 워크스페이스 요청/응답 스키마.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ── 보드 ──
class BoardCreate(BaseModel):
    title: str
    description: str | None = None
    query_id: int | None = None


class BoardUpdate(BaseModel):
    title: str | None = None
    description: str | None = None


class BoardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    board_id: int
    user_id: int | None = None
    query_id: int | None = None
    title: str
    description: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


# ── 카드 ──
class ItemCreate(BaseModel):
    kind: str                       # country | company | note
    title: str
    ref_code: str | None = None     # country_code 또는 company_id
    memo: str | None = None
    status: str | None = "candidate"


class ItemUpdate(BaseModel):
    title: str | None = None
    memo: str | None = None
    status: str | None = None       # candidate|reviewing|selected|rejected
    position: int | None = None


class ItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    item_id: int
    board_id: int
    kind: str
    ref_code: str | None = None
    title: str
    memo: str | None = None
    status: str | None = None
    position: int | None = None
    created_at: datetime | None = None


class BoardDetailOut(BoardOut):
    """보드 + 카드 목록."""
    items: list[ItemOut] = []
