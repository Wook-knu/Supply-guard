"""
최신 동향 분석 — 사용자의 모니터링 품목·SGRI·최근 알림을 근거로
Gemini가 '지금 공급망 동향'을 요약하고, 화면 차트용 집계치를 함께 반환한다.
Gemini 미가용 시 데이터 기반 결정적 폴백.
"""
from collections import Counter

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.services.chatbot import gather_context

_TREND_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "highlights": {"type": "array", "items": {"type": "string"}},
        "watch_items": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["summary"],
}

_SYSTEM = (
    "당신은 SupplyGuard의 공급망 동향 분석가입니다. 제공된 사용자 데이터(context)만 근거로 "
    "'지금 이 사용자의 공급망 동향'을 한국어로 요약하세요. 데이터에 없는 사건은 지어내지 마세요. "
    "SGRI는 0(안전)~100(위험)입니다. context.registered_items는 각 품목의 '등록 국가 기준 SGRI'이니 "
    "품목을 언급할 때는 반드시 '{국가}의 {품목}(SGRI 점수)' 형식으로 국가를 함께 쓰세요. "
    "summary(3~5문장 개관), highlights(핵심 변화 3~4개, 각 한 문장), "
    "watch_items(주의 깊게 볼 국가·품목 2~3개)를 반환하세요."
)


def _stats(db: Session, ctx: dict, user_id: int | None) -> dict:
    """차트용 집계: 품목별 최고 SGRI, 알림 유형/심각도 분포."""
    # 품목별 SGRI = '등록 국가(거래중 우선)'의 SGRI. 최고 SGRI로 대체하지 않는다.
    _crows = db.execute(text("SELECT country_code, name_ko FROM countries")).all()
    name_to_code = {r[1]: r[0] for r in _crows}
    code_to_name = {r[0]: r[1] for r in _crows}

    def _to_code(raw: str) -> str | None:
        n = raw.strip()
        if not n:
            return None
        return name_to_code.get(n) or (n.upper() if len(n) == 2 else None)

    items = []
    if user_id:
        qrows = db.execute(text(
            "SELECT item_name, hs_code, origin_country, trading_country "
            "FROM user_queries WHERE user_id = :u ORDER BY query_id DESC"
        ), {"u": user_id}).mappings().all()
        seen: set[str] = set()
        for q in qrows:
            hs = q["hs_code"]
            if not hs or hs in seen:
                continue
            trading = [c for c in (_to_code(x) for x in (q["trading_country"] or "").split(",")) if c]
            origin = [c for c in (_to_code(x) for x in (q["origin_country"] or "").split(",")) if c]
            pref = trading + [c for c in origin if c not in trading]
            sgri = None
            ref_code = None
            for c in pref:
                v = db.execute(text(
                    "SELECT sgri_score FROM country_risk_scores WHERE hs_code = :h AND country_code = :c "
                    "ORDER BY as_of_date DESC LIMIT 1"
                ), {"h": hs, "c": c}).scalar()
                if v is not None:
                    sgri = round(float(v))
                    ref_code = c
                    break
            if sgri is None:  # 등록 국가 SGRI가 없으면 제외(최고 SGRI로 대체 안 함)
                continue
            seen.add(hs)
            lvl = "높음" if sgri >= 50 else "중간" if sgri >= 25 else "낮음"
            items.append({"name": q["item_name"] or f"HS {hs}", "hs": hs, "sgri": sgri, "level": lvl,
                          "country": code_to_name.get(ref_code, ref_code), "country_code": ref_code})
    # 알림 유형/심각도 분포 (사용자 전체 알림에서)
    types: Counter = Counter()
    sev: Counter = Counter()
    rows = db.execute(text(
        "SELECT alert_type, severity FROM alerts WHERE user_id = :u"
    ), {"u": user_id}).all() if user_id else []
    for atype, s in rows:
        types[atype or "기타"] += 1
        sev[s or "low"] += 1
    sgris = [i["sgri"] for i in items if i["sgri"] is not None]
    return {
        "items": sorted(items, key=lambda x: x["sgri"], reverse=True),
        "alert_by_type": dict(types),
        "alert_by_severity": {k: sev.get(k, 0) for k in ("high", "medium", "low")},
        "alert_total": sum(types.values()),
        "avg_sgri": round(sum(sgris) / len(sgris), 1) if sgris else None,
        "max_sgri": max(sgris) if sgris else None,
        "high_count": sum(1 for s in sgris if s >= 50),
        "item_count": len(items),
    }


def _gemini_brief(ctx: dict) -> dict | None:
    try:
        from supplyguard_sgri.gemini_json_client import GeminiInteractionsJsonClient
        client = GeminiInteractionsJsonClient(timeout_seconds=30)
        result, _ = client.generate(
            {"context": ctx}, system_prompt=_SYSTEM, schema=_TREND_SCHEMA,
            schema_name="supplyguard_trends", model="gemini-3.6-flash",
            reasoning_effort="low", max_output_tokens=900,
        )
        return result
    except Exception:  # noqa: BLE001 - 키없음/429 → 폴백
        return None


def _fallback(ctx: dict, stats: dict) -> dict:
    items = stats["items"]
    if not items:
        return {"summary": "아직 등록된 품목이 없습니다. 품목을 등록하면 최신 공급망 동향을 요약해 드립니다.",
                "highlights": [], "watch_items": [], "source": "fallback"}
    hi = [i for i in items if (i["sgri"] or 0) >= 50]
    top = items[0]
    top_c = top.get("country")
    summary = (f"모니터링 중인 {len(items)}개 품목 중 {len(hi)}개가 고위험(SGRI 50+) 구간입니다. "
               f"가장 위험도가 높은 것은 {top_c + '의 ' if top_c else ''}{top['name']}(SGRI {top['sgri']:.0f})입니다. "
               f"최근 알림은 총 {stats['alert_total']}건이 집계되었습니다.")
    highlights = [f"{(i.get('country') + '의 ') if i.get('country') else ''}{i['name']} · SGRI {i['sgri']:.0f} ({i['level']})" for i in items[:4]]
    return {"summary": summary, "highlights": highlights,
            "watch_items": [f"{(i.get('country') + ' ') if i.get('country') else ''}{i['name']}" for i in hi[:3]], "source": "fallback"}


def build_trend_brief(db: Session, user_id: int | None) -> dict:
    ctx = gather_context(db, user_id, None)
    stats = _stats(db, ctx, user_id)
    # 등록 국가 기준 품목 SGRI를 컨텍스트에 얹어 AI 요약도 '국가의 품목' 형태로 쓰게 한다.
    ctx["registered_items"] = [
        {"item": i["name"], "country": i.get("country"), "sgri": i["sgri"], "level": i["level"]}
        for i in stats["items"]
    ]
    ai = _gemini_brief(ctx)
    brief = {**ai, "source": "gemini"} if ai else _fallback(ctx, stats)
    return {**brief, "stats": stats}
