# SupplyGuard Frontend

AI 기반 공급망 위험도 모니터링, 대체 공급처 추천, 대응 보고서 작성을 제공하는 SupplyGuard의 Next.js 프론트엔드입니다.

현재 프론트엔드 화면과 일부 API 연결 코드는 구현되어 있습니다. 실제 로그인, 품목 저장, 위험도·추천 조회, 보고서 저장까지 확인하려면 별도의 FastAPI 백엔드와 PostgreSQL이 실행 중이어야 합니다.

## 기술 스택

| 구분 | 기술 |
|---|---|
| 프레임워크 | Next.js 15.5.22 App Router |
| UI | React 19, TypeScript 5 |
| 스타일 | Tailwind CSS 3, Radix UI |
| 차트 | Recharts |
| 아이콘 | Lucide React |
| 패키지 관리자 | npm + `package-lock.json` |

## 개발 환경

| 항목 | 요구 버전 |
|---|---|
| Node.js | `24.18.0` |
| npm | `11` 이상 |

저장소의 `.nvmrc`, `.npmrc`, `package.json#engines`에 동일한 버전 기준이 설정되어 있습니다.

## 빠른 시작

```bash
cd Frontend
nvm use
npm ci
npm run dev
```

브라우저에서 `http://localhost:3000`으로 접속합니다. 루트 경로는 `/login`으로 이동합니다.

`nvm`을 사용하지 않는 경우 아래 명령으로 현재 버전을 먼저 확인합니다.

```bash
node --version
npm --version
```

## 환경변수

API 기본 주소는 다음 값으로 설정되어 있어 로컬 개발에서는 프론트엔드 환경변수가 없어도 됩니다.

```text
http://localhost:8000/api/v1
```

다른 백엔드를 사용할 때만 `Frontend/.env.local`을 만들고 주소를 지정합니다.

```dotenv
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

환경변수 파일은 `.gitignore`에 포함되어 있으므로 커밋하지 않습니다. 값을 바꾼 뒤에는 개발 서버를 다시 실행해야 합니다.

## 폴더 구조

```text
Frontend/
├── app/                              # Next.js App Router 페이지
│   ├── layout.tsx                    # 전역 레이아웃, 메타데이터, Analytics
│   ├── page.tsx                      # 루트 경로 → /login 이동
│   ├── globals.css                   # 전역 스타일과 인쇄 스타일
│   ├── login/
│   │   └── page.tsx                  # 이메일 로그인
│   ├── dashboard/
│   │   └── page.tsx                  # 품목별 공급망 위험 대시보드
│   ├── items/new/
│   │   └── page.tsx                  # 모니터링 품목·공급국 등록
│   ├── recommendations/
│   │   └── page.tsx                  # 국가·공급기업 추천
│   ├── risks/lithium-carbonate/
│   │   └── page.tsx                  # 리튬 탄산염 위험 상세 데모
│   ├── suppliers/pilbara-minerals/
│   │   └── page.tsx                  # 공급기업 상세 데모
│   ├── reports/
│   │   ├── new/page.tsx              # 보고서 생성 및 최근 목록
│   │   ├── [reportId]/page.tsx       # API 보고서 상세·편집
│   │   └── july-lithium-risk/page.tsx # 기존 정적 보고서 데모
│   ├── alerts/
│   │   └── page.tsx                  # 위험 알림 목록
│   └── settings/
│       └── page.tsx                  # 계정·품목·팀·알림 설정
├── components/ui/                    # 공통 UI 컴포넌트
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── table.tsx
│   ├── tabs.tsx
│   └── ...
├── lib/
│   ├── api.ts                        # 공통 API 클라이언트와 응답 타입
│   ├── countries.ts                  # ISO 국가 코드·한글명 매핑
│   └── utils.ts                      # 공통 className 유틸리티
├── public/                           # 아이콘 등 정적 파일
├── ENVIRONMENT.md                    # 팀 개발 환경 기준
├── next.config.mjs                   # Next.js 설정
├── tailwind.config.ts                # Tailwind 테마 설정
├── tsconfig.json                     # TypeScript 설정과 @/* 경로 별칭
├── package.json
└── package-lock.json
```

## 화면과 데이터 연결 상태

| 경로 | 역할 | 데이터 상태 |
|---|---|---|
| `/login` | 이메일 로그인 | `POST /auth/login` 연결, Google 로그인 비활성화 |
| `/dashboard` | 품목별 위험도·경보·최근 보고서 | API 연결, 실패 시 빈 상태. 뉴스·대체국 카드는 데모 |
| `/items/new` | 품목과 주요 공급국 등록 | 국가 입력 UI 완료, `POST /queries` 연결 |
| `/recommendations?query_id={id}` | 국가·기업 추천 | `query_id`가 있으면 API, 없으면 데모 데이터 |
| `/risks/lithium-carbonate` | 위험 상세 | 특정 품목에 고정된 데모 페이지 |
| `/suppliers/pilbara-minerals` | 공급기업 상세 | 특정 기업에 고정된 데모 페이지 |
| `/reports/new` | 보고서 생성·최근 목록 | 보고서 및 비동기 분석 API 연결 |
| `/reports/{reportId}` | 보고서 상세·편집 | 조회 및 `PATCH` 저장 API 연결 |
| `/reports/july-lithium-risk` | 기존 보고서 예시 | 정적 데모 페이지 |
| `/alerts` | 위험 알림 | API 연결, 실패 시 데모 데이터 유지 |
| `/settings` | 계정·품목·팀·알림 설정 | 계정·위험도 조회 API 연결, 알림 설정은 화면 상태만 변경 |

로그인 없이 프론트 화면만 확인하려면 `/dashboard` 또는 원하는 경로로 직접 접속할 수 있습니다. 현재는 인증 라우트 가드가 없습니다.

## 주요 사용자 흐름

```text
/login
  └─ 이메일 로그인
      └─ /dashboard
          └─ /items/new
              └─ POST /queries
                  └─ /recommendations?query_id={id}
                      ├─ 국가·기업 추천
                      └─ /reports/new?query_id={id}
                          └─ /reports/{reportId}
```

## API 클라이언트와 인증

모든 백엔드 요청은 `lib/api.ts`의 `api.*` 함수를 통해 호출합니다. 페이지 컴포넌트에서 `fetch`를 직접 호출하지 않는 것을 원칙으로 합니다.

로그인 흐름:

1. `api.login()`이 이메일을 `/auth/login`에 전송합니다.
2. 성공 응답의 토큰을 `localStorage.access_token`에 저장합니다.
3. 이후 공통 요청 함수가 `Authorization: Bearer {token}` 헤더를 자동으로 붙입니다.
4. 로그인 성공 후 `/dashboard`로 이동합니다.

현재 백엔드 인증은 개발용 스텁 토큰 방식이며 실제 Google OAuth/JWT는 구현되지 않았습니다.

연결된 API 함수:

```text
api.login()
api.getMe()
api.createQuery()
api.getQueries()
api.getQuery()
api.getCountryRecos()
api.getSupplierRecos()
api.analyzeQuery()
api.getAnalyzeJob()
api.createReport()
api.getReports()
api.getReport()
api.updateReport()
api.getRisks()
api.getAlerts()
api.markAlertRead()
```

## 국가 입력

`lib/countries.ts`에서 ISO 3166-1 국가·지역 코드와 `Intl.DisplayNames("ko")`를 사용합니다.

- `CA` 입력 → `캐나다`
- `JP` 입력 → `일본`
- 한글 국가명 직접 입력 지원
- `+ 추가` 목록에서 코드 또는 한글명 검색 지원
- 중복 국가 제외 및 개별 삭제 지원

화면에서는 여러 공급국을 선택할 수 있지만 현재 백엔드 `QueryCreate`에는 복수 공급국 저장 필드가 없습니다. 복수 공급국을 영구 저장하려면 백엔드 API와 DB 스키마 확장이 필요합니다.

## 사용할 수 있는 명령어

```bash
# 개발 서버
npm run dev

# TypeScript 타입 검사
npx tsc --noEmit

# 프로덕션 빌드
npm run build

# 프로덕션 빌드 결과 실행
npm run start
```

`package.json`에는 `npm run lint` 스크립트가 있지만 현재 ESLint 패키지와 설정이 포함되어 있지 않습니다. 린트를 사용하려면 팀 기준을 정한 뒤 개발 의존성과 설정 파일을 먼저 추가해야 합니다.

개발 서버와 `next build`는 동일한 `.next` 캐시를 사용합니다. 빌드 전에는 개발 서버를 종료하고, 빌드 확인 후 개발 서버에서 이상이 있으면 `.next` 캐시를 정리한 뒤 다시 실행합니다.

## 백엔드 없이 확인 가능한 범위

- 페이지 이동과 레이아웃
- 품목 입력 폼과 필수값 검증
- 국가 직접 입력·검색·선택·삭제
- 추천 화면의 데모 데이터
- 설정 탭과 알림 스위치
- 위험 상세·공급기업 상세·기존 보고서 데모

백엔드와 DB가 필요한 범위:

- 실제 로그인 성공과 사용자 생성
- 토큰이 포함된 사용자·품목 조회
- 품목 최종 저장
- 실제 위험도·추천 데이터
- 보고서 생성·편집 저장
- 알림 조회·읽음 처리

## 자주 발생하는 문제

### `Failed to fetch`

프론트엔드가 `NEXT_PUBLIC_API_BASE_URL`의 서버에 연결하지 못한 상태입니다. 로컬 개발에서는 다음을 확인합니다.

```bash
curl http://localhost:8000/health
```

정상 응답:

```json
{"status":"ok"}
```

응답이 없다면 FastAPI 백엔드와 PostgreSQL 실행 상태를 확인해야 합니다.

### 로그인에 계속 실패함

이메일 형식 문제뿐 아니라 백엔드 미실행, DB 연결 실패, CORS 오류도 현재 화면에서는 동일한 로그인 실패 메시지로 표시될 수 있습니다. 브라우저 네트워크 탭과 백엔드 로그를 함께 확인합니다.

### `npm ci`에서 Node 버전 오류가 발생함

```bash
nvm install 24.18.0
nvm use 24.18.0
npm ci
```

## 현재 제한사항

- 실제 Google 로그인과 JWT 인증이 없습니다.
- 로그인하지 않은 사용자의 직접 경로 접근을 차단하지 않습니다.
- 로그아웃과 토큰 만료 처리가 없습니다.
- 대시보드 뉴스는 향후 네이버 뉴스 API 또는 크롤링 데이터로 교체할 예정입니다.
- 대시보드 대체 공급국 카드 일부는 데모 데이터입니다.
- 위험 상세와 공급기업 상세 경로는 특정 예시에 고정되어 있습니다.
- 설정의 기업·팀·알림 기준 저장 API가 없습니다.
- 서버 PDF 생성과 이메일 발송은 구현되지 않았습니다.
- ESLint 패키지와 설정이 없어 `npm run lint`는 아직 사용할 수 없습니다.

## 개발 규칙

- 공통 UI는 `components/ui/`에 작성하거나 기존 컴포넌트를 재사용합니다.
- 백엔드 요청과 응답 타입은 `lib/api.ts`에서 관리합니다.
- 국가명 변환은 페이지별 상수를 만들지 않고 `lib/countries.ts`를 사용합니다.
- API 실패를 데모 성공처럼 표시하지 않습니다. 빈 상태, 오류, 데모 데이터를 명확히 구분합니다.
- API 키와 백엔드 주소는 코드에 직접 넣지 않고 환경변수를 사용합니다.
- `package-lock.json`을 유지하고 팀 개발에서는 `npm install`보다 `npm ci`를 사용합니다.
- 변경 후 `npx tsc --noEmit`과 `npm run build`를 실행합니다.

## 관련 문서

- [`ENVIRONMENT.md`](./ENVIRONMENT.md): 팀 Node/npm 환경 기준
- [`../backend/README.md`](../backend/README.md): FastAPI와 PostgreSQL 실행 방법
- [`../docs/2026-07-29-development-handoff.md`](../docs/2026-07-29-development-handoff.md): 최근 변경 내용과 인수인계 사항
