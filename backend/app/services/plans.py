"""
구독 요금제 정의 & 기능 게이팅.

수익모델(사업계획서) 반영:
  - Basic      월 30만원  : 소규모 수출입 기업 — 진입형
  - Pro        월 100만원 : 중소·중견 제조기업 — 핵심 수익 모델
  - Enterprise 월 300만원+: 대기업 — 별도 견적(맞춤)

기능(feature) 키는 제품 실제 기능에 매핑되어 라우터에서 게이팅에 쓰인다.
"""
from fastapi import HTTPException

# 기능 키:
#   monitoring       품목 모니터링(등록·감시)
#   country_risk     국가 의존도·SGRI 조회
#   price_alerts     원자재 가격 변동 알림
#   recommendations  대체 공급처(국가·기업) 추천
#   ai_reports       AI 리스크 보고서 생성
#   reweight         제미나이 가중치 재계산
#   api_access       외부 API 제공

PLANS: dict[str, dict] = {
    "basic": {
        "label": "Basic",
        "price_krw": 300_000,
        "target": "소규모 수출입 기업",
        "max_items": 5,
        "features": {
            "monitoring": True, "country_risk": True, "price_alerts": True,
            "recommendations": False, "ai_reports": False, "reweight": False,
            "api_access": False,
        },
        "highlights": ["핵심 품목 모니터링(최대 5개)", "특정국 의존도 분석", "원자재 가격 변동 알림", "기본 리스크 요약"],
    },
    "pro": {
        "label": "Pro",
        "price_krw": 1_000_000,
        "target": "중소·중견 제조기업",
        "max_items": None,  # 무제한
        "features": {
            "monitoring": True, "country_risk": True, "price_alerts": True,
            "recommendations": True, "ai_reports": True, "reweight": True,
            "api_access": False,
        },
        "highlights": ["무제한 품목", "품목별 리스크 점수화(6지표)", "이상징후·위험 이벤트 분석", "대체 공급처 추천", "AI 분석 보고서"],
    },
    "enterprise": {
        "label": "Enterprise",
        "price_krw": 3_000_000,
        "target": "대기업·대형 수출기업",
        "custom_quote": True,  # 별도 견적
        "max_items": None,
        "features": {
            "monitoring": True, "country_risk": True, "price_alerts": True,
            "recommendations": True, "ai_reports": True, "reweight": True,
            "api_access": True,
        },
        "highlights": ["ERP·SCM 연동", "맞춤형 리스크 예측 모델", "다국가 규제 대응", "전문가 검토", "API 제공"],
    },
}

DEFAULT_PLAN = "basic"
_FEATURE_LABEL = {
    "recommendations": "대체 공급처 추천", "ai_reports": "AI 분석 보고서",
    "reweight": "가중치 재계산", "api_access": "API 제공",
}


def get_plan(plan: str | None) -> dict:
    """플랜 키 → 정의(없으면 기본)."""
    return PLANS.get((plan or DEFAULT_PLAN).lower(), PLANS[DEFAULT_PLAN])


def plan_of(user) -> str:
    """사용자의 현재 플랜 키(없으면 기본)."""
    return (getattr(user, "plan", None) or DEFAULT_PLAN).lower()


def has_feature(user, feature: str) -> bool:
    return bool(get_plan(plan_of(user))["features"].get(feature))


def require_feature(user, feature: str) -> None:
    """플랜에 해당 기능이 없으면 402(업그레이드 필요)."""
    if not has_feature(user, feature):
        label = _FEATURE_LABEL.get(feature, feature)
        raise HTTPException(
            status_code=402,
            detail=f"'{label}' 기능은 Pro 이상 요금제에서 제공됩니다. 요금제를 업그레이드해 주세요.",
        )


def check_item_quota(user, current_count: int) -> None:
    """품목 수 상한 초과 시 402(업그레이드 필요)."""
    limit = get_plan(plan_of(user))["max_items"]
    if limit is not None and current_count >= limit:
        raise HTTPException(
            status_code=402,
            detail=f"현재 요금제({get_plan(plan_of(user))['label']})의 품목 한도({limit}개)를 초과했습니다. "
                   f"Pro 요금제로 업그레이드하면 무제한 등록이 가능합니다.",
        )
