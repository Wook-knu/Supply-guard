"""
추천 상세 설명 (AI).

국가·기업 추천에 대해 "왜 추천했는지"를 Gemini가 6지표·조달지표 근거로 서술한다.
- 지표는 이미 계산된 실데이터를 근거로만 사용(수치를 지어내지 않음).
- Gemini 실패/429 시 데이터 기반 결정적 폴백(여전히 유용한 설명).
"""
import sys
from pathlib import Path

# AI_Model의 Gemini 클라이언트 재사용 (키는 AI_Model/.env)
_AI = Path(__file__).resolve().parents[3] / "AI_Model"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))

_LABEL = {"score_s": "수급 불안정성", "score_c": "공급처 집중도", "score_v": "가격 변동성",
          "score_l": "물류 리스크", "score_p": "국가·정책 리스크", "score_e": "ESG·탄소규제"}

_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "factors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"label": {"type": "string"}, "detail": {"type": "string"}},
                "required": ["label", "detail"],
            },
        },
        "recommendation": {"type": "string"},
    },
    "required": ["summary", "factors", "recommendation"],
}


def _gemini(system_prompt: str, payload: dict) -> dict | None:
    """Gemini 호출. 실패 시 None(→ 폴백)."""
    try:
        from supplyguard_sgri.gemini_json_client import GeminiInteractionsJsonClient
        client = GeminiInteractionsJsonClient(timeout_seconds=30)
        result, _ = client.generate(
            payload, system_prompt=system_prompt, schema=_SCHEMA,
            schema_name="reco_explanation", model="gemini-3.6-flash",
            reasoning_effort="low", max_output_tokens=1200,
        )
        return result
    except Exception:  # noqa: BLE001 - 키 없음/429 등 → 폴백
        return None


def _lvl(v: float) -> str:
    return "높음" if v >= 50 else "중간" if v >= 25 else "낮음"


def _whole_score(value: float) -> int:
    """프론트의 Math.round와 같은 양수 반올림 규칙을 사용한다."""
    return int(float(value) + 0.5)


# ── 국가 추천 설명 ────────────────────────────────────────────────────────
_COUNTRY_PROMPT = (
    "당신은 공급망 리스크 분석가입니다. 주어진 국가의 SGRI 6개 지표와 조달 조건을 근거로, "
    "이 국가를 조달처로 추천/주의하는 이유를 한국어로 구체적으로 설명하세요. "
    "제공된 수치만 사용하고 새 수치를 만들지 마세요. summary(2~3문장), factors(지표별 label/detail 3~5개), "
    "recommendation(실행 제언 1~2문장)을 반환하세요. 점수는 0=안전, 100=위험입니다."
)


def explain_country(item_name: str, country_name: str, reco: dict) -> dict:
    """국가 추천 상세 설명. reco: sgri_score, fit_score, score_*, est_unit_price, tariff_percent, est_lead_days, rank."""
    scores = {k: reco.get(k) for k in _LABEL if reco.get(k) is not None}
    payload = {
        "item": item_name, "country": country_name, "rank": reco.get("rank"),
        "sgri_score": reco.get("sgri_score"), "fit_score": reco.get("fit_score"),
        "indicators": [{"key": k, "label": _LABEL[k], "score": float(v)} for k, v in scores.items()],
        "est_unit_price": reco.get("est_unit_price"), "tariff_percent": reco.get("tariff_percent"),
        "est_lead_days": reco.get("est_lead_days"),
    }
    ai = _gemini(_COUNTRY_PROMPT, payload)
    if ai:
        return {**ai, "source": "gemini"}

    # ── 폴백: 데이터 기반 결정적 설명 ──
    ordered = sorted(scores.items(), key=lambda kv: float(kv[1]))
    strengths = [(k, float(v)) for k, v in ordered if float(v) < 40][:3]
    cautions = [(k, float(v)) for k, v in ordered[::-1] if float(v) >= 50][:2]
    factors = [{"label": _LABEL[k], "detail": f"{float(v):.0f}점으로 위험이 낮아 강점입니다."} for k, v in strengths]
    factors += [{"label": _LABEL[k], "detail": f"{float(v):.0f}점으로 위험이 높아 주의가 필요합니다."} for k, v in cautions]
    sgri = float(reco.get("sgri_score") or 0)
    fit = float(reco.get("fit_score") or 0)
    return {
        "summary": f"{country_name}는 {item_name} 조달 후보 중 {reco.get('rank')}순위(종합 적합도 {_whole_score(fit)})입니다. "
                   f"SGRI 종합 위험은 {_whole_score(sgri)}점({_lvl(sgri)})으로 평가됩니다.",
        "factors": factors or [{"label": "종합", "detail": f"6개 지표 종합 SGRI {_whole_score(sgri)}점입니다."}],
        "recommendation": ("우선 검토 대상으로 견적을 요청해 보세요." if sgri < 50
                           else "대체 후보와 병행 비교 후 신중히 검토하세요."),
        "source": "fallback",
    }


# ── 기업 추천 설명 ────────────────────────────────────────────────────────
_SUPPLIER_PROMPT = (
    "당신은 조달 분석가입니다. 주어진 공급사의 단가·리드타임·정시납품률·불량률·소속국 위험과 "
    "구매 조건(목표단가·희망납기)을 근거로, 이 기업을 추천/주의하는 이유를 한국어로 구체적으로 설명하세요. "
    "제공된 수치만 사용하세요. summary(2~3문장), factors(항목별 label/detail 3~5개), recommendation(제언)을 반환하세요."
)


def explain_supplier(item_name: str, company: dict, reco: dict, target_price=None, desired_lead=None) -> dict:
    """기업 추천 상세 설명. company: name, country_code, unit_price, lead_time_days, on_time_delivery_rate, defect_rate_pct."""
    payload = {
        "item": item_name, "company": company.get("name"), "country": company.get("country_code"),
        "fit_score": reco.get("fit_score"), "rank": reco.get("rank"),
        "unit_price": company.get("unit_price"), "target_price": target_price,
        "lead_time_days": company.get("lead_time_days"), "desired_lead_days": desired_lead,
        "on_time_delivery_rate": company.get("on_time_delivery_rate"),
        "defect_rate_pct": company.get("defect_rate_pct"),
        "certifications": company.get("certifications") or [],
    }
    ai = _gemini(_SUPPLIER_PROMPT, payload)
    if ai:
        return {**ai, "source": "gemini"}

    # ── 폴백 ──
    factors = []
    up, lt = company.get("unit_price"), company.get("lead_time_days")
    otd, dr = company.get("on_time_delivery_rate"), company.get("defect_rate_pct")
    if up is not None:
        note = ""
        if target_price:
            diff = (float(up) - float(target_price)) / float(target_price) * 100
            note = f" (목표단가 대비 {diff:+.0f}%)"
        factors.append({"label": "단가", "detail": f"예상 단가 ${float(up):,.1f}{note}."})
    if lt is not None:
        factors.append({"label": "리드타임", "detail": f"약 {int(lt)}일 소요됩니다."})
    if otd is not None:
        factors.append({"label": "정시 납품률", "detail": f"{float(otd):.0f}%로 납기 신뢰도가 {'높은' if float(otd) >= 90 else '보통'} 편입니다."})
    if dr is not None:
        factors.append({"label": "불량률", "detail": f"{float(dr):.1f}%로 품질이 {'우수' if float(dr) < 2 else '보통'}합니다."})
    fit = float(reco.get("fit_score") or 0)
    return {
        "summary": f"{company.get('name')}는 {item_name} 공급사 후보 중 {reco.get('rank')}순위(적합도 {_whole_score(fit)})입니다. "
                   f"{company.get('country_code')} 소재로 공개·등록 지표 기반 평가입니다.",
        "factors": factors or [{"label": "종합", "detail": "공개 데이터 기반 조달 적합도 평가입니다."}],
        "recommendation": "MOQ·인코텀즈 등 세부 조건을 확인 후 견적을 요청하세요.",
        "source": "fallback",
    }
