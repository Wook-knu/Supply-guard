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

from sqlalchemy import delete, select, text
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
    def _num(v):
        return float(v) if v is not None else None

    return [
        {
            "company_id": str(c.company_id),
            "company_name": c.name,
            "country": c.country_code,
            "business_type": c.company_type,
            "hs_codes": c.hs_codes or [],
            "certifications": c.certifications or [],
            "unit_price": _num(c.unit_price),
            "available_quantity": _num(c.available_quantity),
            "lead_time_days": c.lead_time_days,
            "on_time_delivery_rate": _num(c.on_time_delivery_rate),
            "defect_rate_pct": _num(c.defect_rate_pct),
            "verified": c.status == "active",
            "source_urls": [],
        }
        for c in companies
    ]


# ── 우리 DB 기반 위험 결과 (보고서 일관성) ───────────────────────────────
# 6지표는 공식(SQL), 가중치는 제미나이 → 보고서도 이 값을 쓰게 해서
# 대시보드·리스크 페이지와 숫자가 어긋나지 않게 한다.
_KEY_COL = {"S": "score_s", "P": "score_p", "V": "score_v",
            "L": "score_l", "C": "score_c", "E": "score_e"}
_LABEL = {"S": "수급 불안정성", "P": "국가·정책 리스크", "V": "가격 변동성",
          "L": "물류 리스크", "C": "공급처 집중도", "E": "ESG·탄소규제"}
_BASE_W = {"S": 0.25, "P": 0.20, "V": 0.15, "L": 0.15, "C": 0.15, "E": 0.10}


def _level_ko(score: float) -> str:
    if score >= 50:
        return "높음"
    if score >= 25:
        return "중간"
    return "낮음"


def build_db_risk_result(db: Session, hs_code: str) -> dict | None:
    """country_risk_scores(실데이터 6지표 + 제미나이 가중치)로 보고서용 risk_result 생성.
    데이터가 없으면 None → 호출부가 AI_Model 자체 계산으로 폴백."""
    row = db.execute(text(
        "SELECT count(*) n, avg(score_s) s, avg(score_p) p, avg(score_v) v, "
        "avg(score_l) l, avg(score_c) c, avg(score_e) e, avg(sgri_score) sgri, "
        "count(score_s) cs, count(score_p) cp, count(score_v) cv, "
        "count(score_l) cl, count(score_c) cc, count(score_e) ce "
        "FROM country_risk_scores WHERE hs_code = :h"), {"h": hs_code}).one()
    if not row.n:
        return None

    avg_map = {"S": row.s, "P": row.p, "V": row.v, "L": row.l, "C": row.c, "E": row.e}
    cnt_map = {"S": row.cs, "P": row.cp, "V": row.cv, "L": row.cl, "C": row.cc, "E": row.ce}

    # 제미나이 가중치·근거 (reweight 시 저장됨) — 없으면 기본 가중치
    wj = db.execute(text(
        "SELECT weights_json FROM country_risk_scores "
        "WHERE hs_code = :h AND weights_json IS NOT NULL LIMIT 1"), {"h": hs_code}).scalar()
    weights = (wj or {}).get("effective_weights") or _BASE_W
    rationales = (wj or {}).get("rationales") or {}

    # 종합 점수 = 후보국 평균 지표의 가중합(있는 지표만 정규화) — 구성항목과 수식 일치
    num = den = 0.0
    for key in _KEY_COL:
        v = avg_map[key]
        if v is not None:
            num += float(v) * weights.get(key, 0)
            den += weights.get(key, 0)
    score = round(num / den, 1) if den else round(float(row.sgri or 0), 1)

    # 신뢰도 = 6지표 평균 데이터 커버리지(국가 대비 non-null 비율)
    coverage = sum(cnt_map[k] for k in _KEY_COL) / (row.n * 6) * 100
    confidence = round(coverage, 0)

    components = [
        {
            "key": key,
            "label": _LABEL[key],
            "score": round(float(avg_map[key]), 1) if avg_map[key] is not None else 0.0,
            "weight": round(weights.get(key, 0), 4),
            "weight_percent": round(weights.get(key, 0) * 100, 1),
            "weight_reason": rationales.get(key, "기준 가중치를 적용했습니다."),
            "reasons": [] if avg_map[key] is not None else ["데이터 미확보 — 평가 제외"],
        }
        for key in _KEY_COL
    ]

    top = max(components, key=lambda c: c["score"])
    recommendations = [
        f"가장 높은 위험은 {top['label']}({top['score']}점)입니다 — 우선 대응을 권장합니다.",
        "후보국 중 SGRI가 낮은 국가로 조달 다변화를 검토하세요.",
    ]
    if wj and wj.get("summary"):
        recommendations.insert(0, wj["summary"])

    return {
        "title": f"{hs_code} 공급망 리스크 평가",
        "score": score,
        "level": _level_ko(score),
        "level_ko": _level_ko(score),
        "confidence": confidence,
        "components": components,
        "recommendations": recommendations,
        "source": "supplyguard_db",  # 우리 DB 기반임을 표시
    }


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
def run_ai_analysis(db: Session, query: UserQuery, focus_country: str | None = None) -> dict:
    """query에 대해 AI_Model 분석을 실행하고 결과를 DB에 저장. 요약을 반환.
    focus_country(ISO2)가 오면 그 국가를 보고서 포커스(조달 대상 국가)로 반영한다."""
    if not query.hs_code:
        return {"query_id": query.query_id, "error": "hs_code 없음 - 분석 불가"}

    # 후보기업: 해당 품목을 취급하는 companies
    companies = db.execute(
        select(Company).where(Company.hs_codes.contains([query.hs_code]))
    ).scalars().all()
    # 기업이 없으면 보고서의 '대체 공급/기업' 섹션이 비므로 AI로 후보 생성(추천 화면과 동일).
    if not companies:
        try:
            from sqlalchemy import text as _text
            from app.services.company_ai import generate_ai_companies
            ccs = db.execute(_text(
                "SELECT DISTINCT country_code FROM country_risk_scores WHERE hs_code = :h LIMIT 12"
            ), {"h": query.hs_code}).scalars().all()
            if generate_ai_companies(db, query.hs_code, query.item_name or "", list(ccs)):
                companies = db.execute(
                    select(Company).where(Company.hs_codes.contains([query.hs_code]))
                ).scalars().all()
        except Exception:  # noqa: BLE001 - AI 폴백 실패해도 보고서는 국가 기준으로 생성
            pass

    request = query_to_request(query)
    # 포커스 국가가 지정되면 보고서가 그 국가 중심으로 쓰이도록 procurement에 반영.
    if focus_country:
        from sqlalchemy import text as _text
        nm = db.execute(_text("SELECT name_ko FROM countries WHERE country_code = :c"),
                        {"c": focus_country}).scalar()
        request["procurement"]["supplier_country"] = focus_country
        request["procurement"]["focus_country_name"] = nm or focus_country
        # 그 국가의 실제 SGRI도 함께 넘겨 보고서 문장에 쓰이게 함
        fs = db.execute(_text(
            "SELECT sgri_score FROM country_risk_scores WHERE hs_code = :h AND country_code = :c "
            "ORDER BY as_of_date DESC LIMIT 1"
        ), {"h": query.hs_code, "c": focus_country}).scalar()
        if fs is not None:
            request["procurement"]["focus_country_sgri"] = round(float(fs), 1)
    candidates = companies_to_candidates(companies)
    # 포커스 국가가 있으면 그 국가 기업을 우선 정렬(보고서 기업 섹션에 반영)
    if focus_country:
        candidates.sort(key=lambda c: 0 if (c.get("country") or "").upper() == focus_country else 1)

    # 위험수치·보고서는 우리 DB(실데이터 6지표 + 제미나이 가중치)로 생성해
    # 대시보드/리스크 페이지 SGRI와 보고서 숫자를 일치시킨다. (company 추천은 AI_Model)
    # 부품(recommend_companies + generate_report_draft)만 호출해 Gemini 중복 호출 방지.
    db_risk = build_db_risk_result(db, query.hs_code)
    if db_risk is not None:
        from supplyguard_sgri import recommend_companies, reporting  # noqa: PLC0415
        procurement = request["procurement"]
        company_result = recommend_companies(procurement, candidates)
        report = reporting.generate_report_draft(procurement, db_risk, company_result)
        resp = {
            "procurement": procurement,
            "risk_assessment": db_risk,
            "company_recommendations": company_result,
            "report_draft": report,
        }
    else:
        # DB에 해당 품목 SGRI가 없으면 AI_Model 자체 계산으로 폴백
        resp = analyze_procurement(request, candidate_companies=candidates, use_live_apis=False)
        resp = json.loads(resp) if isinstance(resp, str) else resp

    return _store_response(db, query, resp)
