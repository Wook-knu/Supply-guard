"""
또래 중소기업 '예시 사례' 생성 (AI).

⚠️ 공개된 실거래 데이터가 없으므로 실제 기업명·실거래 기록을 만들지 않는다.
Gemini가 '이 품목을 조달하는 국내 중소기업이 겪을 법한 현실적 시나리오'를
익명 프로필로 생성한다(교육용 예시). 프론트에서 '실거래 아님'을 명확히 표시.
GEMINI_API_KEY 없음/실패 시 데이터 기반 결정적 폴백.
"""
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

_AI = Path(__file__).resolve().parents[3] / "AI_Model"
if str(_AI) not in sys.path:
    sys.path.insert(0, str(_AI))

_SCHEMA = {
    "type": "object",
    "required": ["cases"],
    "properties": {
        "cases": {
            "type": "array",
            "maxItems": 4,
            "items": {
                "type": "object",
                "required": ["profile", "situation", "action", "outcome", "lesson"],
                "properties": {
                    "profile": {"type": "string"},    # 익명 기업 프로필
                    "situation": {"type": "string"},  # 처한 상황
                    "action": {"type": "string"},     # 대응
                    "outcome": {"type": "string"},    # 결과
                    "lesson": {"type": "string"},     # 시사점
                },
                "additionalProperties": False,
            },
        }
    },
    "additionalProperties": False,
}

_SYSTEM = (
    "너는 공급망 컨설턴트다. 주어진 품목(HS)을 조달하는 '대한민국 중소기업'이 겪을 법한 "
    "현실적인 공급망 리스크 대응 사례를 3~4개 만들어라. ★반드시 익명 프로필로★ 작성하고 "
    "(예: '연 매출 200억 규모의 2차전지 소재 수입 중소기업'), 실제 회사명·실제 거래 기록을 "
    "지어내지 마라. 각 사례는 situation(처한 상황)·action(대응)·outcome(결과, 정량 표현 포함)"
    "·lesson(시사점)을 담는다. 한국어로, 교육용 예시임이 드러나게 담백하게 써라."
)


def _fallback(item_name: str) -> dict:
    nm = item_name or "해당 품목"
    return {
        "cases": [
            {
                "profile": f"{nm}을(를) 단일국에서 수입하던 중소 제조기업",
                "situation": "주력 공급국의 수출 규제 신호로 조달 차질 우려가 커졌습니다.",
                "action": "대체 공급국 2곳에서 샘플을 받고 소량 병행 발주로 이원화했습니다.",
                "outcome": "단가는 약 5% 상승했지만 납기 지연 리스크를 크게 낮췄습니다.",
                "lesson": "단일 공급 의존도를 낮추는 이원화가 가격보다 공급 안정에 유효했습니다.",
            },
            {
                "profile": f"{nm} 가격 변동에 민감한 소규모 수입상",
                "situation": "원자재 가격 급등으로 마진이 빠르게 잠식됐습니다.",
                "action": "구매 계약에 가격 연동 조항과 분할 발주를 도입했습니다.",
                "outcome": "가격 급등 구간의 손실 폭을 절반 수준으로 줄였습니다.",
                "lesson": "가격 헤지 조항이 변동성 리스크 완화에 도움이 됐습니다.",
            },
        ],
        "source": "fallback",
    }


def build_peer_cases(db: Session, hs_code: str) -> dict:
    hs = "".join(ch for ch in str(hs_code) if ch.isdigit())
    name = db.execute(text(
        "SELECT name_ko FROM hs_codes WHERE hs_code = :h"
    ), {"h": hs}).scalar() if hs else None
    item_name = name or f"HS {hs}"

    try:
        from supplyguard_sgri.gemini_json_client import GeminiInteractionsJsonClient
        client = GeminiInteractionsJsonClient(timeout_seconds=40)
        result, _ = client.generate(
            {"hs_code": hs, "item_name": item_name},
            system_prompt=_SYSTEM, schema=_SCHEMA, schema_name="peer_cases",
            model="gemini-3.6-flash", reasoning_effort="low", max_output_tokens=1500,
        )
        if isinstance(result, dict) and result.get("cases"):
            return {**result, "source": "gemini"}
    except Exception:  # noqa: BLE001 - 키없음/429/실패 → 폴백
        pass
    return _fallback(item_name)
