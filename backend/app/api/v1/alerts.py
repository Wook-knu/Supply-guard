"""
위험 알림 라우터 (F-10, 프론트 alerts 화면).
- GET   /alerts                 : 알림 목록 (query_id / 미읽음 필터)
- PATCH /alerts/{id}/read        : 알림을 '읽음'으로 표시
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.alert import Alert
from app.models.user import User
from app.schemas.alert import AlertOut

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=list[AlertOut])
def list_alerts(
    query_id: int | None = Query(default=None, description="질의별 필터"),
    unread_only: bool = Query(default=False, description="미읽음만 보기"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 로그인 사용자의 알림 목록을 최신순으로 반환."""
    stmt = select(Alert).where(Alert.user_id == current_user.user_id)
    if query_id:
        stmt = stmt.where(Alert.query_id == query_id)
    if unread_only:
        stmt = stmt.where(Alert.is_read.is_(False))
    stmt = stmt.order_by(Alert.alert_id.desc())
    return db.execute(stmt).scalars().all()


@router.patch("/{alert_id}/read", response_model=AlertOut)
def mark_alert_read(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """알림 하나를 읽음(is_read=true)으로 바꾼다 (본인 것만)."""
    alert = db.get(Alert, alert_id)
    if alert is None or alert.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="alert not found")
    alert.is_read = True
    db.commit()
    db.refresh(alert)
    return alert
