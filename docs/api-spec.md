# SupplyGuard API 명세서

백엔드(FastAPI) REST API 규격. 프론트엔드·AI 연동 시 이 문서를 계약으로 사용한다.

- **Base URL**: `http://localhost:8000/api/v1` (헬스체크만 `/health`)
- **자동 문서(Swagger)**: `http://localhost:8000/docs` — 이 문서와 항상 동기화됨
- **인증**: 일부 엔드포인트는 `Authorization: Bearer <토큰>` 헤더 사용
  - 현재는 **stub 토큰** (`stub-{user_id}`, 예: `stub-1`). 추후 Google OAuth + JWT로 교체 예정.
- **에러 포맷**: `{ "detail": "메시지" }` (FastAPI 기본), 상태코드로 구분 (400/401/404/422/500)
- **날짜**: `YYYY-MM-DD`, 타임스탬프: ISO8601

---

## 엔드포인트 요약

| 기능 | Method | Path | 인증 | 화면(기능) |
|---|---|---|---|---|
| 로그인/가입 | POST | `/auth/login` | – | 로그인 (F-01) |
| 내 정보 | GET | `/auth/me` | 필수 | – |
| 품목 입력 | POST | `/queries` | 선택 | items/new (F-01) |
| 품목 조회 | GET | `/queries/{query_id}` | – | – |
| AI 심층분석 시작 | POST | `/queries/{query_id}/analyze` | – | reports (F-09) |
| 분석 작업 상태 | GET | `/queries/analyze/jobs/{job_id}` | – | (폴링) |
| 국가별 SGRI | GET | `/risks` | – | dashboard/risks (F-05) |
| 국가 추천 | GET | `/queries/{query_id}/countries` | – | recommendations (F-06) |
| 기업 추천 | GET | `/queries/{query_id}/suppliers` | – | suppliers (F-07/08) |
| 보고서 생성 | POST | `/reports` | – | reports (F-10) |
| 보고서 목록 | GET | `/reports` | – | reports |
| 보고서 조회 | GET | `/reports/{report_id}` | – | reports |
| 알림 목록 | GET | `/alerts` | – | alerts (F-10) |
| 알림 읽음 | PATCH | `/alerts/{alert_id}/read` | – | alerts |
| 헬스체크 | GET | `/health` | – | – |

> "인증 선택": 토큰이 있으면 사용자와 연결(user_id 기록), 없어도 동작.

---

## 1. 인증 (auth)

### POST `/auth/login` — 로그인/회원가입 (stub)
이메일로 사용자를 찾고, 없으면 생성 후 토큰 발급.

**요청 본문**
```json
{ "email": "jswook@kookmin.ac.kr", "name": "승요" }
```
**응답 200**
```json
{
  "access_token": "stub-1",
  "token_type": "bearer",
  "user": { "user_id": 1, "email": "jswook@kookmin.ac.kr", "name": "승요", "company_id": null, "role": "member" }
}
```

### GET `/auth/me` — 현재 사용자
**헤더**: `Authorization: Bearer stub-1`
**응답 200**: `UserOut` (위 user와 동일 형태) · **401**: 토큰 없음/무효

---

## 2. 품목 질의 (queries)

### POST `/queries` — 거래 희망 품목 입력
저장 후 규칙엔진이 국가·기업 추천을 자동 생성한다. 토큰 있으면 `user_id` 기록.

**요청 본문** (모든 필드 선택)
```json
{
  "item_name": "리튬 탄산염",
  "hs_code": "283691",
  "required_qty": 100000,
  "qty_unit": "kg",
  "target_price": 19,
  "lead_time_days": 60,
  "importer_code": "KR"
}
```
**응답 201** — `QueryOut`
```json
{
  "item_name": "리튬 탄산염", "hs_code": "283691", "required_qty": "100000",
  "qty_unit": "kg", "target_price": "19", "lead_time_days": 60, "importer_code": "KR",
  "query_id": 1, "user_id": null, "created_at": null
}
```
> `hs_code`는 `hs_codes` 테이블에 존재해야 함(FK). 없는 코드면 500.

### GET `/queries/{query_id}` — 질의 조회
**응답 200**: `QueryOut` · **404**: 없음

### POST `/queries/{query_id}/analyze` — AI 심층분석 시작 (비동기)
AI_Model(Gemini)로 기업 추천 정교화 + 보고서 + 가중치 생성. **즉시 202 반환**, 백그라운드 실행.

**응답 202**
```json
{ "job_id": "b820763b2d4b4ff5996e019a9c14d64b", "status": "pending" }
```

### GET `/queries/analyze/jobs/{job_id}` — 분석 작업 상태 (폴링)
`pending` 동안 1.5초 간격 폴링 권장.
**응답 200**
```json
{
  "job_id": "b820...", "status": "done",
  "result": { "query_id": 12, "sgri_score": 44.5, "level": "보통", "report_id": 6, "supplier_count": 3 }
}
```
`status`: `pending` | `done`(+`result`) | `error`(+`error`) · **404**: 없는 job

---

## 3. 리스크 (risks)

### GET `/risks` — 국가별 SGRI 점수
**쿼리 파라미터**: `hs_code`(선택), `country`(ISO2, 선택) · SGRI 높은 순 정렬
**응답 200** — `RiskScoreOut[]`
```json
[
  {
    "country_code": "CN", "hs_code": "283691", "as_of_date": "2024-01-01",
    "score_s": "25.549", "score_c": "73.140", "score_v": "6.279",
    "score_l": "31.250", "score_p": "54.903", "score_e": "27.500",
    "sgri_score": "43.835", "level": "중간"
  }
]
```
> `level`: 서버 계산값 (SGRI ≥50 "높음" / ≥25 "중간" / else "낮음")

---

## 4. 추천 (recommendations / suppliers)

### GET `/queries/{query_id}/countries` — 국가 추천 (rank순)
**응답 200** — `RecommendationOut[]`
```json
[
  {
    "country_code": "CA", "rank": 1, "sgri_score": "36.878", "fit_score": "63.100",
    "est_unit_price": null, "tariff_percent": null, "est_lead_days": null,
    "rationale": "SGRI 36.9점으로 위험 수준 중간. 후보 국가 중 1순위."
  }
]
```

### GET `/queries/{query_id}/suppliers` — 기업 추천 (기업정보 포함)
**응답 200** — `SupplierRecommendationOut[]` (기업 정보 `company` 중첩)
```json
[
  {
    "rank": 1, "fit_score": "95.000", "est_unit_price": null, "est_lead_days": null,
    "delivery_feasibility": "높음",
    "rationale": "SQM은 목표 단가($19)보다 낮은 $18.5를 제시...",
    "company": {
      "company_id": 1, "name": "SQM", "country_code": "CL",
      "certifications": ["ISO 9001", "ISO 14001"],
      "annual_capacity": "120000.00", "capacity_unit": "ton/year", "status": "active"
    }
  }
]
```

---

## 5. 보고서 (reports)

### POST `/reports` — 보고서 초안 생성
목차 뼈대(빈 섹션)로 draft 생성. (본문은 AI 분석/편집으로 채움)
**요청 본문**: `{ "query_id": 2, "title": "리튬 리스크 보고서" }` (둘 다 선택)
**응답 201** — `ReportOut`
```json
{
  "report_id": 1, "query_id": 2, "title": "리튬 리스크 보고서", "status": "draft",
  "sections": { "개요": "", "국가별 위험도(SGRI) 분석": "", "추천 조달국 및 근거": "", "추천 공급기업": "", "리스크 대응 방안": "" },
  "summary": null, "pdf_url": null, "created_at": null
}
```

### GET `/reports` — 보고서 목록
**쿼리 파라미터**: `query_id`(선택) · 최신순
**응답 200** — `ReportOut[]`

### GET `/reports/{report_id}` — 보고서 조회
**응답 200** — `ReportOut` · **404**: 없음
> AI 분석으로 생성된 보고서는 `sections`가 `[{ "id", "title", "body" }]` **리스트** 형태 (Gemini 결과). 초안은 dict 형태. `sections`는 두 형태 모두 허용.

---

## 6. 알림 (alerts)

### GET `/alerts` — 알림 목록
**쿼리 파라미터**: `query_id`(선택), `unread_only`(bool, 기본 false) · 최신순
**응답 200** — `AlertOut[]`
```json
[
  {
    "alert_id": 2, "query_id": 2, "country_code": "CL", "hs_code": "283691",
    "alert_type": "물류", "severity": "high", "title": "칠레 발파라이소항 혼잡 심화",
    "message": "...리튬 선적 지연 가능. 납기 영향 검토 필요.",
    "is_read": false, "created_at": "2026-07-29T16:41:39+09:00"
  }
]
```
`severity`: `high` | `medium` | `low`

### PATCH `/alerts/{alert_id}/read` — 알림 읽음 처리
**응답 200** — 갱신된 `AlertOut` (`is_read: true`) · **404**: 없음

---

## 부록: 공통 규약 & 미구현

- **인증**: 지금은 stub. 실제 Google OAuth 전환 시 `core/security.py`의 `create_access_token`/`get_current_user`만 JWT로 교체하면 인터페이스 동일하게 유지됨.
- **미구현/후속** (프론트·AI 팀 참고):
  - `recommendation_feedback`(피드백) — 테이블만 있고 엔드포인트 없음 (추가 예정)
  - 이메일 발송(보고서 공유) — 미구현
  - 서버 PDF — 현재 브라우저 인쇄 방식(클라이언트)
  - 국가/기업 추천은 현재 **HS 283691(리튬)** 만 데이터 존재 — 다른 품목은 빈 배열
