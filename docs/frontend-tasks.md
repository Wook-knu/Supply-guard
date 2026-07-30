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

## 6. 구독/요금제 페이지 `/pricing` (또는 `/subscription`) ⭐

**목표**: 요금제(Basic/Pro/Enterprise) 비교 → 구독/업그레이드 → 기능 잠금(paywall) 처리.
수익모델 반영: Basic 30만/월, Pro 100만/월, Enterprise 300만+/별도견적.

**화면**
- 3개 플랜 카드(가격·대상·기능 목록), 현재 플랜 배지, 각 카드 "이 요금제로 변경" 버튼
- 사용량 표시: "품목 3 / 5" (Basic 한도)
- Enterprise는 `custom_quote:true` → "문의하기"

**API**
```ts
api.getSubscription()   // GET /subscription → { plans:[...], current_plan, label, usage:{items,items_limit}, features }
api.subscribe("pro")    // POST /subscription {plan} → 변경(데모 mock 결제, 즉시 반영)
```
`plans[]` 각 항목: `{ key, label, price_krw, target, max_items, custom_quote, highlights[], features{} }`

**Paywall 처리 (중요)**: 아래 요청이 **402**를 주면 "요금제 업그레이드 필요" 안내 + `/pricing` 유도.
- 품목 6개째 등록(`POST /queries`) — Basic 한도(5) 초과
- AI 보고서 생성(`POST /queries/{id}/analyze`) — Pro 이상
- 가중치 재계산(`POST /items/{hs}/reweight`) — Pro 이상
> 402 응답 `detail` 에 사용자용 한글 안내 메시지가 담겨 있으니 그대로 표시하면 됨.
> 현재 플랜 기능은 `getSubscription().features` (`recommendations/ai_reports/reweight/api_access`)로 미리 버튼 비활성화 가능.

`UserOut` 에 `plan` 필드 추가됨 → 로그인 직후 플랜 표시 가능.

---

## 7. 실행 피드백 반영 (대시보드·추천 화면 개선)

### 7-1. 대시보드 메트릭 카드 클릭 → 상세 (FE)
4개 카드를 링크로:
- 선택 품목 위험도 → `/risks/{hs_code}`
- 모니터링 품목 → `/items`
- 활성 경보 → `/alerts`
- 대체 공급국 → `/recommendations?query_id={id}`

### 7-2. 사이드바 공통 레이아웃 (FE)
현재 대시보드에만 있는 좌측 메뉴가 상세 페이지로 가면 사라짐.
→ 사이드바를 **공통 컴포넌트/레이아웃**으로 빼서 모든 내부 페이지(`/risks`, `/recommendations`, `/suppliers`, `/reports`, `/items`, `/settings`, `/pricing`)에 적용.
(App Router `layout.tsx` 그룹 라우트 활용 추천)

### 7-3. SGRI 설명 (FE)
사용자가 "SGRI가 뭔지, 무슨 근거로 위험을 판단하는지" 알 수 있게:
- SGRI 점수 옆 ⓘ 아이콘 → 툴팁/모달로 6지표(S·C·V·L·P·E) 요약
- `/methodology` 안내 페이지 (내용은 [docs/methodology.md](methodology.md) 재사용)

### 7-4. 국가 비교 기능 (FE) — "비교하기" 실제 동작
- 국가 카드의 "비교" 체크박스로 2개 이상 선택 → "비교하기" 클릭
- **6지표 표 + 레이더/막대 차트**로 나란히 비교 (가격·관세·리드타임도)
- 데이터: `getCountryRecos()` 응답에 **6지표(score_s~e)가 이제 포함됨** → 별도 호출 불필요

### 7-5. "왜 이 국가?" AI 상세 설명 (FE)
- 추천 근거 카드에 "왜 추천했나요? (AI)" 버튼
```ts
api.explainCountry(queryId, countryCode)
// GET /queries/{id}/countries/{code}/explain
// → { summary, factors:[{label,detail}], recommendation, source }
```
버튼 클릭 시 로딩 후 summary + factors 표시. (`source:"gemini"|"fallback"`)

### 7-6. 기업 추천 강조 + 여러 개 + 비교 + AI 설명 (FE)
- 기업 추천을 **국가 추천과 동등한 비중**으로 (구석 배치 X → 별도 섹션/탭)
- 여러 기업 카드 표시(현재 3곳), 국가처럼 **비교하기** 지원
  - `getSupplierRecos()` 응답의 `company` 에 **단가·리드타임·정시납품률·불량률 포함됨**
- 각 기업 "왜 추천? (AI)" 버튼
```ts
api.explainSupplier(queryId, companyId)
// GET /queries/{id}/suppliers/{company_id}/explain → { summary, factors, recommendation, source }
```
> 기업 추천 *알고리즘* 고도화는 별도 담당(팀원). 현재는 데모용 규칙 기반이며, 위 화면/설명은 그 결과를 보여주는 UI.

---

## 8. 조달 검토 워크스페이스 `/boards` (노션/칸반식) ⭐

**목표**: 추천받은 국가·기업을 **보드에 담아** 상태(후보/검토중/선정/제외)·메모로 정리·의사결정.
(추천 → 검토 → 결정의 마지막 단계. 담당자가 실제로 쓰는 정리 공간.)

**화면**
- `/boards` : 내 검토 보드 목록 + "새 보드"
- `/boards/{id}` : **칸반 보드** — 컬럼 = 상태(후보/검토중/선정/제외), 카드 = 국가/기업/메모
  - 카드 드래그로 상태 변경(= PATCH status), 카드 클릭 → 메모 편집
  - "카드 추가": 추천 국가/기업 목록에서 선택해 담기 or 자유 메모
- 추천 페이지(`/recommendations`)·공급사 상세에서 **"검토 보드에 추가"** 버튼 → 해당 보드에 카드 생성

**API** (전부 로그인 필요, 본인 것만)
```ts
api.getBoards()                         // GET /boards → BoardOut[]
api.createBoard({title, description?, query_id?})   // POST /boards
api.getBoard(boardId)                   // GET /boards/{id} → { ...board, items: ItemOut[] }
api.updateBoard(boardId, {title?, description?})    // PATCH /boards/{id}
api.deleteBoard(boardId)                // DELETE /boards/{id} (카드 CASCADE 삭제)
api.addBoardItem(boardId, {kind, title, ref_code?, memo?, status?})  // POST /boards/{id}/items
api.updateBoardItem(boardId, itemId, {status?, memo?, title?, position?})  // PATCH .../items/{itemId}
api.deleteBoardItem(boardId, itemId)    // DELETE .../items/{itemId}
```
- `kind`: `"country"` | `"company"` | `"note"`
- `ref_code`: 국가면 country_code(예 `"AU"`), 기업이면 company_id(예 `"3"`), note면 생략
- `status`: `"candidate"` | `"reviewing"` | `"selected"` | `"rejected"` (칸반 컬럼)
- `ItemOut`: `{ item_id, board_id, kind, ref_code, title, memo, status, position }`

> 드래그&드롭은 `updateBoardItem(status=...)` 한 번 호출로 반영. 순서는 `position`.

---

## 9. AI 챗봇 (내 데이터 Q&A) ⭐

**목표**: 사용자가 자연어로 물으면 **본인의 SGRI·추천·알림 데이터를 근거로** 답하는 어시스턴트.
- 예: "리튬 대체 공급국 어디가 좋아?" → "슬로베니아(SGRI 28.9)가 1순위… 스페인은 산불 경보로 물류 검토 필요"

**화면**: 우하단 **플로팅 챗 위젯**(모든 페이지 공통) 또는 `/assistant` 페이지.
- 말풍선 대화 UI, 입력창, 전송
- 답변 아래 **followups**(후속 질문 칩) → 클릭 시 자동 전송
- 현재 보고 있는 품목이 있으면 `query_id` 를 함께 보내 맥락 강화

**API**
```ts
api.chat({ message, query_id?, history? })
// POST /chat
// history: [{role:"user"|"assistant", content}]  (직전 대화 몇 턴)
// → { answer: string, followups: string[], source: "gemini"|"fallback" }
```
- 멀티턴: 직전 대화를 `history` 로 넘기면 맥락 유지.
- 로그인 시 그 사용자 데이터로 개인화(비로그인도 동작).
- `source:"fallback"` 은 AI 한도 초과 시 데이터 기반 간이 답변(정상).

---

## 10. 벤치마크 (동종 데이터 대비 상대 위치)

**목표**: "내 품목/국가가 전체 대비 얼마나 위험한지" 정직하게(우리 데이터셋 내 상대 위치).
- 예: "리튬은 **공급처 집중도**가 전체 품목 평균보다 +37.9점 위험" / "중국은 후보 22개국 중 **위험 상위 32%**"

**화면**: 리스크 상세(`/risks/{hs}`) 안 탭/섹션 또는 별도 카드.
- 6지표 **막대/레이더**: 이 품목 값 vs 전체 평균 (Δ·판정 표시)
- 국가 선택 시 **percentile 게이지**("상위 N% 위험")

> ⚠️ **국가와 기업은 기준이 다르다**: SGRI는 국가(+품목) 지수 → 국가 벤치마크에만 쓴다.
> 기업 벤치마크는 **조달지표(단가·납기·품질)** 로 별도 계산(SGRI 아님).

**① 국가/품목 벤치마크 (SGRI 기준)**
```ts
api.getItemBenchmark(hsCode, countryCode?)
// GET /benchmark/item/{hs_code}?country_code=CN
// → { item_avg_sgri, all_items_avg_sgri, sgri_delta, sgri_verdict,
//     indicators:[{key,label,item_avg,all_avg,delta,verdict}],
//     country?:{ country_code, sgri, candidate_countries, risk_percentile, vs_item_avg, summary } }
```

**② 기업 벤치마크 (조달지표 기준)**
```ts
api.getSupplierBenchmark(queryId, companyId)
// GET /benchmark/supplier/{query_id}/{company_id}
// → { company_name, candidate_count, fit_score,
//     metrics:[{key,label,value,candidate_avg,better_is:"low"|"high",rank,candidate_count,verdict}] }
```
- 후보 공급사들끼리 단가·리드타임·정시납품률·불량률 비교. `better_is` 로 방향 표시(단가는 낮을수록 우수).
- `verdict`: "우수" | "평균 수준" | "미흡".
> 두 API 모두 `basis` 필드에 산출 기준 명시 → 화면에 라벨로 표기 권장.

---

## 11. 구글 로그인 (Google Identity Services)

**목표**: 로그인 화면에 **구글 로그인 버튼** 추가 (기존 이메일 로그인은 데모용으로 유지 가능).

**흐름**
1. Google Identity Services 스크립트 로드(`https://accounts.google.com/gsi/client`)
2. 버튼 렌더(`NEXT_PUBLIC_GOOGLE_CLIENT_ID` 사용) → 사용자가 구글 계정 선택
3. 콜백으로 받은 `credential`(ID 토큰)을 백엔드로:
```ts
api.googleLogin(credential)
// POST /auth/google { id_token: credential }
// → { access_token(JWT), user }  → access_token 을 localStorage 에 저장(기존과 동일)
```
- 이후는 기존과 동일(`Authorization: Bearer <access_token>`). 세션 토큰이 **JWT로 업그레이드**됨(위조 방지).
- `user.picture_url` 로 프로필 사진 표시 가능.

**환경변수(프론트)**: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` = 백엔드와 같은 Client ID.
> Client ID 발급·설정은 [google-oauth-setup.md](google-oauth-setup.md) 참고(사용자 직접).

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
| `GET /subscription` | 요금제 카탈로그+현재 플랜+사용량 | ✅ **추가됨** |
| `POST /subscription` | 플랜 변경(mock 결제) | ✅ **추가됨** |
| `GET /queries/{id}/countries` | 국가추천 (+6지표 score_s~e) | ✅ **6지표 추가됨** |
| `GET /queries/{id}/countries/{code}/explain` | 국가 추천 AI 상세설명 | ✅ **추가됨** |
| `GET /queries/{id}/suppliers` | 기업추천 (+단가·리드타임·정시납품·불량률) | ✅ **지표 추가됨** |
| `GET /queries/{id}/suppliers/{cid}/explain` | 기업 추천 AI 상세설명 | ✅ **추가됨** |
| `GET/POST /boards`, `GET/PATCH/DELETE /boards/{id}` | 검토 보드 CRUD | ✅ **추가됨** |
| `POST/PATCH/DELETE /boards/{id}/items[/{itemId}]` | 보드 카드 CRUD | ✅ **추가됨** |
| `POST /chat` | AI 챗봇 (내 데이터 Q&A) | ✅ **추가됨** |
| `GET /benchmark/item/{hs}` | 국가/품목 벤치마크(SGRI) | ✅ **추가됨** |
| `GET /benchmark/supplier/{qid}/{cid}` | 기업 벤치마크(조달지표) | ✅ **추가됨** |
| `POST /auth/google` | 구글 로그인(ID 토큰 검증→JWT) | ✅ **추가됨** |
| `POST /auth/login` | 이메일 스텁 로그인(데모, JWT 발급) | ✅ (JWT 업그레이드) |

> `api.ts` 에 신규 메서드(`deleteQuery`, `buildItemSgri`, `getBuildJob`, `sendFeedback`, `getAlertSettings`, `saveAlertSettings`)를 추가해야 함. 백엔드 배포 후 시그니처 공유 예정.

---

## 공통 규칙
- 인증: 로그인 토큰은 `localStorage.access_token`, `api.ts` 의 `http()` 가 자동 첨부.
- 스타일: 기존 페이지(대시보드/추천)의 shadcn/ui + Tailwind 패턴 그대로.
- 빈 상태·로딩·에러 문구 항상 처리(기존 페이지 참고).
- 하드코딩 금지: 모든 수치/목록은 API 응답으로.
