"""
기업 추천 조회 라우터 (F-07/F-08, 프론트 suppliers 화면).
- GET /queries/{query_id}/suppliers : 특정 질의의 기업 추천 목록(순위순, 기업정보 포함)
※ recommendations.py와 구조 같음. 다른 점: 응답에 company(기업정보)가 중첩된다.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.supplier_recommendation import SupplierRecommendation
from app.schemas.supplier import SupplierRecommendationOut

router = APIRouter(prefix="/queries", tags=["suppliers"])


@router.get("/{query_id}/suppliers", response_model=list[SupplierRecommendationOut])
def list_supplier_recos(query_id: int, db: Session = Depends(get_db)):
    """query_id에 해당하는 기업 추천을 rank 오름차순으로 반환 (기업 정보 포함)."""
    stmt = (
        select(SupplierRecommendation)
        .where(SupplierRecommendation.query_id == query_id)
        .order_by(SupplierRecommendation.rank)
    )
    return db.execute(stmt).scalars().all()
