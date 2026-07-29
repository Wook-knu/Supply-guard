"""
v1 라우터 집합.
기능별 라우터를 여기에 include 한다. (새 기능 = 새 파일 → 여기 한 줄 추가)
"""
from fastapi import APIRouter

from app.api.v1 import queries, risks, recommendations, suppliers, reports

api_router = APIRouter()
api_router.include_router(queries.router)
api_router.include_router(risks.router)
api_router.include_router(recommendations.router)
api_router.include_router(suppliers.router)
api_router.include_router(reports.router)

# 앞으로 추가될 라우터들 (파일 만들면 주석 해제):
# from app.api.v1 import alerts, auth
# api_router.include_router(reports.router)
# api_router.include_router(alerts.router)
# api_router.include_router(auth.router)
