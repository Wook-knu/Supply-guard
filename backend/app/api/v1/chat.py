"""
AI 챗봇 라우터.
- POST /chat : 사용자의 공급망 데이터(SGRI·추천·알림)를 근거로 질문에 답한다.
※ 로그인 시 그 사용자 데이터로 개인화, 없으면 일반.
"""
from fastapi import APIRouter, Depends
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import get_current_user_optional
from app.models.user import User
from app.services.chatbot import answer

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    query_id: int | None = None            # 특정 품목 맥락(선택)
    history: list[ChatMessage] | None = None


@router.post("")
def chat(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """질문에 대해 사용자 데이터 기반으로 답한다. → { answer, followups, source }."""
    return answer(
        db,
        user_id=current_user.user_id if current_user else None,
        message=payload.message,
        query_id=payload.query_id,
        history=[m.model_dump() for m in payload.history] if payload.history else None,
    )
