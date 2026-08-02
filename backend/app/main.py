"""
SupplyGuard 백엔드 진입점.
실행:  uvicorn app.main:app --reload
문서:  http://localhost:8000/docs  (Swagger = 자동 API 명세서)
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.db import engine
from app.models.alert_setting import AlertSetting

app = FastAPI(title="SupplyGuard API", version="0.1.0")

# 프론트(Next.js)에서 호출할 수 있게 CORS 허용.
# FRONTEND_ORIGIN(정확 일치) + 로컬 + 모든 *.vercel.app(프리뷰/프로덕션 도메인) 허용.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_ORIGIN, "http://localhost:3000"],
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
def ensure_runtime_tables() -> None:
    """기존 배포 DB에도 신규 스키마를 재실행 가능하게 적용한다."""
    AlertSetting.__table__.create(bind=engine, checkfirst=True)
    # 이 컬럼들은 초기 운영 DB에는 없을 수 있다. ORM이 모든 컬럼을
    # SELECT하므로 하나라도 누락되면 공급사 조회 자체가 500으로 실패한다.
    with engine.begin() as connection:
        connection.execute(text(
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18,4)"
        ))
        connection.execute(text(
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS available_quantity NUMERIC(20,2)"
        ))
        connection.execute(text(
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS lead_time_days INTEGER"
        ))
        connection.execute(text(
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS on_time_delivery_rate NUMERIC(5,2)"
        ))
        connection.execute(text(
            "ALTER TABLE companies ADD COLUMN IF NOT EXISTS defect_rate_pct NUMERIC(5,2)"
        ))


@app.get("/health", tags=["health"])
def health():
    """서버 살아있는지 확인용."""
    return {"status": "ok"}
