"""
공급망 리스크 AI 챗봇.

사용자의 실제 데이터(모니터링 품목·SGRI·국가/기업 추천·알림)를 컨텍스트로 모아
Gemini가 근거 기반으로 답한다. 데이터 밖 질문은 모른다고 답하도록 유도(환각 방지).
Gemini 실패/429/키없음 시 데이터 기반 결정적 폴백.
"""
import sys
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.query import UserQuery
from app.models.recommendation import ProcurementRecommendation
from app.models.supplier_recommendation import SupplierRecommendation

_AI = Path(__file__).resolve().parents[3] / "AI_Model"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))

_CHAT_SCHEMA = {
    "type": "object",
    "properties": {
        "answer": {"type": "string"},
        "followups": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["answer"],
}

_SYSTEM = (
    "당신은 SupplyGuard의 공급망 리스크 분석 어시스턴트입니다. "
    "제공된 사용자 데이터(context)만 근거로 한국어로 간결·정확하게 답하세요. "
    "데이터에 없는 내용은 추측하지 말고 '해당 정보는 아직 없습니다'라고 답하세요. "
    "SGRI는 0(안전)~100(위험)이며 6개 지표(수급S·집중도C·가격V·물류L·정책P·ESG E)의 "
    "가중합입니다. answer(2~5문장)와 followups(후속 질문 제안 2~3개)를 반환하세요."
)


def _level(v: float) -> str:
    return "높음" if v >= 50 else "중간" if v >= 25 else "낮음"


def gather_context(db: Session, user_id: int | None, query_id: int | None) -> dict:
    """사용자 데이터를 챗봇 컨텍스트로 수집."""
    ctx: dict = {}

    # 모니터링 품목 (+ 최고 SGRI)
    q_stmt = select(UserQuery)
    if user_id is not None:
        q_stmt = q_stmt.where(UserQuery.user_id == user_id)
    queries = db.execute(q_stmt.order_by(UserQuery.query_id.desc())).scalars().all()
    items = []
    seen = set()
    for q in queries:
        if not q.hs_code or q.hs_code in seen:
            continue
        seen.add(q.hs_code)
        row = db.execute(text(
            "SELECT max(sgri_score) mx, avg(sgri_score) av FROM country_risk_scores WHERE hs_code=:h"
        ), {"h": q.hs_code}).one()
        items.append({
            "item_name": q.item_name, "hs_code": q.hs_code,
            "max_sgri": round(float(row.mx), 1) if row.mx is not None else None,
            "level": _level(float(row.mx)) if row.mx is not None else None,
            "query_id": q.query_id,
        })
    ctx["monitored_items"] = items[:10]

    # 특정 품목 포커스
    focus_qid = query_id or (queries[0].query_id if queries else None)
    if focus_qid:
        fq = db.get(UserQuery, focus_qid)
        if fq and fq.hs_code:
            countries = db.execute(
                select(ProcurementRecommendation)
                .where(ProcurementRecommendation.query_id == focus_qid)
                .order_by(ProcurementRecommendation.rank).limit(3)
            ).scalars().all()
            suppliers = db.execute(
                select(SupplierRecommendation)
                .where(SupplierRecommendation.query_id == focus_qid)
                .order_by(SupplierRecommendation.rank).limit(3)
            ).scalars().all()
            avg = db.execute(text(
                "SELECT round(avg(sgri_score)::numeric,1) FROM country_risk_scores WHERE hs_code=:h"
            ), {"h": fq.hs_code}).scalar()
            ctx["focus"] = {
                "item_name": fq.item_name, "hs_code": fq.hs_code,
                "avg_sgri": float(avg) if avg is not None else None,
                "level": _level(float(avg)) if avg is not None else None,
                "top_countries": [
                    {"country_code": c.country_code, "sgri": float(c.sgri_score or 0),
                     "fit": float(c.fit_score or 0), "rationale": c.rationale}
                    for c in countries
                ],
                "top_suppliers": [
                    {"company_id": s.company_id, "fit": float(s.fit_score or 0),
                     "rationale": s.rationale}
                    for s in suppliers
                ],
            }

    # 최근 알림
    a_stmt = select(Alert).order_by(Alert.alert_id.desc()).limit(5)
    if user_id is not None:
        a_stmt = select(Alert).where(Alert.user_id == user_id).order_by(Alert.alert_id.desc()).limit(5)
    alerts = db.execute(a_stmt).scalars().all()
    ctx["recent_alerts"] = [
        {"title": a.title, "severity": a.severity, "message": a.message} for a in alerts
    ]
    return ctx


def _gemini_answer(message: str, context: dict, history: list[dict] | None) -> dict | None:
    try:
        from supplyguard_sgri.gemini_json_client import GeminiInteractionsJsonClient
        client = GeminiInteractionsJsonClient(timeout_seconds=30)
        payload = {
            "question": message,
            "context": context,
            "recent_dialog": (history or [])[-6:],
        }
        result, _ = client.generate(
            payload, system_prompt=_SYSTEM, schema=_CHAT_SCHEMA,
            schema_name="supplyguard_chat", model="gemini-3.6-flash",
            reasoning_effort="low", max_output_tokens=800,
        )
        return result
    except Exception:  # noqa: BLE001 - 키없음/429 → 폴백
        return None


def _fallback(message: str, context: dict) -> dict:
    """데이터 기반 결정적 답변 (Gemini 미가용 시)."""
    focus = context.get("focus")
    items = context.get("monitored_items", [])
    if focus:
        tc = focus.get("top_countries") or []
        top = tc[0] if tc else None
        parts = [f"{focus['item_name']}의 종합 SGRI는 {focus.get('avg_sgri')}점"
                 f"({focus.get('level')})입니다."]
        if top:
            parts.append(f"대체 조달 1순위는 {top['country_code']}(SGRI {top['sgri']:.0f}, 적합도 {top['fit']:.0f})입니다.")
        answer = " ".join(parts)
    elif items:
        answer = "현재 모니터링 품목: " + ", ".join(
            f"{i['item_name']}(SGRI {i['max_sgri']}, {i['level']})" for i in items[:5] if i['max_sgri'] is not None
        ) + " 입니다. 특정 품목을 지정하면 더 자세히 알려드릴게요."
    else:
        answer = "아직 등록된 품목이 없습니다. 품목을 등록하면 SGRI·대체 공급처를 분석해 드립니다."
    return {
        "answer": answer,
        "followups": ["대체 공급국을 추천해줘", "가장 위험한 지표가 뭐야?", "추천 공급사를 알려줘"],
        "source": "fallback",
    }


def answer(db: Session, user_id: int | None, message: str,
           query_id: int | None = None, history: list[dict] | None = None) -> dict:
    """질문에 대해 사용자 데이터 기반으로 답한다."""
    context = gather_context(db, user_id, query_id)
    ai = _gemini_answer(message, context, history)
    if ai:
        return {**ai, "source": "gemini"}
    return _fallback(message, context)
