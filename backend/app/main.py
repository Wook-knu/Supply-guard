"""
SupplyGuard 백엔드 진입점.
실행:  uvicorn app.main:app --reload
문서:  http://localhost:8000/docs  (Swagger = 자동 API 명세서)
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.db import engine

_DB_DIR = Path(__file__).resolve().parents[2] / "database"

# 회사가 데모 수준(소수)일 때 1회 로드할 배터리 실기업 시드 (파일 순서 = 의존 순서).
_SEED_FILES = [
    "migrate_companies_procurement.sql",  # 조달 컬럼(단가·납기 등) 보장
    "seed_hs_codes_battery.sql",           # 282520/282200 HS 추가
    "seed_companies_real.sql",             # 실기업 75개사(배터리)
    "seed_country_risk_battery.sql",       # 배터리 품목 국가 SGRI
]

# 운영 DB(Railway) 덤프 복원 시 누락될 수 있는 스키마 객체를 시작 시점에 보장한다(idempotent).
_ENSURE_SQL = [
    # 회사 데이터 출처 구분 컬럼(실데이터/AI추정) — 실기업 시드가 사용.
    """ALTER TABLE companies ADD COLUMN IF NOT EXISTS data_source VARCHAR(50);""",
    # S지표(수급 불안정성): comtrade World 합계행을 읽는 뷰
    """CREATE OR REPLACE VIEW s_source_monthly AS
       SELECT hs_code, period AS period, trade_value_usd AS import_value
       FROM comtrade_trade_flows
       WHERE flow_code = 'M' AND partner_code IS NULL AND trade_value_usd > 0;""",
    # S지표: World 합계행(partner_code NULL) UPSERT용 부분 유니크 인덱스
    #   run_world()가 ON CONFLICT (...) WHERE partner_code IS NULL 로 적재할 때 필요.
    """CREATE UNIQUE INDEX IF NOT EXISTS uq_comtrade_world_null_partner
       ON comtrade_trade_flows (period, reporter_code, flow_code, hs_code)
       WHERE partner_code IS NULL;""",
    # 현재 거래 중인 공급국 저장용 컬럼(선택 입력) — 현재국 vs 대체국 비교 표시에 사용.
    """ALTER TABLE user_queries ADD COLUMN IF NOT EXISTS origin_country VARCHAR(100);""",
    # 프로필 사진을 data URL(base64)로도 저장할 수 있게 TEXT로 확장 (기존 VARCHAR(500) 초과 대비).
    """ALTER TABLE users ALTER COLUMN picture_url TYPE TEXT;""",
    # 등록 국가를 여러 개 담을 수 있게 확장 + '현재 거래 중' 부분집합 컬럼.
    """ALTER TABLE user_queries ALTER COLUMN origin_country TYPE VARCHAR(200);""",
    """ALTER TABLE user_queries ADD COLUMN IF NOT EXISTS trading_country VARCHAR(200);""",
    """ALTER TABLE user_queries ADD COLUMN IF NOT EXISTS trading_company_id BIGINT;""",
]


@asynccontextmanager
async def lifespan(_: FastAPI):
    """앱 시작 시 필수 스키마 객체를 보장(idempotent). 실패해도 서버 기동은 막지 않는다."""
    for stmt in _ENSURE_SQL:
        try:
            with engine.begin() as conn:
                conn.execute(text(stmt))
        except Exception as exc:  # noqa: BLE001 — 테이블 미존재 등은 무시하고 기동
            print(f"[startup] ensure skipped: {exc}")

    # 실기업 시드 1회 로드 (회사가 10곳 미만일 때만 — 멱등 파일이라 반복돼도 안전).
    try:
        with engine.begin() as conn:
            company_count = conn.execute(text("SELECT count(*) FROM companies")).scalar() or 0
        if company_count < 10:
            for fname in _SEED_FILES:
                try:
                    raw = engine.raw_connection()
                    try:
                        cur = raw.cursor()
                        cur.execute("SET client_encoding TO 'UTF8'")
                        cur.execute((_DB_DIR / fname).read_text(encoding="utf-8"))
                        raw.commit()
                    finally:
                        raw.close()
                except Exception as exc:  # noqa: BLE001 — 개별 시드 실패는 건너뛴다
                    print(f"[startup] seed {fname} skipped: {exc}")
            print(f"[startup] company seed loaded (was {company_count})")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] company seed check skipped: {exc}")
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
