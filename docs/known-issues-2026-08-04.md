# 미해결 이슈 메모 (2026-08-04)

`feature/frontend` 브랜치와 `main`을 대조하는 과정에서 확인된, **`main`에 남아 있는 문제** 정리입니다.
`feature/frontend`에는 아래 1~3번의 수정이 이미 들어가 있으나, 두 브랜치가 크게 갈라져 있어(공통 조상 `9a048df`, main이 약 110커밋 앞섬) cherry-pick보다 **main 위에서 직접 재작성**하는 편이 깔끔합니다.

- 대조 기준: `main@f66906e` ↔ `feature/frontend@26c0549`
- 상태: **전부 미수정** — 기록용 메모이며 이번에 반영하지 않음

---

## 1. 챗봇이 다른 사용자의 데이터를 노출 (P0 · 보안)

**위치** [backend/app/services/chatbot.py:50](../backend/app/services/chatbot.py), [:74](../backend/app/services/chatbot.py), [:106](../backend/app/services/chatbot.py)

`POST /api/v1/chat`은 인증이 **선택**인 공개 엔드포인트입니다([chat.py:33](../backend/app/api/v1/chat.py) `get_current_user_optional`).
그런데 `gather_context()`는 `user_id`가 없을 때 필터를 걸지 않고 전체를 조회합니다.

```python
# chatbot.py:50
q_stmt = select(UserQuery)              # ← user_id 필터 없음
if user_id is not None:
    q_stmt = q_stmt.where(UserQuery.user_id == user_id)
queries = db.execute(q_stmt.order_by(UserQuery.query_id.desc())).scalars().all()

# chatbot.py:106
a_stmt = select(Alert).order_by(Alert.alert_id.desc()).limit(5)   # ← 동일 문제
if user_id is not None:
    a_stmt = select(Alert).where(Alert.user_id == user_id)...
```

### 문제 A — 비로그인 정보 유출

토큰 없이 `/api/v1/chat`을 호출하면 **모든 사용자의 모니터링 품목 목록**과 **최근 알림 5건**이
LLM 컨텍스트로 들어가 답변에 섞여 나올 수 있습니다.

### 문제 B — IDOR (로그인 사용자도 남의 데이터 조회 가능)

```python
# chatbot.py:73-74
if focus_qid:
    fq = db.get(UserQuery, focus_qid)   # ← 소유권 검증 없음
```

`query_id`는 요청 본문(`ChatRequest.query_id`)으로 클라이언트가 지정합니다.
소유권을 확인하지 않으므로 **로그인한 사용자가 남의 `query_id`를 넣으면 그 사람의 품목·국가 추천·SGRI 컨텍스트를 읽을 수 있습니다.**

### 수정 방향

`feature/frontend`의 접근 방식 (3군데):

1. `user_id is None`이면 개인 목록을 아예 비운다 (`queries = []`, `alerts = []`).
2. `focus_qid` 조회를 `db.get()` → `select(...).where(query_id == focus_qid, user_id == user_id)`로 바꿔 소유권을 강제한다.
3. `user_id is None`이면 포커스 조회 자체를 건너뛴다.

### 검토할 대안

`/chat`을 비로그인에 열어둘 필요가 없다면 `get_current_user_optional` → `get_current_user`로 바꾸는 게
더 단순하고 확실합니다. 단, 프론트의 챗봇 위젯([chat-widget.tsx](../Frontend/components/chat-widget.tsx))이
로그인 전에도 뜨는지 먼저 확인해야 합니다. 유출 경로 자체는 위 3군데 수정으로 막힙니다.

---

## 2. docker-compose가 인증 환경변수를 컨테이너에 전달하지 않음 (P0 · 보안)

**위치** [docker-compose.yml:26](../docker-compose.yml) (`backend.environment`), [:44](../docker-compose.yml) (`frontend.build.args`)

[.env.example](../.env.example)은 아래 값들을 문서화해두었지만, compose에서 컨테이너로 **전달되지 않습니다.**

| 환경변수 | .env.example | compose 전달 | 결과 |
|---|---|---|---|
| `SECRET_KEY` | O | **X** | JWT가 소스에 하드코딩된 기본값으로 서명됨 |
| `GOOGLE_CLIENT_ID` | O | **X** | 구글 로그인이 503으로 조용히 실패 |
| `ALLOW_STUB_LOGIN` | O | **X** | 기본값 `True` — 이메일 스텁 로그인이 항상 열림 |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | O | **X** | 프론트 구글 버튼 비활성 |

`Settings`는 `pydantic-settings` 기본값을 그대로 씁니다([config.py:22-25](../backend/app/core/config.py)):

```python
SECRET_KEY: str = "dev-secret-change-in-production-min-32-bytes!"   # 운영은 반드시 교체
GOOGLE_CLIENT_ID: str = ""
ALLOW_STUB_LOGIN: bool = True
```

`env_file=".env"`는 **컨테이너 내부 CWD 기준**이라 호스트의 `.env`를 읽지 못합니다.
compose의 `${VAR}` 치환은 호스트 `.env`를 보지만, `environment:`에 나열된 키만 컨테이너로 넘어갑니다.

**영향** docker-compose로 띄운 백엔드는 **공개된 기본 서명키로 JWT를 발급**합니다.
키를 아는 누구나 임의 `user_id`로 토큰을 위조해 다른 계정으로 인증할 수 있습니다.
`ALLOW_STUB_LOGIN=True`가 함께 열려 있어 노출 폭이 더 큽니다.

### 수정 방향

`backend.environment`에 3줄, `frontend.build.args`에 1줄 추가:

```yaml
  backend:
    environment:
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      SECRET_KEY: ${SECRET_KEY:?SECRET_KEY must be set}
      ALLOW_STUB_LOGIN: ${ALLOW_STUB_LOGIN:-true}
  frontend:
    build:
      args:
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: ${NEXT_PUBLIC_GOOGLE_CLIENT_ID:-}
```

> **2026-08-04 갱신 — compose 쪽은 처리됨.**
> `feature/frontend` 머지 시 이 4줄이 들어왔고, `SECRET_KEY`는 기본값 폴백(`:-`) 대신
> `${SECRET_KEY:?…}`(미설정 시 컨테이너 기동 실패)로 바꿨습니다. 하드코딩된 키가 조용히
> 쓰이는 경로를 막았습니다. Railway 등 compose를 쓰지 않는 배포 환경은 별도로 주입 여부를 확인해야 합니다.
>
> **남은 작업(백엔드):** [config.py:22](../backend/app/core/config.py) 에 아직
> `SECRET_KEY: str = "dev-secret-change-in-production-min-32-bytes!"` 기본값이 하드코딩돼 있습니다.
> 저장소에 실제 서명키 문자열이 남아 있는 셈이라, 환경변수 필수(기본값 제거)로 바꿔야 합니다.
> `ALLOW_STUB_LOGIN` 도 기본이 `True` 라 데모 로그인이 항상 열려 있습니다 — 운영에서는 `False` 가 맞습니다.

---

## 3. 검토 보드 테이블이 시작 시 자동 생성되지 않음 (P1 · 해볼 만한 작업)

**위치** [backend/app/main.py:28](../backend/app/main.py) (`_ENSURE_SQL`)

`main`은 `/boards`에 노션형 카드 상세 모달 + Web Speech 음성 메모까지 구현했습니다(`26f8536`).
그런데 그 기능이 쓰는 두 테이블을 만드는 코드가 **어디에도 없습니다.**

- 마이그레이션 파일은 존재: [database/migrate_review_workspace.sql](../database/migrate_review_workspace.sql)
  → `review_boards`, `review_items` + 인덱스 2개, 전부 `IF NOT EXISTS` (재실행 안전)
- 그런데 `main.py`의 시작 시 `_ENSURE_SQL` 목록에 **이 마이그레이션만 빠져 있음**
  (`companies.data_source`, `s_source_monthly` 뷰, `user_queries.trading_country`,
  `alerts.source_url` 등 나머지는 모두 자동 보장 중)
- `_SEED_FILES`([main.py:20](../backend/app/main.py))도 배터리 시드 4개만 로드하고 이 파일은 포함하지 않음

**증상** 마이그레이션을 수동 적용하지 않은 DB에서 `/boards` 진입 시:

```
GET /api/v1/boards → 500 Internal Server Error
psycopg2.errors.UndefinedTable: relation "review_boards" does not exist
```

코드 자체는 정상입니다 — [boards.py](../backend/app/api/v1/boards.py)는 소유권 검증까지
제대로 하고 있고(`_own_board`, `user_id == current_user.user_id`), 순수하게 **스키마 미적용** 문제입니다.

### 수정 방향

두 갈래 중 하나. **A를 권장** — 기존 패턴과 일관되고 한 줄입니다.

**A. `_SEED_FILES` 방식처럼 SQL 파일을 시작 시 실행**
`main.py`의 lifespan에서 `migrate_review_workspace.sql`을 읽어 실행. 단, `_SEED_FILES`는
"회사 10곳 미만"이라는 조건부 로드이므로 그 블록에 넣으면 안 되고, `_ENSURE_SQL`처럼
**항상 실행되는 경로**에 넣어야 합니다.

**B. `_ENSURE_SQL`에 DDL을 인라인으로 추가**
`CREATE TABLE IF NOT EXISTS ...` 4문장을 직접 나열. 마이그레이션 파일과 내용이 이중 관리되는 단점.

> 참고: `feature/frontend`는 `AlertSetting.__table__.create(bind=engine, checkfirst=True)`로
> ORM 메타데이터에서 테이블을 만드는 방식을 썼습니다. `ReviewBoard`/`ReviewItem` 모델이
> 이미 있으므로([models/review.py](../backend/app/models/review.py)) 같은 방식도 가능하지만,
> `main`은 SQL 기반 보장으로 통일돼 있어 A가 더 맞습니다.

---

## 4. 프론트가 402(요금제 한도 초과)를 구분하지 못함 (P2)

**위치** [Frontend/lib/api.ts:322](../Frontend/lib/api.ts)

백엔드 [plans.py:96-110](../backend/app/services/plans.py)은 플랜 미보유 기능·품목 수 초과 시
`402 Payment Required`를 던지고, `main`은 결제 모달까지 있는 `/pricing` 페이지를 구현했습니다(`c77cb0b`).

그런데 프론트 HTTP 래퍼가 상태 코드를 문자열에 묻어버립니다.

```typescript
throw new Error(`API ${res.status}: ${detail}`)
```

호출부에서 "요금제 한도 초과"와 일반 오류를 구분할 방법이 없어, **402를 받아도 업그레이드 안내나
`/pricing` 유도로 연결하지 못합니다.** 현재 `Frontend/app` 어디에도 402 처리 분기가 없습니다.

### 수정 방향

`feature/frontend`의 `ApiError` 패턴:

```typescript
class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

export function isUpgradeRequiredError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 402
}
```

`throw new Error(...)` → `throw new ApiError(res.status, detail)`로 바꾸고,
품목 등록·보고서 생성 등 플랜 게이팅이 걸린 호출부에서 `isUpgradeRequiredError()`로 분기.
`ApiError`가 `Error`를 상속하므로 기존 `catch (e) { e.message }` 코드는 그대로 동작합니다.

---

## 5. 보류 · 참고만

### `review.py` 스키마 타입 강화 (P3)

[backend/app/schemas/review.py](../backend/app/schemas/review.py)의 `status`, `kind`가 `str`이라
아무 문자열이나 저장됩니다. `feature/frontend`는 `Literal`로 제한 + 제목 길이 제한(1~200자)을 걸었습니다.

```python
BoardStatus = Literal["candidate", "reviewing", "selected", "rejected"]
ItemKind = Literal["country", "company", "note"]
```

가져오기 전에 **`main`의 보드 카드 모달이 이 4개 상태 외의 값을 쓰는지** 확인이 필요합니다
(노션형 모달 도입 시 상태값이 늘었을 가능성). DB 컬럼 주석은 여전히 이 4개입니다.

### `cryptography` ARM 이슈 (기록용)

`feature/frontend`의 `requirements.txt`에는 이런 주석이 있었습니다.

```
# cryptography 50 ARM wheel은 일부 Docker Desktop ARM 환경에서 SIGILL을 일으킨다.
cryptography>=42,<45
```

`main`은 비밀번호 해싱을 `bcrypt`로 옮기면서 이 핀을 제거했습니다. 다만 `pyjwt`, `google-auth`가
`cryptography`를 간접 의존하므로 **Apple Silicon + Docker Desktop 조합에서 SIGILL이 재발할 수 있습니다.**
지금 문제가 없으면 그대로 두고, 백엔드 컨테이너가 원인 없이 죽으면 이 주석을 떠올릴 것.

### `next.config.mjs` API 프록시 (선택)

`feature/frontend`에는 `API_PROXY_TARGET` 환경변수가 있을 때만 켜지는 동일 출처 rewrite가 있었습니다.
로컬 프론트로 원격 백엔드를 붙일 때 브라우저 CORS를 우회할 수 있고, 변수 미설정 시 빈 배열을
반환하므로 Vercel 배포에는 영향이 없습니다. 개발 편의 목적이라 급하지 않음.

---

## `main`이 우위 — 되살리지 말 것

`feature/frontend` 쪽이 오래된 상태거나 기능이 후퇴해 있어, 가져오면 오히려 손해입니다.

| 파일 | 이유 |
|---|---|
| `services/ai_adapter.py` | `main`이 `focus_country` 포커스 보고서 + AI 기업 폴백을 추가. `feature`는 `analyze_procurement` 폴백을 제거하고 `ValueError`를 던지도록 후퇴 |
| `api/v1/suppliers.py` | `feature`에는 `POST /suppliers/ai`(Gemini 기업 생성)가 **없음** |
| `app/main.py` | `main`의 `lifespan`이 훨씬 포괄적(시드 자동 로드, 뷰·부분 유니크 인덱스 보장). `feature`는 구식 `@on_event("startup")` |
| `core/security.py` | `feature`에는 `hash_password`/`verify_password`(bcrypt)가 없음 |
| `services/explain_ai.py` | `_whole_score`가 `int(v+0.5)` — 음수에서 틀림. 점수가 항상 양수라 실제 문제는 없지만 가져올 이유 없음 |
| `Frontend/app/**`, `components/**` | `main`이 `(app)/` 라우트 그룹 + 사이드바 레이아웃으로 재작성하고 기능도 확장 |
| `docs/known-gaps-2026-08-03.md` | 기준 커밋이 `f79bbce`로 낡음. 유효한 항목(보드 테이블)은 위 3번으로 옮겼으므로 폐기 가능 |

### 별도 판단 필요 — 문서 2건

`feature/frontend`에만 있는 아래 두 문서는 코드가 아니라 **기능 정의·정책 문서**입니다.

- `docs/benchmark.md` — 벤치마크 기능 정의 기준 문서.
  "다른 고객사의 구매·운영 데이터를 비교하는 기능이 아니다"라는 기준선을 명시.
  `main`의 벤치마크 구현이 그 뒤 크게 바뀌었으므로(`b645745` GDELT 실뉴스, `4e28914` 또래 사례,
  `e732fa6` 개편) 세부 내용은 낡았을 가능성이 큽니다. 다만 **무엇을 쓰지 않는가**에 대한 정의는 유효.
- `docs/benchmark-expansion-meeting-2026-08-04.md` — 고객사 익명 집계 데이터 활용 확장 검토안.
  회의 예정일이 **2026-08-04(오늘)** 로 적혀 있음.

둘 다 `main`에 없으므로, 필요하면 `git show feature/frontend:docs/<파일명>`으로 꺼내 쓸 수 있습니다.

---

## 부록 — 되살릴 내용 꺼내는 명령

```bash
git show feature/frontend:backend/app/services/chatbot.py
git diff main feature/frontend -- backend/app/services/chatbot.py docker-compose.yml Frontend/lib/api.ts
```
