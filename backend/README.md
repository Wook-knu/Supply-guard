# SupplyGuard 백엔드 (FastAPI)

연합 학술제 13조 · 공급망 위험 분석 서비스 API 서버.

## 폴더 구조

```
backend/
├─ app/
│  ├─ main.py            # FastAPI 진입점 (+ CORS, 라우터 등록)
│  ├─ core/
│  │  ├─ config.py       # .env 로드 (DB 접속정보)
│  │  └─ db.py           # SQLAlchemy 세션 / Base / get_db
│  ├─ api/v1/
│  │  ├─ router.py       # 기능별 라우터 집합 (새 기능 = 여기 한 줄 추가)
│  │  └─ queries.py      # F-01 품목 입력 (템플릿)
│  ├─ models/            # DB 테이블 ORM 매핑 (서빙하는 것만)
│  └─ schemas/           # Pydantic 요청/응답 = API 계약
├─ requirements.txt
└─ .env.example
```

- **DB 스키마의 단일 소스는 `../database/`** 다. 백엔드는 테이블을 새로 만들지 않고 매핑만 한다.
- 대부분의 원천 테이블(comtrade, fred, wgi...)은 `../database/main.py` 배치가 채운다. API는 조회만.

## 사전 준비

1. PostgreSQL 실행 중 + `supplyguard` DB에 스키마가 올라가 있어야 한다:
   ```bash
   psql -U postgres -d supplyguard -f ../database/supplyguard_schema_v2.sql
   psql -U postgres -d supplyguard -f ../database/supplyguard_schema_v3_service.sql
   psql -U postgres -d supplyguard -f ../database/seed_countries.sql
   psql -U postgres -d supplyguard -f ../database/seed_hs_codes.sql
   ```

## 실행

```bash
# 1. 가상환경 (최초 1회)
python -m venv .venv
.venv\Scripts\activate          # PowerShell/CMD

# 2. 패키지 설치
pip install -r requirements.txt

# 3. 환경변수: .env.example 복사해서 .env 만들고 DB 비번 채우기

# 4. 서버 실행
uvicorn app.main:app --reload
```

- API 문서(Swagger, 자동 생성 명세서): http://localhost:8000/docs
- 헬스체크: http://localhost:8000/health

## 새 기능(엔드포인트) 추가하는 법

`queries.py`를 템플릿으로 3단계:

1. `models/`에 테이블 ORM 추가 (서빙할 테이블만)
2. `schemas/`에 요청/응답 Pydantic 추가
3. `api/v1/`에 라우터 파일 만들고 → `router.py`에 `include_router` 한 줄 추가

## 다음에 추가할 라우터 (권장 순서)

| 파일 | 엔드포인트 | 화면 | 테이블 |
|---|---|---|---|
| `risks.py` | GET /risks | dashboard, risks | country_risk_scores |
| `recommendations.py` | GET /queries/{id}/countries, /suppliers | recommendations, suppliers | procurement_/supplier_recommendations |
| `reports.py` | POST/GET /reports | reports | reports |
| `alerts.py` | GET /alerts | alerts | alerts |
| `auth.py` | POST /auth/google | login | users (마지막, 처음엔 stub) |
