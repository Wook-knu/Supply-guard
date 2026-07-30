"""
기업 상세 조회 라우터 (프론트 suppliers/{id} 공급사 상세 화면).
- GET /companies/{company_id} : 기업 공개 정보 + 조달 참고 지표 1건
※ 추천의 적합도(fit_score)는 질의별이라 여기 없음 — 상세 화면은 회사 고정정보를 보여준다.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.company import Company
from app.schemas.company import CompanyDetailOut

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("/{company_id}", response_model=CompanyDetailOut)
def get_company(company_id: int, db: Session = Depends(get_db)):
    """company_id로 기업 공개 정보를 조회한다. 없으면 404."""
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="company not found")
    return company
