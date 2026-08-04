"""
벤치마크 라우터.
- GET /benchmark/{hs_code}[?country_code=CN]
  : 이 품목의 6지표가 전체 품목 평균 대비 어디인지 + (선택)국가 상대 위치.
※ 정직한 데이터 기반(우리 SGRI 데이터셋 내 상대 위치). 경쟁사 사례를 지어내지 않음.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.services.benchmark import compute_benchmark, compute_supplier_benchmark
from app.services.peer_cases import build_peer_cases
from app.services.real_cases import build_real_cases

router = APIRouter(prefix="/benchmark", tags=["benchmark"])


@router.get("/peer-cases/{hs_code}")
def get_peer_cases(hs_code: str, db: Session = Depends(get_db)):
    """또래 중소기업 '예시 사례'(AI 생성, 실거래 아님) — 이 품목 조달 시나리오."""
    return build_peer_cases(db, hs_code)


@router.get("/real-news/{hs_code}")
def get_real_news(hs_code: str, db: Session = Depends(get_db)):
    """이 품목 공급망 관련 '실제 뉴스'(GDELT, 출처·URL 포함)."""
    return build_real_cases(db, hs_code)


@router.get("/item/{hs_code}")
def get_item_benchmark(
    hs_code: str,
    country_code: str | None = Query(default=None, description="국가 상대 위치(선택)"),
    db: Session = Depends(get_db),
):
    """품목/국가 벤치마크 (SGRI 기준) — 6지표 vs 전체 평균 + 국가 percentile."""
    return compute_benchmark(db, hs_code, country_code)


@router.get("/supplier/{query_id}/{company_id}")
def get_supplier_benchmark(query_id: int, company_id: int, db: Session = Depends(get_db)):
    """기업 벤치마크 (조달지표 기준, SGRI 아님) — 후보 공급사 대비 단가·납기·품질 상대 위치."""
    return compute_supplier_benchmark(db, query_id, company_id)
