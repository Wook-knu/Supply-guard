"""
v1 라우터 집합.
기능별 라우터를 여기에 include 한다. (새 기능 = 새 파일 → 여기 한 줄 추가)
"""
from fastapi import APIRouter

from app.api.v1 import queries, risks, recommendations, suppliers, reports, alerts, auth, feedback, pipeline, companies, subscription, boards, chat

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(queries.router)
api_router.include_router(risks.router)
api_router.include_router(recommendations.router)
api_router.include_router(suppliers.router)
api_router.include_router(reports.router)
api_router.include_router(alerts.router)
api_router.include_router(feedback.router)
api_router.include_router(pipeline.router)
api_router.include_router(companies.router)
api_router.include_router(subscription.router)
api_router.include_router(boards.router)
api_router.include_router(chat.router)
