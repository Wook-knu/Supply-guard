# 프론트엔드 작업 요청 (SupplyGuard)

> 대상: 프론트 담당
> 목적: 사용자 핵심 흐름(**품목 등록 → 분석 → 추천/보고서 → 피드백**)을 완성하는 데
> 아직 화면이 없거나 끊긴 기능을 채운다.
> 모든 API는 `Frontend/lib/api.ts` 의 `api.*` 를 통해 호출한다(직접 fetch 금지).
> 백엔드 base: `NEXT_PUBLIC_API_BASE_URL` (기본 `http://localhost:8000/api/v1`).

---

## 우선순위 요약

| # | 작업 | 라우트 | 상태 |
|---|------|--------|------|
| 1 | 품목 목록·관리 페이지 | `/items` | **신규 페이지** |
| 2 | 신규 품목 "분석 시작" | `/items/new` 개선 | 기존 페이지 수정 |
| 3 | 추천 피드백 저장 연결 | `/recommendations` | 기존 버튼 배선만 |
| 4 | 대시보드 전역 검색 | `/dashboard` | 기존 검색창 배선 |
| 5 | 알림 설정 저장 (선택) | `/settings` | 기존 토글 배선 |

각 작업의 API는 아래 참조. **1·2·5의 신규 API는 백엔드에서 추가 제공**(하단 "백엔드 제공 API" 참고).

---

## 1. 품목 목록·관리 페이지 `/items` ⭐

**목표**: 내가 감시 중인 품목 전체를 한 화면에서 보고, 상세로 이동하고, 삭제.

**화면 요소**
- 품목 카드/테이블: 품목명 · HS코드 · 최고 SGRI(위험 배지) · 등록일
- 각 행 액션: **리스크 상세**(`/risks/{hs_code}`) · **추천 보기**(`/recommendations?query_id={id}`) · **보고서**(`/reports/new?query_id={id}`) · **삭제**
- 우상단 "품목 추가" → `/items/new`
- 빈 상태: "아직 등록한 품목이 없습니다" + 등록 버튼

**API**
```ts
api.getQueries()                       // GET /queries → QueryOut[] (내 품목 목록)
api.getRisks(hsCode)                   // GET /risks?hs_code= → RiskOut[] (품목별 위험, 최고 SGRI 계산)
api.deleteQuery(queryId)               // DELETE /queries/{id}  ← 백엔드 신규 제공
```
`QueryOut = { query_id, item_name, hs_code, required_qty, target_price, lead_time_days, created_at, ... }`

**참고**: 최고 SGRI/레벨은 대시보드 `latestRiskRows`/`RiskBadge` 로직 재사용 가능.

---

## 2. 신규 품목 "분석 시작" (`/items/new` 개선)

**문제**: 지금은 품목을 등록(`createQuery`)만 하고, DB에 SGRI가 없는 새 HS코드는
추천/리스크가 비어 나온다.

**목표**: 등록 후 "이 품목 분석 시작" 버튼 → build-sgri job 실행 → 진행률 표시 → 완료 시 추천으로 이동.

**흐름 (job + 폴링, analyze 흐름과 동일 패턴)**
```ts
const { job_id } = await api.buildItemSgri(hsCode)     // POST /items/{hs}/build-sgri → 202 {job_id}
// 폴링 (~1.5s 간격, 최대 ~60s): 무거운 작업(Comtrade 다년 수집)
let job = await api.getBuildJob(job_id)                // GET /items/build/jobs/{job_id}
// job.status: "pending" | "done"(+result) | "error"(+error)
```
완료(`done`) 시 `result.countries` 표시 후 `/recommendations?query_id=` 로 유도.
**주의**: 수십 초 걸릴 수 있음 → 스피너/진행 문구 필수, 버튼 중복 클릭 방지.

> 기존 AI 분석 폴링(`/reports/new` 의 `analyzeQuery`/`getAnalyzeJob`)과 UX 동일하게 맞추면 됨.

---

## 3. 추천 피드백 저장 (`/recommendations`)

**문제**: "도움 됐어요 / 다시 추천받기" 버튼이 **로컬 상태만** 바꾸고 저장 안 됨.

**목표**: 클릭 시 실제 저장.
```ts
api.sendFeedback({ reco_type: "country", reco_id: selectedCountryRecoId, rating: 1 })   // 👍=1 / 👎=-1
// POST /feedback  ← 이미 완성되어 있음
```
`reco_id` 는 현재 선택된 국가 추천의 id. (국가 추천 응답에 rank/… 있음 — 저장용 id 필드가 필요하면 백엔드에 요청)
저장 성공 후 "피드백이 저장되었습니다" 유지.

---

## 4. 대시보드 전역 검색 (`/dashboard`)

**문제**: 헤더 검색창(`품목, 국가, 공급사 검색`)이 동작 안 함.

**목표**: 입력값으로 내 품목/국가 필터 → 결과 클릭 시 해당 리스크/추천으로 이동.
- 별도 백엔드 불필요: `api.getQueries()` + `api.getRisks()` 결과를 클라이언트에서 필터.
- 간단 버전: 품목명/HS/국가코드 부분일치 → 드롭다운 결과 → `/risks/{hs}` 이동.

---

## 5. 알림 설정 저장 (선택, `/settings`)

**문제**: 알림 기준 토글(고위험/뉴스/보고서)이 로컬 상태만.

**목표**: 저장 연결.
```ts
api.getAlertSettings()                 // GET /alert-settings  ← 백엔드 신규 제공
api.saveAlertSettings({ high_risk: true, news: true, monthly_report: true, high_threshold: 70 })
                                       // PUT /alert-settings  ← 백엔드 신규 제공
```

---

## 백엔드 제공 API (프론트 언블록용)

| 엔드포인트 | 용도 | 상태 |
|---|---|---|
| `GET /queries` | 내 품목 목록 | ✅ 있음 |
| `DELETE /queries/{id}` | 품목 삭제 (본인만, 204) | ✅ **추가됨** |
| `POST /items/{hs}/build-sgri` → `202 {job_id}` | 신규 품목 분석(비동기) | ✅ **job화 완료** |
| `GET /items/build/jobs/{job_id}` | 분석 진행 상태 | ✅ **추가됨** |
| `POST /feedback` | 추천 피드백 | ✅ 있음 |
| `GET /risks?hs_code=` | 국가별 SGRI(6지표 포함) | ✅ 있음 |
| `GET/PUT /alert-settings` | 알림 설정 | 🔧 (원하면 추가) |

> `api.ts` 에 신규 메서드(`deleteQuery`, `buildItemSgri`, `getBuildJob`, `sendFeedback`, `getAlertSettings`, `saveAlertSettings`)를 추가해야 함. 백엔드 배포 후 시그니처 공유 예정.

---

## 공통 규칙
- 인증: 로그인 토큰은 `localStorage.access_token`, `api.ts` 의 `http()` 가 자동 첨부.
- 스타일: 기존 페이지(대시보드/추천)의 shadcn/ui + Tailwind 패턴 그대로.
- 빈 상태·로딩·에러 문구 항상 처리(기존 페이지 참고).
- 하드코딩 금지: 모든 수치/목록은 API 응답으로.
