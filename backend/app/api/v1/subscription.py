"""
구독(요금제) 라우터.
- GET  /subscription         : 요금제 카탈로그 + 내 현재 플랜 + 사용량
- POST /subscription         : 플랜 변경 (데모 mock 결제 — 실결제 없이 즉시 전환)
※ 실제 PG(토스/Stripe) 연동은 여기 create_subscription 에 결제 검증만 추가하면 된다.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user
from app.models.query import UserQuery
from app.models.subscription import Subscription
from app.models.user import User
from app.services.plans import PLANS, get_plan, plan_of

router = APIRouter(prefix="/subscription", tags=["subscription"])


class SubscribeRequest(BaseModel):
    plan: str  # basic / pro / enterprise


def _catalog() -> list[dict]:
    """프론트 요금제 페이지용 카탈로그."""
    return [
        {
            "key": key,
            "label": p["label"],
            "price_krw": p["price_krw"],
            "target": p["target"],
            "max_items": p["max_items"],
            "custom_quote": p.get("custom_quote", False),
            "highlights": p["highlights"],
            "features": p["features"],
        }
        for key, p in PLANS.items()
    ]


def _state(db: Session, user: User) -> dict:
    """현재 플랜 + 사용량."""
    plan_key = plan_of(user)
    plan = get_plan(plan_key)
    item_count = db.execute(
        select(func.count()).select_from(UserQuery).where(UserQuery.user_id == user.user_id)
    ).scalar() or 0
    return {
        "current_plan": plan_key,
        "label": plan["label"],
        "usage": {"items": int(item_count), "items_limit": plan["max_items"]},
        "features": plan["features"],
    }


@router.get("")
def get_subscription(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """요금제 카탈로그 + 내 현재 플랜/사용량을 반환한다."""
    return {"plans": _catalog(), **_state(db, current_user)}


@router.post("")
def subscribe(
    payload: SubscribeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """플랜을 변경한다 (데모 mock 결제 — 실결제 없이 즉시 반영).
    실제 결제 연동 시: 여기서 PG 결제 검증 후 아래 반영 로직을 실행하면 된다."""
    key = payload.plan.lower()
    if key not in PLANS:
        raise HTTPException(status_code=400, detail="알 수 없는 요금제입니다.")

    # 이전 구독 active → canceled
    for sub in db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.user_id, Subscription.status == "active"
        )
    ).scalars():
        sub.status = "canceled"

    plan = get_plan(key)
    db.add(Subscription(
        user_id=current_user.user_id,
        plan=key,
        price_krw=plan["price_krw"],
        status="active",
        started_at=datetime.utcnow(),
        note="mock 결제(데모)",
    ))
    current_user.plan = key
    db.commit()
    db.refresh(current_user)
    return {"ok": True, **_state(db, current_user)}
