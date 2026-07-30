"""
인증 라우터 (요구사항 1: 로그인/회원가입).
- POST /auth/google : 구글 ID 토큰 검증 → 사용자 조회/생성 → 우리 JWT 발급 (실인증)
- POST /auth/login  : 이메일 스텁 로그인 (데모용, ALLOW_STUB_LOGIN=False 면 비활성)
- GET  /auth/me     : 토큰으로 현재 로그인 사용자 조회
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import create_access_token, get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


class GoogleLoginRequest(BaseModel):
    id_token: str   # 프론트 Google Identity Services 가 준 credential(JWT)


def _issue(db: Session, user: User) -> TokenResponse:
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.user_id), user=user)


@router.post("/google", response_model=TokenResponse)
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    """구글 ID 토큰을 구글 공개키로 검증하고, 그 계정으로 로그인/가입한다."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="구글 로그인이 설정되지 않았습니다(GOOGLE_CLIENT_ID).")
    try:
        info = google_id_token.verify_oauth2_token(
            payload.id_token, google_requests.Request(), settings.GOOGLE_CLIENT_ID
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="유효하지 않은 구글 토큰입니다.")

    sub = info.get("sub")
    email = info.get("email")
    if not sub or not email:
        raise HTTPException(status_code=401, detail="구글 계정 정보를 읽을 수 없습니다.")

    # google_sub 우선, 없으면 email 로 매칭. 없으면 신규 생성.
    user = db.execute(select(User).where(User.google_sub == sub)).scalars().first()
    if user is None:
        user = db.execute(select(User).where(User.email == email)).scalars().first()
    if user is None:
        user = User(google_sub=sub, email=email, name=info.get("name"),
                    picture_url=info.get("picture"), role="member")
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # 기존 계정에 구글 연결 정보 보강
        user.google_sub = user.google_sub or sub
        user.name = user.name or info.get("name")
        user.picture_url = user.picture_url or info.get("picture")
    return _issue(db, user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """이메일 스텁 로그인 (데모용). 운영에선 ALLOW_STUB_LOGIN=False 로 비활성화 권장."""
    if not settings.ALLOW_STUB_LOGIN:
        raise HTTPException(status_code=403, detail="이메일 로그인이 비활성화되어 있습니다. 구글 로그인을 사용하세요.")
    user = db.execute(select(User).where(User.email == payload.email)).scalars().first()
    if user is None:
        user = User(email=payload.email, name=payload.name, role="member")
        db.add(user)
        db.commit()
        db.refresh(user)
    return _issue(db, user)


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)):
    """Authorization: Bearer <토큰> 으로 현재 사용자를 반환."""
    return current_user
