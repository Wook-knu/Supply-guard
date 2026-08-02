from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.alert_setting import AlertSetting
from app.models.user import User
from app.schemas.alert_setting import AlertSettingOut, AlertSettingPayload

router = APIRouter(prefix="/alert-settings", tags=["alert-settings"])


@router.get("", response_model=AlertSettingOut)
def get_alert_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.get(AlertSetting, current_user.user_id)
    if row is None:
        row = AlertSetting(user_id=current_user.user_id)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.put("", response_model=AlertSettingOut)
def save_alert_settings(payload: AlertSettingPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    row = db.get(AlertSetting, current_user.user_id) or AlertSetting(user_id=current_user.user_id)
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
