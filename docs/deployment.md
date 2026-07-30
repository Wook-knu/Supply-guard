# 배포 가이드 (SupplyGuard)

세 구성요소를 배포한다: **PostgreSQL**(DB) · **FastAPI**(백엔드) · **Next.js**(프론트).

> ⚠️ 비밀정보(DB 비번, GEMINI/API 키)는 **절대 커밋 금지**. 모두 환경변수로 주입한다.
> 리포의 `.env` 들은 각 `.gitignore` 로 이미 무시됨.

---

## 사전 준비
1. `.env.example` → `.env` 복사 후 값 채우기 (최소 `DB_PASSWORD`, `GEMINI_API_KEY`).
2. Docker Desktop 설치(옵션 A) 또는 Vercel/Railway 계정(옵션 B).

---

## 옵션 A — docker-compose (원커맨드, 데모/시연 권장)

리포 루트에서:
```bash
docker compose up --build
```
- 프론트: http://localhost:3000
- 백엔드: http://localhost:8000/docs
- DB: localhost:5432 (컨테이너)

처음엔 DB가 **비어 있으므로 시딩**이 필요하다(아래 참고).

### DB 시딩
**(가장 빠름) 로컬 개발 DB를 그대로 복제** — 이미 계산된 SGRI·추천 데이터까지 옮겨진다.
```bash
# 1) 로컬(개발) DB 덤프
pg_dump -h localhost -U postgres -d supplyguard -F c -f supplyguard.dump
# 2) 컨테이너 DB로 복원
docker compose exec -T db pg_restore -U postgres -d supplyguard --clean --if-exists < supplyguard.dump
```

**(처음부터 구축) 스키마 + 시드 + 수집** — 시간이 걸린다:
```bash
# 스키마
docker compose exec -T db psql -U postgres -d supplyguard < database/supplyguard_schema_v2.sql
docker compose exec -T db psql -U postgres -d supplyguard < database/supplyguard_schema_v3_service.sql
# 시드(국가·HS·LCI 등)
docker compose exec -T db psql -U postgres -d supplyguard < database/seed_countries.sql
docker compose exec -T db psql -U postgres -d supplyguard < database/seed_hs_codes.sql
# 마이그레이션(구독·항만통계·국가행 유니크 등)
docker compose exec -T db psql -U postgres -d supplyguard < database/migrate_subscriptions.sql
docker compose exec -T db psql -U postgres -d supplyguard < database/migrate_portwatch_country_stats.sql
docker compose exec -T db psql -U postgres -d supplyguard < database/migrate_country_rows_unique.sql
# 데이터 수집 + 지표 계산은 database/main.py / ingest 스크립트 참고 (API 키 필요)
```

---

## 옵션 B — Vercel(프론트) + Railway(백엔드 + 관리형 Postgres)

실서비스형 호스팅. 프론트는 Vercel, 백엔드+DB는 Railway가 편하다.

### 1) DB — Railway PostgreSQL
- Railway에서 **PostgreSQL** 플러그인 추가 → 접속정보(host/port/user/password/db) 확보.
- 위 "DB 시딩"의 pg_dump/restore로 데이터 이관(호스트만 Railway 것으로).

### 2) 백엔드 — Railway (Dockerfile 배포)
- Railway 새 서비스 → 이 리포 연결, **Root Dockerfile = `backend/Dockerfile`**, **빌드 컨텍스트 = 리포 루트**.
- 환경변수 설정:
  | 키 | 값 |
  |---|---|
  | `DB_HOST` `DB_PORT` `DB_NAME` `DB_USER` `DB_PASSWORD` | Railway Postgres 접속정보 |
  | `GEMINI_API_KEY` | 제미나이 키 |
  | `FRONTEND_ORIGIN` | 배포된 프론트 도메인 (예: `https://supplyguard.vercel.app`) |
- 배포 후 `https://<백엔드도메인>/health` 로 확인.

### 3) 프론트 — Vercel
- Vercel 새 프로젝트 → 이 리포의 `Frontend/` 를 루트로 지정.
- 환경변수: `NEXT_PUBLIC_API_BASE_URL = https://<백엔드도메인>/api/v1`
- 배포 → 프론트 도메인 확보 → 위 백엔드의 `FRONTEND_ORIGIN` 에 반영(재배포).

---

## 환경변수 요약

| 변수 | 대상 | 필수 | 설명 |
|---|---|---|---|
| `DB_HOST/PORT/NAME/USER/PASSWORD` | 백엔드 | ✅ | DB 접속 |
| `GEMINI_API_KEY` | 백엔드 | ✅ | 가중치·AI 설명·보고서 |
| `FRONTEND_ORIGIN` | 백엔드 | ✅ | CORS 허용 도메인 |
| `NEXT_PUBLIC_API_BASE_URL` | 프론트(빌드타임) | ✅ | 백엔드 API 주소 |
| `COMTRADE/CUSTOMS/FRED/ECOS_API_KEY` | 백엔드 | 선택 | 신규 품목 수집(build-sgri) |

---

## 체크리스트
- [ ] `.env` 에 실제 비밀값 채움 (커밋 안 함)
- [ ] DB 시딩 완료 (`/health` 200, `/api/v1/risks` 데이터 확인)
- [ ] 백엔드 `FRONTEND_ORIGIN` = 프론트 도메인 (CORS)
- [ ] 프론트 `NEXT_PUBLIC_API_BASE_URL` = 백엔드 도메인
- [ ] 로그인 → 대시보드 데이터 표시 확인
