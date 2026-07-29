# SupplyGuard 개발 변경·인수인계 문서

- 작성일: 2026-07-29
- 작업 브랜치: `feature/frontend`
- 현재 HEAD: `dbd1de6` (`origin/main`과 동일)
- 비교 기준: `origin/feature/frontend` 이후 오늘 반영된 커밋 + 현재 작업 트리의 미커밋 변경
- 목적: 오늘 변경된 기능, 실제 동작 범위, 실행 조건, 남은 작업을 다음 개발자가 한눈에 파악하도록 정리

## 1. 한눈에 보는 현재 상태

| 영역 | 오늘 변경된 핵심 내용 | 현재 상태 |
|---|---|---|
| 프론트 API 계층 | 공통 API 클라이언트, 로그인·품목·위험도·추천·보고서·알림 API 함수 추가 | 코드 구현 완료 |
| 이메일 로그인 | 이메일 폼을 `POST /auth/login`에 연결, 토큰 저장, 성공 시 대시보드 이동 | 백엔드/DB 실행 후 통합 검증 필요 |
| 인증 헤더 | `localStorage.access_token`을 읽어 모든 API 요청에 `Authorization: Bearer` 자동 첨부 | 코드 구현 완료 |
| Google 로그인 | 실제 OAuth가 없는 상태에서 사용자 오인을 막도록 비활성화 | 완료 |
| 품목 등록 | `POST /queries` 연결, 생성된 `query_id`를 추천 화면으로 전달 | 백엔드/DB 실행 후 통합 검증 필요 |
| 국가 선택 | ISO 3166-1 기반 249개 국가·지역, 코드/한글 검색, 직접 입력과 목록 선택 지원 | 브라우저 동작 검증 완료 |
| 추천 화면 | 국가·기업 추천 API 연결, 국가 코드를 한글 국가명으로 표시 | API 데이터 통합 검증 필요 |
| 대시보드 | 로그인 사용자의 등록 품목별 위험도 그래프·표·경보·최근 보고서 조회 | 빈 상태 UI 검증 완료, 실제 데이터 검증 필요 |
| 뉴스 영역 | 향후 네이버 뉴스 API/크롤러가 사용할 자리로 유지 | 의도적으로 정적 데모 유지 |
| 보고서 | 생성·목록·상세·편집·저장·브라우저 PDF 출력 흐름 추가 | API/DB 통합 검증 필요 |
| 설정 | 계정 정보와 위험 품목을 API로 조회, 가짜 기업/팀 목록 제거 | 조회 기능 구현, 알림 설정 저장은 미구현 |
| 백엔드 | FastAPI 라우터, 인증 스텁, 추천 엔진, 비동기 AI 분석, 보고서/알림 API 추가 | 실행 환경 미구성 |
| 데이터/AI | S·C·V·L·P·E 6개 지표 파이프라인, 규칙 기반 추천, AI 모델 패키지 추가 | DB/API 키 준비 후 실행 가능 |

> 중요: 프론트엔드 화면과 실패/빈 상태는 확인했지만, 현재 개발 노트북에는 PostgreSQL과 백엔드 실행 환경이 없어 로그인 성공부터 이어지는 전체 E2E는 아직 검증되지 않았다.

## 2. 사용자 흐름 기준 변경 내용

### 2.1 로그인과 인증

관련 파일:

- `Frontend/lib/api.ts`
- `Frontend/app/login/page.tsx`
- `backend/app/api/v1/auth.py`
- `backend/app/core/security.py`

변경 내용:

1. 이메일을 입력하고 `이메일로 로그인`을 누르면 `POST /api/v1/auth/login`을 호출한다.
2. 백엔드는 동일 이메일 사용자가 없으면 `users` 테이블에 자동 생성한다.
3. 응답의 `access_token`을 브라우저 `localStorage`의 `access_token` 키로 저장한다.
4. 이후 공통 `http()` 함수가 모든 API 요청에 Bearer 토큰을 자동으로 붙인다.
5. 로그인 성공 시 `/dashboard`로 이동한다.
6. Google 로그인은 `Google 로그인 (준비 중)`으로 표시하고 비활성화했다.
7. 실패 시 로그인 화면에서 사용자용 오류 메시지를 표시한다.

현재 인증은 운영 인증이 아니라 개발용 스텁이다.

- 토큰 형식: `stub-{user_id}`
- 비밀번호 검증: 없음
- 실제 Google OAuth/JWT: 미구현
- 운영 배포 전 `backend/app/core/security.py` 교체 필요

### 2.2 품목 등록과 국가 선택

관련 파일:

- `Frontend/app/items/new/page.tsx`
- `Frontend/lib/countries.ts`

변경 내용:

- `CA`, `JP` 같은 ISO2 코드를 직접 입력하면 `캐나다`, `일본`으로 변환한다.
- 한글 국가명도 직접 입력할 수 있다.
- `+ 추가`를 누르면 ISO 3166-1 국가·지역 목록을 펼친다.
- 코드와 한글 국가명으로 목록을 검색할 수 있다.
- 이미 추가된 국가는 목록에서 제외하고 중복 추가를 방지한다.
- 추가된 국가를 개별 삭제할 수 있다.
- 브라우저의 `Intl.DisplayNames("ko")`를 사용해 국가 코드를 한글명으로 변환한다.
- 예외적으로 서비스 표현에 맞게 `KR=한국`, `US=미국`을 덮어쓴다.
- 품목 등록 성공 시 반환받은 `query_id`로 `/recommendations?query_id={id}`에 이동한다.

주의사항:

- 화면에서는 여러 주요 공급국을 선택하지만 현재 `QueryCreate` API에는 복수 공급국 필드가 없다.
- 현재 백엔드 요청에는 `importer_code: "KR"`만 전달된다.
- 선택한 공급국 목록을 DB에 영구 저장하려면 API 스키마와 테이블 확장이 필요하다.

### 2.3 추천 화면

관련 파일:

- `Frontend/app/recommendations/page.tsx`
- `Frontend/lib/countries.ts`
- `backend/app/api/v1/recommendations.py`
- `backend/app/api/v1/suppliers.py`
- `backend/app/services/recommend.py`

변경 내용:

- `query_id`가 있으면 국가 추천과 기업 추천을 API에서 조회한다.
- API의 `country_code`를 공통 국가명 함수로 변환한다.
- 일부 코드만 지원하던 기존 `COUNTRY_NAME` 상수는 제거했다.
- 국가 위험도, 적합도, 예상 단가, 관세, 리드타임을 API 응답 기준으로 표시한다.
- 규칙 기반 추천 엔진은 동일 HS 코드의 SGRI가 낮은 국가부터 순위를 생성한다.
- 해당 HS 코드를 취급하는 기업은 소속국 SGRI를 기준으로 추천한다.

`query_id`가 없는 직접 접근에는 아직 데모 추천 데이터가 표시된다.

### 2.4 품목별 대시보드

관련 파일:

- `Frontend/app/dashboard/page.tsx`
- `Frontend/lib/api.ts`
- `backend/app/api/v1/queries.py`

변경 내용:

- 전체 평균 대신 로그인 사용자가 등록한 품목 단위로 위험도를 본다.
- `GET /queries`를 추가해 현재 사용자의 등록 품목만 최신순으로 조회한다.
- 품목 선택 콤보박스로 확인할 HS 코드를 선택한다.
- 선택 품목의 날짜별 공급국 SGRI 중 최대값을 그래프 점수로 사용한다.
- 기간은 최근 7일/30일/90일로 전환한다.
- 위험 표는 사용자가 등록한 HS 코드에 해당하는 데이터만 표시한다.
- 사용자 이름, 미읽음 경보 수, 최근 보고서를 각각 API에서 조회한다.
- API 실패 또는 데이터 없음 상태에서는 가짜 위험도 대신 0과 빈 상태를 표시한다.
- 국가 코드는 공통 한글 국가명 함수로 표시한다.

의도적으로 유지된 정적 영역:

- `최신 동향` 뉴스 3건: 향후 네이버 뉴스 API 또는 크롤링 뉴스로 교체 예정
- 대체 공급국 카드: 현재 AU/CL/CA 데모 표시

### 2.5 보고서 생성·목록·편집

관련 파일:

- `Frontend/app/reports/new/page.tsx`
- `Frontend/app/reports/[reportId]/page.tsx`
- `Frontend/lib/api.ts`
- `backend/app/api/v1/reports.py`
- `backend/app/schemas/report.py`

변경 내용:

- 보고서 목록을 `GET /reports`로 조회한다.
- `query_id` 없이 생성하면 `POST /reports`로 기본 목차 초안을 만든다.
- `query_id`가 있으면 `POST /queries/{id}/analyze`로 비동기 분석을 시작한다.
- `GET /queries/analyze/jobs/{job_id}`를 폴링하고 완료된 보고서를 조회한다.
- 보고서 상세 경로 `/reports/{reportId}`를 추가했다.
- 제목, 요약, 섹션 본문을 편집하고 `PATCH /reports/{reportId}`로 저장한다.
- 보고서 섹션이 배열 또는 객체 형태로 와도 화면에서 정규화한다.
- 브라우저 인쇄 기능을 이용한 PDF 저장 버튼을 제공한다.

현재 제한:

- 보고서 API는 아직 로그인 사용자 기준으로 목록과 상세 접근을 제한하지 않는다.
- PDF 파일을 서버에서 생성하거나 저장하는 기능은 없다. 현재는 브라우저 인쇄 방식이다.
- 이메일 발송 기능은 없다.

### 2.6 설정 화면

관련 파일:

- `Frontend/app/settings/page.tsx`

변경 내용:

- 가짜 기업명, 담당자, 팀원, 품목 목록을 제거했다.
- 기업 정보 탭은 `GET /auth/me` 응답의 사용자 정보를 읽기 전용으로 표시한다.
- 공급망 품목 탭은 위험도 API의 최신 HS 코드별 데이터를 표시한다.
- 팀 탭은 현재 로그인 사용자만 표시한다.
- API 데이터가 없으면 명시적인 빈 상태를 보여준다.
- 알림 스위치는 화면에서만 변경된다는 설명을 추가했다.

남은 작업:

- 기업 정보 조회·수정 API
- 팀원/수신자 CRUD API
- 알림 기준 조회·저장 API
- 사용자와 회사 연결 온보딩

## 3. 오늘 추가·연결된 백엔드 기능

### API 라우터

| Method | 경로 | 용도 | 인증 상태 |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | 이메일 로그인/최초 사용자 생성 | 불필요 |
| `GET` | `/api/v1/auth/me` | 현재 로그인 사용자 | Bearer 필수 |
| `POST` | `/api/v1/queries` | 품목 질의 생성 | 토큰 선택, 있으면 사용자 연결 |
| `GET` | `/api/v1/queries` | 내 등록 품목 목록 | Bearer 필수 |
| `GET` | `/api/v1/queries/{id}` | 품목 질의 상세 | 현재 인증 제한 없음 |
| `GET` | `/api/v1/risks` | 국가·HS별 SGRI 조회 | 현재 인증 제한 없음 |
| `GET` | `/api/v1/queries/{id}/countries` | 국가 추천 | 현재 인증 제한 없음 |
| `GET` | `/api/v1/queries/{id}/suppliers` | 기업 추천 | 현재 인증 제한 없음 |
| `POST` | `/api/v1/queries/{id}/analyze` | AI 심층 분석 시작 | 현재 인증 제한 없음 |
| `GET` | `/api/v1/queries/analyze/jobs/{job_id}` | 분석 상태 폴링 | 현재 인증 제한 없음 |
| `POST` | `/api/v1/reports` | 보고서 기본 초안 생성 | 현재 인증 제한 없음 |
| `GET` | `/api/v1/reports` | 보고서 목록 | 현재 인증 제한 없음 |
| `GET` | `/api/v1/reports/{id}` | 보고서 상세 | 현재 인증 제한 없음 |
| `PATCH` | `/api/v1/reports/{id}` | 보고서 편집 저장 | 현재 인증 제한 없음 |
| `GET` | `/api/v1/alerts` | 알림 목록 | 현재 인증 제한 없음 |
| `PATCH` | `/api/v1/alerts/{id}/read` | 알림 읽음 처리 | 현재 인증 제한 없음 |

### 백엔드 서비스

- SQLAlchemy 기반 PostgreSQL 연결과 ORM 모델 추가
- 로그인 사용자와 `user_queries.user_id` 연결
- SGRI 기반 국가·기업 규칙 추천 엔진 추가
- AI 분석을 FastAPI `BackgroundTasks`로 비동기 실행
- 분석 상태를 `pending/done/error`로 폴링
- AI 결과를 `supplier_recommendations`와 `reports`에 저장

분석 작업 상태는 현재 프로세스 메모리에만 저장되므로 서버 재시작 시 사라진다. 운영 환경에서는 Redis, Celery/RQ 또는 DB 작업 테이블로 교체해야 한다.

## 4. 데이터 파이프라인과 AI 모델 변경

오늘 브랜치에 포함된 주요 범위:

- `AI_Model/` Python 패키지 추가
- 조달 입력 검증, SGRI 계산, 기업 후보 추천, 보고서 초안 생성
- Gemini 키가 없거나 호출 실패 시 규칙 기반 결과로 대체
- World Bank WGI 2024 API 변경 대응
- GDACS 재난 데이터 및 국가코드 매핑
- IMF PortWatch ArcGIS 엔드포인트 연동
- Comtrade 다년도 데이터 적재
- FRED/ECOS 가격 데이터 적재 수정
- S·C·V·L·P·E 여섯 지표를 국가×품목 SGRI에 병합
- ESG 탄소 위험 지표 연결
- 서비스용 DB 스키마, 데모 시드, 기업 조달 보강 마이그레이션 추가

실제 데이터 파이프라인 실행에는 PostgreSQL과 아래 키/데이터가 필요하다.

- 관세청 API 키
- UN Comtrade API 키
- FRED API 키
- 한국은행 ECOS API 키
- 선택: Gemini API 키
- 선택: CBAM/LCI 원본 파일

## 5. 현재 작업 트리의 미커밋 변경

의도된 변경 파일:

```text
Frontend/app/dashboard/page.tsx
Frontend/app/items/new/page.tsx
Frontend/app/login/page.tsx
Frontend/app/recommendations/page.tsx
Frontend/app/reports/new/page.tsx
Frontend/app/reports/[reportId]/page.tsx       (신규)
Frontend/app/settings/page.tsx
Frontend/lib/api.ts
Frontend/lib/countries.ts                      (신규)
backend/app/api/v1/queries.py
backend/app/api/v1/reports.py
backend/app/schemas/report.py
```

현재 아래 `* 2.sql` 파일들은 중복 이름의 미추적 파일이다. 오늘 기능 변경으로 간주하지 않았으며 내용 확인 없이 커밋하면 안 된다.

```text
database/calc_esg_risk 2.sql
database/calc_logistics_risk 2.sql
database/calc_merge_item 2.sql
database/calc_policy_risk 2.sql
database/calc_sgri 2.sql
database/migrate_companies_procurement 2.sql
database/seed_hs_codes 2.sql
database/supplyguard_schema_v2 2.sql
database/supplyguard_schema_v3_service 2.sql
```

## 6. 검증 결과

### 완료한 정적 검증

- 프론트엔드 `next build` 성공
- TypeScript 타입 검사 성공
- 백엔드 Python 구문 컴파일 성공

### 브라우저에서 확인한 프론트 동작

- Google 로그인 버튼 실제 비활성화
- 이메일 제출 시 API 요청 시도 및 실패 메시지 표시
- `CA` 직접 입력 → `캐나다` 추가
- `+ 추가` 국가 목록 표시
- `일본` 검색 → `JP` 선택·추가
- 추가 국가 삭제
- 품목 필수값 오류 표시
- 추천 화면 국가 코드와 한글명 동시 표시
- 대시보드의 품목 없음/위험 이력 없음 상태
- 보고서 목록 없음 상태
- 설정의 계정/품목/팀 없음 상태와 탭 이동
- 브라우저 콘솔 오류 없음

### 아직 완료하지 못한 통합 검증

- 실제 로그인 성공
- 사용자 자동 생성 확인
- 토큰 발급·저장 후 `/dashboard` 이동
- Bearer 토큰이 포함된 `GET /auth/me`, `GET /queries` 성공
- 품목 생성 후 추천 결과 조회
- 품목별 대시보드 실제 그래프
- AI 분석과 보고서 생성·편집 저장
- 알림 목록 및 읽음 처리

미완료 원인: 현재 개발 노트북에 PostgreSQL, Python 3.11 백엔드 가상환경, 백엔드 `.env`, 실행 중인 FastAPI 서버가 없다.

## 7. 다음 개발자가 먼저 해야 할 일

우선순위 순서:

1. Python 3.11과 PostgreSQL 설치
2. `supplyguard` DB 생성 및 v2/v3 스키마·기준 데이터 적용
3. `backend/.env` 생성
4. 백엔드 가상환경 생성 및 `requirements.txt` 설치
5. `localhost:8000`에서 FastAPI 실행
6. 프론트엔드와 백엔드를 동시에 실행해 실제 로그인부터 E2E 테스트
7. API 성공을 확인한 뒤 현재 의도된 변경 파일만 커밋
8. 보고서·알림·질의 상세 API를 로그인 사용자 소유 데이터로 제한
9. 다중 주요 공급국 저장 API 설계
10. 뉴스 수집 API가 준비되면 대시보드의 뉴스 정적 배열만 교체

## 8. 현재 개발 노트북 환경

확인된 상태:

| 항목 | 상태 |
|---|---|
| Mac | Apple Silicon M4 Pro, `arm64` |
| Node.js | `v24.18.0` 설치됨 |
| npm | `11.16.0` 설치됨 |
| 프론트엔드 `node_modules` | 있음 |
| Homebrew | 설치됨 |
| Python | 시스템 Python `3.9.6`만 있음 |
| Python 3.11 | 설치 필요 |
| PostgreSQL/`psql` | 설치 필요 |
| 백엔드 `.venv` | 없음 |
| 백엔드 `.env` | 없음 |

Conda는 필수가 아니다. Python 3.11의 표준 `venv` 사용을 권장한다.

## 9. 문서 및 브랜치 주의사항

- 백엔드 자동 Swagger 문서: 백엔드 실행 후 `http://localhost:8000/docs`
- `docs/api-spec.md` 커밋 `7711c80`은 현재 `feature/frontend`가 아니라 `origin/backend1`에만 존재한다.
- API 명세 문서가 필요하면 내용을 검토한 뒤 해당 커밋을 현재 브랜치에 반영해야 한다.
- 현재 `feature/frontend` HEAD는 `origin/main`과 같고, `origin/feature/frontend`보다 25개 커밋 앞서 있다.
- 작업 트리가 깨끗하지 않으므로 커밋 전에 의도된 변경과 중복 SQL 파일을 반드시 분리한다.

## 10. 완료 기준

다음 조건을 모두 만족해야 오늘 구현을 “실제 연결 완료”로 판단한다.

1. `/health`가 200과 `{"status":"ok"}`를 반환한다.
2. 처음 보는 이메일로 로그인하면 `users` 행이 생성된다.
3. 브라우저 `localStorage.access_token`에 토큰이 저장된다.
4. `/auth/me` 요청에 Bearer 토큰이 포함되고 사용자 정보를 반환한다.
5. 품목 등록 후 `user_queries.user_id`가 로그인 사용자와 연결된다.
6. 추천 화면이 생성된 `query_id`의 국가·기업 추천을 표시한다.
7. 대시보드가 사용자의 등록 품목만 선택지와 그래프로 표시한다.
8. 보고서를 생성하고 상세 페이지에서 편집한 내용이 DB에 저장된다.
9. 프론트엔드 빌드·타입 검사와 백엔드 테스트가 모두 통과한다.
