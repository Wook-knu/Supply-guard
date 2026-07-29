"""
품목 SGRI 빌드 라우터 (품목 일반화).
- POST /items/{hs_code}/build-sgri : 임의 품목의 SGRI를 구축 (Comtrade 수집 + 계산)
※ 무거운 작업(Comtrade 다년치 수집). 로그인 필수.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.services.pipeline import build_item_sgri

router = APIRouter(prefix="/items", tags=["pipeline"])


@router.post("/{hs_code}/build-sgri")
def build_item(
    hs_code: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """해당 HS 코드의 SGRI를 구축한다. 완료 후 국가 추천이 가능해진다."""
    return build_item_sgri(db, hs_code)
