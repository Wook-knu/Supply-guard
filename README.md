# 🌐 SupplyGuard

**AI 기반 공급망 리스크 관리 플랫폼**

공개 데이터를 모아 품목·국가별 공급망 위험을 **0~100점(SGRI)** 으로 보여 주고, AI를 활용해 **대체 공급국·거래 기업 추천**부터 **대응 보고서 초안**까지 하나의 흐름으로 이어 주는 중소·중견기업용 서비스입니다.

- 🚀 **배포된 웹**: https://supply-guard-one.vercel.app
- 🏫 국민대학교 연합 창업학술제 SYNC 출품작

---

## ✨ 무엇을 하나요?

품목 코드(HS)만 입력하면 그 품목이 **어느 국가에서 얼마나 위험한지**를 여섯 지표로 계산해 보여 주고, 위험이 높으면 대체할 공급국과 실제 거래 가능한 기업까지 추천한 뒤 대응 보고서 초안을 자동으로 작성합니다.

| 영역 | 기능 |
|---|---|
| **진단** | 대시보드(6지표·위험도 한눈에) · 내 품목 · 품목 리스크 상세 |
| **처방** | 대체 공급국 추천 · 국가별 기업 추천 · 공급사 상세 · SGRI 1:1 비교 · 벤치마크 |
| **인사이트·산출물** | 최신 동향 분석(실뉴스) · AI 대응 보고서 초안 · 전역 AI 챗봇 |
| **협업·시각화** | 검토 보드(칸반·AI 음성메모) · 글로벌 지도(국가 줌인) · 알림센터 |
| **부가** | 구독 요금제 · 설정(프로필) · 로그인(회전 지구본) |

---

## 📊 SGRI — 공급망 리스크 지수

품목(HS코드) × 국가 조합마다 6개 지표를 0~100점으로 계산해 가중합합니다.

```
SGRI = 0.25·S + 0.20·P + 0.15·V + 0.15·L + 0.15·C + 0.10·E
```

| 지표 | 의미 | 데이터 출처(공개 API) |
|---|---|---|
| **S** 수급 불안정성 | 공급 차질 위험 | UN Comtrade · 관세청 · GDELT |
| **P** 국가·정책 리스크 | 지정학·규제 | World Bank WGI · GDELT |
| **V** 가격 변동성 | 원가 급등 | FRED · 한국은행 ECOS · 관세청 |
| **L** 물류 리스크 | 납기·운송 | World Bank LPI · IMF PortWatch · GDACS |
| **C** 공급처 집중도 | 특정국 편중(HHI) | UN Comtrade |
| **E** ESG·탄소규제 | CBAM 관세 노출 | CBAM(HS 매핑) · World Bank(CO₂) · GDELT |

숫자 계산은 통계 공식으로 수행하고, **AI(Gemini)는 지표 가중치 제안·기업 추천·동향 요약·보고서 작성·챗봇**에 활용합니다. AI를 쓸 수 없을 때는 규칙 기반으로 폴백하며, 데이터가 없는 지표는 비워 둡니다.

---

## 🛠 기술 스택

| 구분 | 사용 기술 |
|---|---|
| 프론트엔드 | Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS — *Vercel* |
| 백엔드 | FastAPI · SQLAlchemy 2.0 · Pydantic v2 — *Railway* |
| 데이터베이스 | PostgreSQL |
| AI | Google Gemini |
| 외부 데이터 | UN Comtrade · World Bank · 관세청 · GDELT · GDACS · IMF PortWatch · 한국은행 ECOS · FRED |

---

## ▶️ 실행 방법

### Docker Compose (권장)

```bash
cp .env.example .env      # 값 채우기 (아래 '환경 변수' 참고)
docker compose up --build
```

- 프론트엔드 → http://localhost:3000
- 백엔드 API 문서(Swagger) → http://localhost:8000/docs

### 로컬 개발 (Docker 없이)

PostgreSQL이 실행 중이어야 하며, 백엔드는 환경 변수(또는 `.env`)가 필요합니다.

```bash
# 백엔드
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload                        # http://localhost:8000

# 프론트엔드 (새 터미널)
cd Frontend
npm install
npm run dev                                          # http://localhost:3000
```

> 백엔드는 시작 시 필요한 스키마를 자동 보정하고, 배터리 소재 실기업 시드를 1회 로드합니다.

---

## 🔑 환경 변수

`.env.example`을 `.env`로 복사해 채웁니다. (`.env`는 커밋하지 않습니다.)

| 변수 | 필수 | 설명 |
|---|---|---|
| `DB_PASSWORD` | ✅ | PostgreSQL 비밀번호 |
| `GEMINI_API_KEY` | ✅ | 가중치 제안·AI 설명·보고서 생성용 |
| `SECRET_KEY` | ✅(운영) | JWT 서명키 |
| `GOOGLE_CLIENT_ID` | 선택 | 없으면 구글 로그인 비활성 |
| `NEXT_PUBLIC_API_BASE_URL` | ✅(배포) | 프론트가 호출할 백엔드 주소 |
| `COMTRADE_API_KEY` · `CUSTOMS_API_KEY` 등 | 선택 | 실데이터 수집용(관세청은 공공데이터포털 무료 발급) |

> 무키 API(World Bank · GDELT · GDACS · IMF PortWatch · FRED 공개 CSV)만으로도 기본 동작이 가능합니다.

---

## 📁 프로젝트 구조

```
Supply-guard/
├── Frontend/     # Next.js 프론트엔드 (17개 화면)
├── backend/      # FastAPI 백엔드 (API · DB · 서비스)
├── AI_Model/     # SGRI 산출 엔진 · Gemini 연동 (supplyguard_sgri)
├── database/     # 스키마 · 시드 SQL · 데이터 수집 파이프라인
├── docs/         # 방법론 · API 명세 · 배포 가이드
├── docker-compose.yml
└── railway.json
```

자세한 SGRI 산출식·데이터 출처·가중치 절차는 [`docs/methodology.md`](docs/methodology.md)를 참고하세요.

---

## 👥 팀

전상욱 (PM·프론트엔드) · 김민수 (리스크 예측 모델) · 양다현 (데이터 수집·전처리) · 이서율 (시장분석·사업화) · 장수민 (백엔드·배포·AI모델)
