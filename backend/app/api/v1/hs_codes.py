"""
HS 코드 검색 라우터 (품목 등록 자동완성용).
- GET /hs-codes?q=리튬  : 이름(한/영)·코드 부분일치로 검색
"""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import get_db

router = APIRouter(prefix="/hs-codes", tags=["hs-codes"])


class HsCodeOut(BaseModel):
    hs_code: str
    name_ko: str | None = None
    name_en: str | None = None


@router.get("", response_model=list[HsCodeOut])
def search_hs_codes(
    q: str = Query(default="", description="품목명(한/영) 또는 HS 코드 부분검색"),
    limit: int = Query(default=10, le=30),
    db: Session = Depends(get_db),
):
    """품목명·코드로 HS 코드를 검색한다(자동완성). 코드 시작 일치 > 이름 포함 순."""
    q = q.strip()
    if not q:
        return []
    like = f"%{q}%"
    rows = db.execute(text(
        "SELECT hs_code, name_ko, name_en FROM hs_codes "
        "WHERE hs_code LIKE :pre OR name_ko ILIKE :like OR name_en ILIKE :like "
        "ORDER BY (hs_code LIKE :pre) DESC, length(hs_code), hs_code "
        "LIMIT :lim"
    ), {"pre": f"{q}%", "like": like, "lim": limit}).mappings().all()
    return [dict(r) for r in rows]
