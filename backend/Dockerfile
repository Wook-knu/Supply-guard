# 백엔드(FastAPI) 이미지.
# ※ 빌드 컨텍스트 = 리포지토리 루트. backend 는 AI_Model/ 과 database/ 를
#    상대경로로 참조하므로 리포 구조를 그대로 담는다.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# 의존성 먼저 설치(레이어 캐시). database/requirements 는 build-sgri 수집(requests 등)용.
COPY backend/requirements.txt backend/requirements.txt
COPY database/requirements.txt database/requirements.txt
RUN pip install -r backend/requirements.txt -r database/requirements.txt

# 앱 코드 (리포 구조 유지: /app/backend, /app/AI_Model, /app/database)
COPY backend/ backend/
COPY AI_Model/ AI_Model/
COPY database/ database/

WORKDIR /app/backend
EXPOSE 8000

# DB·GEMINI 등은 런타임 환경변수로 주입 (이미지에 비밀정보 미포함)
# Railway 등은 $PORT 를 주입 → 있으면 그 포트, 없으면 8000(로컬/compose)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
