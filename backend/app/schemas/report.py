"""
보고서 생성 요청 / 조회 응답 스키마.
"""
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ReportCreate(BaseModel):
    """POST /reports 요청 본문. 어떤 질의에 대한 보고서인지 + 제목(선택)."""
    query_id: int | None = Field(default=None, examples=[2])
    title: str | None = Field(default=None, examples=["리튬 탄산염 공급망 리스크 보고서"])


class ReportUpdate(BaseModel):
    """보고서 초안 편집 요청."""
    title: str | None = None
    status: str | None = None
    sections: Any = None
    summary: str | None = None


class ReportOut(BaseModel):
    """보고서 조회 응답."""
    model_config = ConfigDict(from_attributes=True)

    report_id: int
    query_id: int | None = None
    title: str | None = None
    status: str | None = None
    sections: Any = None  # 목차: dict 또는 [{id,title,body}] 리스트 모두 허용
    summary: str | None = None
    pdf_url: str | None = None
    created_at: datetime | None = None
