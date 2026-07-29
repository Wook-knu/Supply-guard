"""
인증 라우터 (요구사항 1: 로그인/회원가입). 지금은 STUB.
- POST /auth/login : 이메일로 로그인(없으면 가입) → 토큰 발급
- GET  /auth/me    : 토큰으로 현재 로그인 사용자 조회
※ 진짜 Google OAuth로 바꿀 때 이 라우터와 core/security.py만 손보면 된다.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import create_access_token, get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """이메일로 사용자를 찾고, 없으면 새로 만든 뒤 토큰을 발급한다 (stub)."""
    user = db.execute(
        select(User).where(User.email == payload.email)
    ).scalars().first()

    if user is None:
        user = User(email=payload.email, name=payload.name, role="member")
        db.add(user)
        db.commit()
        db.refresh(user)

    token = create_access_token(user.user_id)
    return TokenResponse(access_token=token, user=user)


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)):
    """Authorization: Bearer <토큰> 으로 현재 사용자를 반환."""
    return current_user
