"""
조달 검토 워크스페이스 요청/응답 스키마.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

BoardStatus = Literal["candidate", "reviewing", "selected", "rejected"]
ItemKind = Literal["country", "company", "note"]


# ── 보드 ──
class BoardCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    query_id: int | None = None


class BoardUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
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
    kind: ItemKind
    title: str = Field(min_length=1, max_length=200)
    ref_code: str | None = None     # country_code 또는 company_id
    memo: str | None = None
    status: BoardStatus = "candidate"


class ItemUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    memo: str | None = None
    status: BoardStatus | None = None
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
