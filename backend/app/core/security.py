"""
인증 헬퍼 (지금은 STUB).

⚠️ 이건 개발용 가짜 토큰이다.
   토큰 형식: "stub-{user_id}"  (예: user_id=42 → "stub-42")
   나중에 진짜 Google OAuth + JWT로 바꿀 때, 아래 _parse_token / create_access_token
   두 곳만 교체하면 나머지 코드(get_current_user 등)는 그대로 둬도 된다.
"""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.user import User


def create_access_token(user_id: int) -> str:
    """가짜 토큰 발급. (진짜 구현 시 JWT 인코딩으로 교체)"""
    return f"stub-{user_id}"


def _parse_token(authorization: str | None) -> int | None:
    """Bearer 토큰에서 user_id를 뽑는다. 없거나 형식이 틀리면 None.
    (진짜 구현 시 JWT 디코딩으로 교체)"""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    if not token.startswith("stub-"):
        return None
    try:
        return int(token.removeprefix("stub-"))
    except ValueError:
        return None


def get_current_user_optional(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User | None:
    """토큰이 있으면 사용자, 없거나 틀리면 None (에러 없음).
    '로그인하면 개인화, 안 해도 동작'하는 엔드포인트에서 사용."""
    user_id = _parse_token(authorization)
    if user_id is None:
        return None
    return db.get(User, user_id)


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """토큰이 반드시 있어야 하는 엔드포인트용. 없으면 401.
    다른 라우터에서 Depends(get_current_user)로 '로그인 필수'를 건다."""
    user_id = _parse_token(authorization)
    if user_id is None:
        raise HTTPException(status_code=401, detail="missing or invalid bearer token")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="user not found")
    return user
