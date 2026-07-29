"""
인증 헬퍼 (지금은 STUB).

⚠️ 이건 개발용 가짜 토큰이다.
   토큰 형식: "stub-{user_id}"  (예: user_id=42 → "stub-42")
   나중에 진짜 Google OAuth + JWT로 바꿀 때, 이 파일의 두 함수만 교체하면
   나머지 라우터 코드는 그대로 둬도 된다 (get_current_user 인터페이스 유지).
"""
from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.models.user import User


def create_access_token(user_id: int) -> str:
    """가짜 토큰 발급. (진짜 구현 시 JWT 인코딩으로 교체)"""
    return f"stub-{user_id}"


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Authorization 헤더의 Bearer 토큰으로 현재 사용자를 찾아 반환.
    다른 라우터에서 Depends(get_current_user)로 '로그인 필수'를 걸 수 있다."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")

    token = authorization.removeprefix("Bearer ").strip()
    if not token.startswith("stub-"):  # (진짜 구현 시 JWT 디코딩으로 교체)
        raise HTTPException(status_code=401, detail="invalid token")
    try:
        user_id = int(token.removeprefix("stub-"))
    except ValueError:
        raise HTTPException(status_code=401, detail="invalid token")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="user not found")
    return user
