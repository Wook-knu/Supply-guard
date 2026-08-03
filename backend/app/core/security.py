"""
인증 헬퍼 — 서명된 JWT 세션 토큰.

토큰: HS256 JWT, payload {sub: user_id, exp}. SECRET_KEY 로 서명(위조 불가).
발급은 create_access_token, 검증은 _parse_token 에서만 한다(다른 코드는 그대로).
로그인 방식(구글 OAuth / 이메일 스텁)은 auth.py 라우터가 담당.
"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.models.user import User

_ALGO = "HS256"


# ── 비밀번호 해싱 (bcrypt) ──
def hash_password(password: str) -> str:
    """평문 비밀번호 → bcrypt 해시."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    """평문 ↔ 해시 검증. 해시 없으면(구글유저 등) False."""
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user_id: int) -> str:
    """서명된 JWT 세션 토큰 발급."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=_ALGO)


def _parse_token(authorization: str | None) -> int | None:
    """Bearer JWT 에서 user_id 추출. 없거나 서명/만료 불량이면 None."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[_ALGO])
        return int(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
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
