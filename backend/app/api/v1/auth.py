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
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.security import create_access_token, get_current_user, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, TokenResponse, UserOut

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


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    """이메일+비밀번호 회원가입. 이미 가입된 이메일이면 409."""
    existing = db.execute(select(User).where(User.email == payload.email)).scalars().first()
    if existing is not None:
        raise HTTPException(status_code=409, detail="이미 가입된 이메일입니다. 로그인해 주세요.")
    user = User(email=payload.email, name=payload.name, role="member",
                password_hash=hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return _issue(db, user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    """로그인. password가 오면 비밀번호 검증, 없으면 이메일 스텁(데모)."""
    user = db.execute(select(User).where(User.email == payload.email)).scalars().first()

    # 비밀번호 로그인
    if payload.password:
        if user is None or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="이메일 또는 비밀번호가 올바르지 않습니다.")
        return _issue(db, user)

    # 비밀번호 없는 요청 = 스텁 로그인(데모). 비번 있는 계정엔 비번 요구.
    if not settings.ALLOW_STUB_LOGIN:
        raise HTTPException(status_code=403, detail="비밀번호를 입력해 주세요.")
    if user is not None and user.password_hash:
        raise HTTPException(status_code=400, detail="이 계정은 비밀번호가 필요합니다.")
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


class UpdateMeRequest(BaseModel):
    """PATCH /auth/me — 프로필 편집(이름/사진). 보낸 필드만 반영."""
    name: str | None = None
    picture_url: str | None = None   # 외부 URL 또는 data:image/... base64 (클라에서 리사이즈)


class ChangePasswordRequest(BaseModel):
    """POST /auth/change-password. 기존 비번 있으면 current 필요."""
    current_password: str | None = None
    new_password: str = Field(min_length=8)


@router.patch("/me", response_model=UserOut)
def update_me(payload: UpdateMeRequest, db: Session = Depends(get_db),
              current_user: User = Depends(get_current_user)):
    """담당자명·프로필 사진을 수정한다. 보낸 필드만 갱신."""
    data = payload.model_dump(exclude_unset=True)
    if "name" in data:
        name = (data["name"] or "").strip()
        current_user.name = name or None
    if "picture_url" in data:
        pic = data["picture_url"]
        if pic and len(pic) > 700_000:
            raise HTTPException(status_code=413, detail="이미지가 너무 큽니다. 더 작은 사진을 사용해 주세요.")
        current_user.picture_url = pic or None
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password", status_code=204)
def change_password(payload: ChangePasswordRequest, db: Session = Depends(get_db),
                    current_user: User = Depends(get_current_user)):
    """비밀번호 변경. 기존 비번이 설정된 계정은 current_password 검증을 통과해야 한다."""
    if current_user.password_hash:
        if not payload.current_password or not verify_password(payload.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="현재 비밀번호가 올바르지 않습니다.")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
