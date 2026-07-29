"""
알림 조회 응답 스키마.
"""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AlertOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    alert_id: int
    query_id: int | None = None
    country_code: str | None = None
    hs_code: str | None = None
    alert_type: str | None = None
    severity: str | None = None
    title: str | None = None
    message: str | None = None
    is_read: bool | None = None
    created_at: datetime | None = None
