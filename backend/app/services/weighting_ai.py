"""
제미나이 가중치 → SGRI 재계산.

DB의 실데이터 6지표(S·C·V·L·P·E)를 근거로, AI_Model의 determine_weights(제미나이+검증)
로 가중치를 받아 국가별 최종 SGRI를 다시 계산한다.

- 지표 계산 = 코드(SQL)  ← 그대로
- 가중치     = 제미나이(AI_Model 재사용) + Python 검증(기준값 대비 범위 제한)
- 제미나이 실패/키 없음 → AI_Model이 규칙 기반으로 자동 폴백

※ 가중치는 품목 단위(1세트) — 후보국 공통 적용.
"""
import json
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

# AI_Model 재사용 (제미나이 가중치 로직 + 키는 AI_Model/.env 자동 로드)
_AI = Path(__file__).resolve().parents[3] / "AI_Model"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))
from supplyguard_sgri.models import WeightOptions  # noqa: E402
from supplyguard_sgri.weighting import determine_weights  # noqa: E402

# 지표 키 → country_risk_scores 컬럼
_KEY_COL = {"S": "score_s", "P": "score_p", "V": "score_v",
            "L": "score_l", "C": "score_c", "E": "score_e"}
_LABEL = {"S": "수급 불안정성", "P": "국가·정책 리스크", "V": "가격 변동성",
          "L": "물류 리스크", "C": "공급처 집중도", "E": "ESG·탄소규제"}


def apply_gemini_sgri(db: Session, hs_code: str) -> dict:
    """품목의 6지표를 근거로 제미나이 가중치를 받아 국가별 SGRI를 재계산."""
    hs = "".join(ch for ch in str(hs_code) if ch.isdigit())
    rows = db.execute(text(
        "SELECT country_code, score_s, score_p, score_v, score_l, score_c, score_e "
        "FROM country_risk_scores WHERE hs_code = :h"), {"h": hs}).all()
    if not rows:
        return {"hs_code": hs, "countries": 0}

    # 품목 단위 지표 요약(후보국 평균) — 제미나이가 가중치 판단할 맥락
    avg = db.execute(text(
        "SELECT avg(score_s) s, avg(score_p) p, avg(score_v) v, "
        "avg(score_l) l, avg(score_c) c, avg(score_e) e "
        "FROM country_risk_scores WHERE hs_code = :h"), {"h": hs}).one()
    avg_map = {"S": avg.s, "P": avg.p, "V": avg.v, "L": avg.l, "C": avg.c, "E": avg.e}
    component_context = {
        key: {
            "label": _LABEL[key],
            "score": round(float(avg_map[key] or 0), 3),
            "confidence": 60,
            "reasons": [f"후보국 평균 {key} 위험 {float(avg_map[key] or 0):.1f}점"],
            "metrics": {},
        }
        for key in _KEY_COL
    }

    # 제미나이 가중치 (실패 시 AI_Model이 규칙 기반 폴백)
    decision = determine_weights(
        WeightOptions(strategy="llm"),
        component_context,
        request_context={"hs_code": hs, "item_name": hs},
    )
    w = decision.effective_weights
    profile_json = json.dumps(decision.to_dict(), ensure_ascii=False)

    # 국가별 SGRI 재계산 (있는 지표만 정규화 가중합)
    for r in rows:
        scores = {"S": r.score_s, "P": r.score_p, "V": r.score_v,
                  "L": r.score_l, "C": r.score_c, "E": r.score_e}
        num = den = 0.0
        for key, val in scores.items():
            if val is not None:
                num += float(val) * w[key]
                den += w[key]
        sgri = round(num / den, 3) if den else None
        db.execute(text(
            "UPDATE country_risk_scores SET sgri_score = :s, weights_json = CAST(:w AS jsonb) "
            "WHERE country_code = :c AND hs_code = :h AND as_of_date = DATE '2024-01-01'"),
            {"s": sgri, "w": profile_json, "c": r.country_code, "h": hs})
    db.commit()

    return {
        "hs_code": hs,
        "countries": len(rows),
        "uses_llm": decision.uses_llm,
        "weights": {k: round(w[k], 3) for k in w},
    }
