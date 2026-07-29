"""
보고서 라우터 (F-09/F-10, 프론트 reports 화면).
- POST /reports            : 보고서 초안 생성 (목차 뼈대만, 내용은 나중에 LLM이 채움)
- GET  /reports            : 보고서 목록 (query_id로 필터 가능)
- GET  /reports/{id}       : 보고서 1건 조회
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user, get_current_user_optional
from app.models.report import Report
from app.models.user import User
from app.schemas.report import ReportCreate, ReportOut, ReportUpdate

router = APIRouter(prefix="/reports", tags=["reports"])

# 보고서 기본 목차(뼈대). 지금은 빈 값으로 생성하고, 나중에 LLM이 각 섹션을 채운다.
DEFAULT_SECTIONS = {
    "개요": "",
    "국가별 위험도(SGRI) 분석": "",
    "추천 조달국 및 근거": "",
    "추천 공급기업": "",
    "리스크 대응 방안": "",
}


@router.post("", response_model=ReportOut, status_code=201)
def create_report(
    payload: ReportCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """보고서 초안(draft)을 목차 뼈대와 함께 생성한다. 로그인 시 소유자로 기록."""
    report = Report(
        query_id=payload.query_id,
        user_id=current_user.user_id if current_user else None,
        title=payload.title or "공급망 리스크 분석 보고서",
        status="draft",
        sections=dict(DEFAULT_SECTIONS),  # 매번 새 복사본
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    return report


@router.get("", response_model=list[ReportOut])
def list_reports(
    query_id: int | None = Query(default=None, description="질의별 필터"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """현재 로그인 사용자의 보고서 목록을 최신순으로 반환."""
    stmt = select(Report).where(Report.user_id == current_user.user_id)
    if query_id:
        stmt = stmt.where(Report.query_id == query_id)
    stmt = stmt.order_by(Report.report_id.desc())
    return db.execute(stmt).scalars().all()


@router.get("/{report_id}", response_model=ReportOut)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """report_id로 보고서 1건을 조회한다 (본인 것만). 없거나 남의 것이면 404."""
    report = db.get(Report, report_id)
    if report is None or report.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="report not found")
    return report


@router.patch("/{report_id}", response_model=ReportOut)
def update_report(
    report_id: int,
    payload: ReportUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """보고서 제목과 본문, 상태를 수정한다 (본인 것만)."""
    report = db.get(Report, report_id)
    if report is None or report.user_id != current_user.user_id:
        raise HTTPException(status_code=404, detail="report not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(report, field, value)
    db.commit()
    db.refresh(report)
    return report
