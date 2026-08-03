"""
SupplyGuard 백엔드 진입점.
실행:  uvicorn app.main:app --reload
문서:  http://localhost:8000/docs  (Swagger = 자동 API 명세서)
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.db import engine

# 운영 DB(Railway) 덤프 복원 시 누락될 수 있는 뷰를 시작 시점에 보장한다.
# s_source_monthly: S지표(수급 불안정성) 계산이 바라보는 뷰 (comtrade_trade_flows 위에 얹음).
_ENSURE_VIEWS_SQL = """
CREATE OR REPLACE VIEW s_source_monthly AS
SELECT hs_code, period AS period, trade_value_usd AS import_value
FROM comtrade_trade_flows
WHERE flow_code = 'M' AND partner_code IS NULL AND trade_value_usd > 0;
"""


@asynccontextmanager
async def lifespan(_: FastAPI):
    """앱 시작 시 필수 뷰가 없으면 생성(idempotent). 실패해도 서버 기동은 막지 않는다."""
    try:
        with engine.begin() as conn:
            conn.execute(text(_ENSURE_VIEWS_SQL))
    except Exception as exc:  # noqa: BLE001 — comtrade_trade_flows 미존재 등은 무시하고 기동
        print(f"[startup] ensure views skipped: {exc}")
    yield


app = FastAPI(title="SupplyGuard API", version="0.1.0", lifespan=lifespan)

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


@app.get("/health", tags=["health"])
def health():
    """서버 살아있는지 확인용."""
    return {"status": "ok"}
