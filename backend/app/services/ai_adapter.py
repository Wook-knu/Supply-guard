"""
AI_Model(supplyguard_sgri) 연동 어댑터.

역할:
  - 우리 DB(user_queries, companies) → 모델 입력(JSON)으로 변환
  - analyze_procurement() 호출
  - 모델 응답 → 우리 DB(supplier_recommendations, reports)로 저장

※ 국가 추천(procurement_recommendations)은 규칙 엔진 담당(결정 #4). 여기선 안 건드림.
※ AI_Model은 표준 라이브러리만 쓰므로 sys.path만 잡아주면 import된다.
"""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

# AI_Model 패키지를 import 경로에 추가 (repo_root/AI_Model)
_AI_MODEL = Path(__file__).resolve().parents[3] / "AI_Model"
if str(_AI_MODEL) not in sys.path:
    sys.path.insert(0, str(_AI_MODEL))

from supplyguard_sgri import analyze_procurement  # noqa: E402

from app.models.company import Company
from app.models.query import UserQuery
from app.models.report import Report
from app.models.supplier_recommendation import SupplierRecommendation


# ── 입력 변환 ────────────────────────────────────────────────────────────
def query_to_request(query: UserQuery) -> dict:
    """user_queries 한 건 → 모델 request JSON (결정 #1·#2 반영)."""
    # delivery_date = 오늘 + lead_time_days (없으면 90일 기본)
    lead = query.lead_time_days if query.lead_time_days and query.lead_time_days > 0 else 90
    delivery_date = (date.today() + timedelta(days=lead)).isoformat()

    target_price = int(round(float(query.target_price))) if query.target_price else 1
    quantity = float(query.required_qty) if query.required_qty else 1

    return {
        "procurement": {
            "hs_code": query.hs_code,
            "item_name": query.item_name or "미상 품목",
            "quantity": quantity,
            "target_price": max(1, target_price),
            "delivery_date": delivery_date,
            "quality_certification": "없음",  # 결정 #2: 기본 '없음'
        }
    }


def companies_to_candidates(companies: list[Company]) -> list[dict]:
    """companies → 모델 candidate 스키마. 우리에 없는 필드(단가·납기 등)는 null."""
    return [
        {
            "company_id": str(c.company_id),
            "company_name": c.name,
            "country": c.country_code,
            "business_type": c.company_type,
            "hs_codes": c.hs_codes or [],
            "certifications": c.certifications or [],
            "verified": c.status == "active",
            "source_urls": [],
        }
        for c in companies
    ]


# ── 응답 저장 ────────────────────────────────────────────────────────────
def _feasibility(score: float) -> str:
    if score >= 80:
        return "높음"
    if score >= 50:
        return "중간"
    return "낮음"


def _store_response(db: Session, query: UserQuery, resp: dict) -> dict:
    """모델 응답을 supplier_recommendations + reports 에 저장."""
    # 1) 기업 추천 교체 (기존 것 삭제 후 AI 결과 삽입)
    db.execute(delete(SupplierRecommendation).where(SupplierRecommendation.query_id == query.query_id))
    recs = resp.get("company_recommendations", {}).get("recommendations", [])
    for r in recs:
        evidence = "; ".join(
            f"{e.get('label')}: {e.get('value')}" for e in (r.get("evidence") or [])
        )
        rationale = r.get("rationale") or ""
        if evidence:
            rationale = f"{rationale} (근거: {evidence})"
        match = float(r.get("match_score") or 0)
        db.add(SupplierRecommendation(
            query_id=query.query_id,
            company_id=int(r["company_id"]),
            rank=r.get("rank"),
            fit_score=round(match, 1),
            delivery_feasibility=_feasibility(match),
            rationale=rationale,
        ))

    # 2) 보고서 저장 (report_draft → reports)
    rd = resp.get("report_draft", {})
    ra = resp.get("risk_assessment", {})
    summary = f"SGRI {ra.get('score')}점 ({ra.get('level_ko') or ra.get('level')})"
    report = Report(
        query_id=query.query_id,
        user_id=query.user_id,
        title=rd.get("title") or "공급망 리스크 분석 보고서",
        status=rd.get("status") or "draft",
        sections=rd.get("sections"),   # 리스트 [{id,title,body}] 그대로 JSONB 저장
        summary=summary,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "query_id": query.query_id,
        "sgri_score": ra.get("score"),
        "level": ra.get("level_ko") or ra.get("level"),
        "report_id": report.report_id,
        "supplier_count": len(recs),
    }


# ── 진입점 ──────────────────────────────────────────────────────────────
def run_ai_analysis(db: Session, query: UserQuery) -> dict:
    """query에 대해 AI_Model 분석을 실행하고 결과를 DB에 저장. 요약을 반환."""
    if not query.hs_code:
        return {"query_id": query.query_id, "error": "hs_code 없음 - 분석 불가"}

    # 후보기업: 해당 품목을 취급하는 companies
    companies = db.execute(
        select(Company).where(Company.hs_codes.contains([query.hs_code]))
    ).scalars().all()

    request = query_to_request(query)
    candidates = companies_to_candidates(companies)

    resp = analyze_procurement(request, candidate_companies=candidates, use_live_apis=False)
    resp = json.loads(resp) if isinstance(resp, str) else resp

    return _store_response(db, query, resp)
