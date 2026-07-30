"""
인증(로그인) 요청/응답 스키마.
"""
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    """POST /auth/login 요청 (stub: 이메일만으로 로그인/가입)."""
    email: EmailStr = Field(examples=["jswook@kookmin.ac.kr"])
    name: str | None = Field(default=None, examples=["승요"])


class UserOut(BaseModel):
    """사용자 정보 응답."""
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    email: str
    name: str | None = None
    picture_url: str | None = None   # 구글 프로필 사진(있으면)
    company_id: int | None = None
    role: str | None = None
    plan: str | None = None   # 구독 요금제 (basic/pro/enterprise)


class TokenResponse(BaseModel):
    """로그인 성공 응답: 토큰 + 사용자 정보."""
    access_token: str
    token_type: str = "bearer"
    user: UserOut
