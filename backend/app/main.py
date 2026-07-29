"""
SupplyGuard 백엔드 진입점.
실행:  uvicorn app.main:app --reload
문서:  http://localhost:8000/docs  (Swagger = 자동 API 명세서)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings

app = FastAPI(title="SupplyGuard API", version="0.1.0")

# 프론트(Next.js)에서 호출할 수 있게 CORS 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["health"])
def health():
    """서버 살아있는지 확인용."""
    return {"status": "ok"}
