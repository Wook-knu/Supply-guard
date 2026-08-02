# 미구현·미완료 항목 정리 (2026-08-03)

프론트엔드 전체 화면 QA 결과 확인된 **아직 동작하지 않는 기능**을 정리한 문서입니다.
프론트 화면·플로우는 구현이 끝나 있고, 아래 항목은 대부분 **백엔드/DB/설정** 쪽 작업이 선행돼야 합니다.

- 점검 환경: 프론트 `next dev`(localhost:3000), 백엔드 Docker(`frontend-backend-1`, localhost:8000), DB `frontend-db-1`(Postgres 17)
- 점검 기준 커밋: `f79bbce feat: complete frontend feedback and API flows`
- 검증 상태: 타입체크 / 린트 / 프로덕션 빌드(15개 라우트) 모두 통과

---

## 1. 검토 보드 — DB 테이블 없음 (P0)

**증상** `/boards` 진입 시 목록을 불러오지 못함.

```
GET /api/v1/boards → 500 Internal Server Error
psycopg2.errors.UndefinedTable: relation "review_boards" does not exist
```

**원인** DB에 테이블 30개는 있으나 `review_boards`, `review_items` 두 개만 생성되지 않음.
프론트·백엔드 코드는 정상이며([boards.py:52](../backend/app/api/v1/boards.py), [models/review.py:14,26](../backend/app/models/review.py)), **마이그레이션 미적용**이 원인.

**해결** 준비된 마이그레이션을 DB에 적용하면 됨 (`IF NOT EXISTS`로 재실행 안전, 기존 테이블 영향 없음).

- 파일: `database/migrate_review_workspace.sql`
- 생성 대상: `review_boards`, `review_items` + 인덱스 2개

**담당** 백엔드/DB · **미적용 상태**

---

## 2. Google 로그인 — 환경변수 미설정 (P1)

**증상** 로그인 화면에서 Google 버튼이 비활성, "Google Client ID 설정 후 사용할 수 있습니다." 표시.

**원인** 코드는 완성되어 있음([login/page.tsx:46-96](../Frontend/app/login/page.tsx)). Google Identity Services는 `client_id` 없이는 초기화가 불가능해, 값이 없으면 안전하게 비활성 UI로 분기([login/page.tsx:138](../Frontend/app/login/page.tsx)).
현재 `Frontend/.env.local` 파일이 없고 dev 프로세스에도 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`가 주입돼 있지 않음.

**해결**

1. `Frontend/.env.local` — `NEXT_PUBLIC_GOOGLE_CLIENT_ID=<발급값>.apps.googleusercontent.com`
2. 백엔드 `GOOGLE_CLIENT_ID`에 동일 값 설정 (ID 토큰 검증용)
3. Google Cloud Console → Authorized JavaScript origins에 프론트 주소 등록
4. `NEXT_PUBLIC_` 접두사는 빌드/서버 시작 시점에 주입되므로 **dev 서버 재시작 필요**

참고: `docs/google-oauth-setup.md`

**담당** 백엔드/인프라 · **미설정 상태**

> 이메일 로그인은 정상 동작 확인 완료 (`POST /auth/login` → 토큰 발급 → 대시보드 진입).

---

## 3. 입력해도 백엔드로 전송되지 않는 필드 (P0) — 백엔드 작업 요청

화면에는 입력칸이 있으나 **백엔드 스키마에 필드가 없어** 값이 버려지는 항목.
**프론트 단독 수정 불가** — 아래 백엔드 작업이 끝나면 프론트에서 전송 코드를 추가합니다.

### 3-1. 품목 등록 `POST /api/v1/queries`

**현재 계약** [`QueryCreate`](../backend/app/schemas/query.py) (schemas/query.py:11-20) — 7개 필드만 존재

```
item_name, hs_code, required_qty, qty_unit, target_price, lead_time_days, importer_code
```

핸들러가 `UserQuery(**payload.model_dump(exclude_none=True))`([queries.py:59](../backend/app/api/v1/queries.py))로 그대로 넘기므로,
**Pydantic 스키마 + ORM 모델 + 실제 테이블 컬럼 3곳 모두**에 추가해야 저장됩니다.

#### 추가 요청 필드

| # | 필드명(제안) | 타입 | 프론트에서 보내는 값 | 화면 |
|---|---|---|---|---|
| a | `countries` | `list[str]` (ISO2 코드) | `["CN","VN"]` | 현재 주요 공급국 — **필수 입력(`*`)** |
| b | `priority` | `str` | `"high"` \| `"normal"` \| `"low"` | 분석 우선순위 |
| c | `supplier_notes` | `str` | 자유 텍스트 | 공급사·조달 경로 메모 |

> **a(공급국)가 가장 시급합니다.** 프론트가 필수(`*`)로 강제 검증([items/new/page.tsx:114](../Frontend/app/items/new/page.tsx))하면서
> 정작 전송하지 않아, 사용자가 반드시 입력한 값이 그대로 버려집니다.

#### 작업 위치

1. **스키마** `backend/app/schemas/query.py` → `QueryCreate`에 3개 필드 추가
   ```python
   countries: list[str] | None = Field(default=None, examples=[["CN", "VN"]])
   priority: str | None = Field(default=None, examples=["normal"])   # high | normal | low
   supplier_notes: str | None = Field(default=None)
   ```
2. **ORM** `backend/app/models/query.py` → `UserQuery`에 컬럼 매핑 추가
   - `countries`는 다대다 성격이므로 `TEXT[]`(Postgres 배열) 또는 별도 테이블(`user_query_countries`) 중 택1
   - `priority`는 `String(10)`, `supplier_notes`는 `Text`
3. **DDL** `database/`에 마이그레이션 SQL 추가 (기존 `migrate_*.sql` 컨벤션, `IF NOT EXISTS` 사용)
   ```sql
   ALTER TABLE user_queries ADD COLUMN IF NOT EXISTS countries TEXT[];
   ALTER TABLE user_queries ADD COLUMN IF NOT EXISTS priority VARCHAR(10);
   ALTER TABLE user_queries ADD COLUMN IF NOT EXISTS supplier_notes TEXT;
   ```
4. (선택) `priority`를 실제 분석 큐 우선순위에 반영할지 결정 — 단순 저장만 해도 무방

#### 참고 — 단위·수입국 하드코딩

프론트가 현재 `qty_unit: "ton"`, `importer_code: "KR"`을 **고정 전송**합니다([items/new/page.tsx:137,139](../Frontend/app/items/new/page.tsx)).
화면에도 "톤", "USD/톤"으로 고정 표기되어 선택 UI가 없습니다. 다국가/다단위 지원이 필요하면 별도 논의 필요.

---

### 3-2. AI 보고서 생성 `POST /api/v1/queries/{id}/analyze`

**현재 계약** [`analyze_query`](../backend/app/api/v1/queries.py) (queries.py:98-115) — **request body가 아예 없음**
(파라미터: `query_id`(path), `background`, `db`, `current_user`)

#### 추가 요청 — body 모델 신설

| # | 필드명(제안) | 타입 | 프론트에서 보내는 값 | 화면 |
|---|---|---|---|---|
| d | `sections` | `list[str]` | `["summary","risk","alternative","action"]` | 포함할 목차 체크박스 |
| e | `title` | `str` | 사용자가 편집한 제목 | 보고서 제목 |
| f | `report_type` | `str` | 현재는 1종 고정 | 보고서 유형 |
| g | `extra_instructions` | `str` | 자유 텍스트 | 추가 요청 사항 |

`sections` 고정 ID 4종 (프론트 [reports/new/page.tsx:20-24](../Frontend/app/reports/new/page.tsx) 기준):

| id | 화면 표기 |
|---|---|
| `summary` | 경영진 요약 |
| `risk` | 공급망 리스크 분석 |
| `alternative` | 대체 공급처 제안 |
| `action` | 권장 대응 전략 |

#### 작업 위치

1. **스키마** `backend/app/schemas/report.py` 등에 요청 모델 신설
   ```python
   class AnalyzeRequest(BaseModel):
       sections: list[str] | None = None          # summary | risk | alternative | action
       title: str | None = None
       report_type: str | None = None
       extra_instructions: str | None = None
   ```
2. **핸들러** `queries.py:98`의 `analyze_query`에 body 바인딩
   ```python
   def analyze_query(query_id: int, payload: AnalyzeRequest | None = None, ...)
   ```
   - **하위 호환 필요**: 현재 프론트는 body 없이 호출 중이므로 `payload`는 **Optional**로 두고 기본값 처리
3. **AI 생성 로직** 전달된 값 반영
   - `sections` — 선택된 목차만 생성 (미전달 시 전체)
   - `title` — 저장 제목에 사용 (미전달 시 기존처럼 백엔드 생성)
   - `extra_instructions` — 프롬프트에 추가 지시로 삽입
4. `report_type`은 현재 1종뿐이므로 **후순위** — 유형이 늘어날 때 함께 정의

#### 프론트 측 후속 작업 (백엔드 완료 후)

- `api.analyzeQuery(qid)` → body 전달하도록 변경 ([lib/api.ts](../Frontend/lib/api.ts))
- "추가 요청 사항" textarea에 `value`/`onChange` 연결 (현재 uncontrolled — 입력 즉시 소실)
- "보고서 유형"을 정적 `div`에서 실제 select로 교체 (유형이 2종 이상 생길 때)

---

### 3-3. 임시 대응 (백엔드 작업 전까지, 선택)

동작하지 않는 입력칸을 숨기거나 "준비중" 표기 → 사용자 헛입력·오해 방지.
특히 **공급국 필수(`*`) 표시**는 값이 버려지므로 우선 검토 대상입니다.

---

## 4. 아예 미구현인 기능 (P2)

| 기능 | 위치 | 상태 |
|---|---|---|
| 팀 초대 | [settings/page.tsx:61](../Frontend/app/settings/page.tsx) | 화면에 "아직 제공하지 않으며…" 안내만, 컨트롤 없음 |
| 계정 정보 수정 | [settings/page.tsx:59](../Frontend/app/settings/page.tsx) | 전 필드 `readOnly`, 저장 경로가 앱 어디에도 없음 |
| 이용약관·개인정보 처리방침 | [login/page.tsx:159](../Frontend/app/login/page.tsx) | 텍스트만 존재, 연결할 문서·링크 없음 |

---

## 5. 정적 표시 / 하드코딩 (P3)

### 5-1. 이번에 수정 완료

| 항목 | 위치 | 수정 내용 |
|---|---|---|
| 품목명 하드코딩 | [risks/[hsCode]/page.tsx](../Frontend/app/risks/[hsCode]/page.tsx), [settings/page.tsx](../Frontend/app/settings/page.tsx) | HS `283691`(리튬 탄산염)만 이름이 뜨던 것을, 사용자가 등록한 `item_name` 실데이터를 쓰도록 변경 |
| 아바타 `"SW"` 고정 | [user-avatar.tsx](../Frontend/components/user-avatar.tsx) 신규 + 7개 페이지 | 로그인 사용자의 프로필 사진/이니셜을 표시. 구글 로그인 시 사진, 이메일 로그인 시 이니셜(예: `JS`) |
| 컬럼 헤더 `⋯` 아이콘 | [boards/[boardId]/page.tsx](../Frontend/app/boards/[boardId]/page.tsx) | 클릭되지 않는 장식 아이콘이라 제거 |

### 5-2. 남은 항목 (백엔드 논의 필요 / 후순위)

| 항목 | 위치 | 내용 | 사유 |
|---|---|---|---|
| 검토 전 확인사항 | [suppliers/[companyId]/page.tsx:143](../Frontend/app/suppliers/[companyId]/page.tsx) | 체크마크 UI지만 정적 — 저장 안 되는 가짜 체크박스 | 실제 체크박스로 만들려면 **저장 API·테이블 필요** |
| "지금 할 일" #2·#3 | [risks/[hsCode]/page.tsx](../Frontend/app/risks/[hsCode]/page.tsx) | "안전재고 확보 검토", "리스크 보고서 공유" 정적 텍스트 | 데이터 기반으로 바꾸려면 **산출 기준 정의 필요** |
| 단위·수입국 고정 | [items/new/page.tsx:137](../Frontend/app/items/new/page.tsx) | `qty_unit:"ton"`, `importer_code:"KR"` 고정(선택 UI 없음) | 3-1 참고 — 다단위/다국가 지원 여부 결정 후 진행 |
| 설정 탭 에러 처리 | [settings/page.tsx](../Frontend/app/settings/page.tsx) | 계정·품목·팀 탭은 조회 실패 시 에러 UI 없이 빈 상태로 표시(알림 탭만 에러 노출) | 프론트 단독 개선 가능, 후순위 |
| 필수 입력 접근성 | [items/new/page.tsx:114](../Frontend/app/items/new/page.tsx) | HTML `required` 없이 JS 검증만 사용 | 검증 자체는 정상 동작, 접근성 개선 차원 |

---

## 이번 작업에서 수정 완료한 항목

| 항목 | 파일 | 내용 |
|---|---|---|
| 모바일에서 AI 챗 버튼이 하단 내비 '더보기'를 가림 | [assistant-chat.tsx:221](../Frontend/components/assistant-chat.tsx) | `bottom-20 lg:bottom-6` — 내비 위로 이동(16px 여백 확보) |
| 데스크톱에서 로고 2번 표시 | 14개 페이지 헤더 | 사이드바 로고와 중복되므로 헤더 로고에 `lg:hidden` |
| 벨 빨간 점이 항상 켜져 있음 | [alert-bell.tsx](../Frontend/components/alert-bell.tsx) 신규 + 6개 페이지 | 안읽은 알림이 있을 때만 표시되도록 전 화면 통일 |
| 실제 품목과 무관한 국가명 노출 | [reports/new/page.tsx:23](../Frontend/app/reports/new/page.tsx) | "호주·칠레·캐나다 후보" → "안정적인 대체 공급국 후보" |
| 품목명이 리튬 탄산염만 표시됨 | [risks/[hsCode]/page.tsx](../Frontend/app/risks/[hsCode]/page.tsx), [settings/page.tsx](../Frontend/app/settings/page.tsx) | 하드코딩 제거, 등록 품목의 `item_name` 실데이터 사용 |
| 아바타가 항상 `"SW"` | [user-avatar.tsx](../Frontend/components/user-avatar.tsx) 신규 + 7개 페이지 | 로그인 사용자별 프로필 사진/이니셜 표시 |
| 클릭되지 않는 `⋯` 아이콘 | [boards/[boardId]/page.tsx](../Frontend/app/boards/[boardId]/page.tsx) | 장식용 아이콘 제거 |

---

## 정상 동작 확인 (참고)

- 이메일 로그인 → 토큰 발급 → 대시보드 진입
- 대시보드·품목·대체공급처·알림·보고서·설정·요금제·방법론 화면 렌더 및 콘솔 에러 없음
- 품목 등록 폼 검증(빈 값 제출 시 "필수 항목을 모두 입력해 주세요.")
- 빈 상태·로딩·에러+재시도 처리 (품목/추천/알림/보드 등 대부분 화면)
- API 응답: `auth/me`, `queries`, `risks`, `alerts`, `alert-settings`, `reports`, `subscription` → 200 / `boards` → 500(위 1번)
