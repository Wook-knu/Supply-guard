# SupplyGuard 무료 API 발급·설정

기준일: 2026-07-29

이 프로젝트는 유료 API를 사용하지 않습니다. 무료·유료 티어가 함께 있는
서비스는 무료 경로만 사용합니다.

## 1. 키를 넣는 정확한 위치

프로젝트 루트에서 다음 명령을 실행합니다.

```powershell
Copy-Item .env.example .env
notepad .env
```

`.env`의 해당 줄에서 `=` 오른쪽에 키만 넣습니다. 따옴표는 쓰지 않습니다.

| `.env` 줄 | 용도 | 입력 |
|---:|---|---|
| 4 | Gemini 무료 모델 | `GEMINI_API_KEY=키` |
| 7 | 관세청 | `CUSTOMS_API_KEY=키` |
| 8 | UN Comtrade 무료 API | `COMTRADE_API_KEY=키` |
| 9 | FRED | `FRED_API_KEY=키` |
| 10 | 한국은행 ECOS | `ECOS_API_KEY=키` |

공개 PortWatch 주소는 13번째 줄에 이미 들어 있으므로 수정하지 않습니다.
PostgreSQL은 20번째 줄 `DATABASE_URL` 하나 또는 21~25번째 줄의 `DB_*` 값을
사용합니다.

코드가 키를 읽는 위치:

- `supplyguard_sgri/gemini_json_client.py` 31번째 줄
- `supplyguard_sgri/api_clients.py` 275번째 줄: FRED
- `supplyguard_sgri/api_clients.py` 372번째 줄: Comtrade
- `supplyguard_sgri/api_clients.py` 454번째 줄: 관세청
- `supplyguard_sgri/api_clients.py` 550번째 줄: ECOS
- `supplyguard_sgri/api_clients.py` 629번째 줄: PortWatch 주소

키는 `test_api_audit.py` 같은 테스트 코드에 넣지 않습니다. 테스트의 빈 문자열은
“키가 없을 때도 안전하게 동작하는지” 확인하기 위한 값입니다.

## 2. Gemini 3.6 Flash 무료 키

사용 모델: `gemini-3.6-flash`

공식 모델 문서:
[Gemini 3.6 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash)

발급 순서:

1. [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)에
   Google 계정으로 로그인합니다.
2. `Create API key`를 누릅니다.
3. 무료 티어로 사용할 Google Cloud 프로젝트를 선택하거나 새 프로젝트를 만듭니다.
4. 생성된 키를 복사해 `.env` 4번째 줄에 넣습니다.

```dotenv
GEMINI_API_KEY=복사한_키
```

이 프로젝트는 무료 티어에서 입력·출력 비용이 0으로 표시된
`gemini-3.6-flash`만 호출합니다. 공식 가격표:
[Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

무료만 유지하는 방법:

- Google Cloud Billing을 연결하거나 `Set up billing`/유료 티어 전환을 하지
  않습니다.
- 별도의 유료 Google Search grounding을 사용하지 않습니다.
- 무료 할당량 소진 시 요청이 실패하도록 두며, 코드는 자동으로 규칙 기반
  가중치·추천·보고서로 대체합니다.
- 사용량과 현재 무료 한도는 AI Studio에서 확인합니다. 한도는 계정·지역·모델
  정책에 따라 바뀔 수 있으므로 코드에 고정 수치를 적지 않았습니다.

따라서 이 설정에는 선결제 사이트나 자동 충전 해제 과정이 없습니다. 결제 계정을
연결하지 않는 것이 가장 확실한 무료 사용 조건입니다.

주의: 공식 가격표에 따르면 무료 티어 데이터는 Google 제품 개선에 사용될 수
있습니다. 민감한 회사 데이터는 보내지 말고, 필요하면 `.env`의
`GEMINI_API_KEY=`를 비워 규칙 기반 모드만 사용합니다.

## 3. 관세청 품목별 수출입실적

비용: 무료.

공식 발급 페이지:
[공공데이터포털 관세청 품목별 수출입실적](https://www.data.go.kr/data/15101609/openapi.do)

1. 공공데이터포털에 로그인합니다.
2. `활용신청`을 누르고 개발 목적을 입력합니다.
3. 마이페이지의 활용신청 현황에서 일반 인증키를 복사합니다.
4. `.env` 7번째 줄에 넣습니다.

```dotenv
CUSTOMS_API_KEY=복사한_키
```

개발계정 기본 호출량을 넘는 증량은 별도 심사 대상이므로 이 프로젝트는 무료
기본 범위만 전제로 합니다.

## 4. UN Comtrade Free API

비용: Free APIs 구독은 무료입니다. Premium/Bulk API는 사용하지 않습니다.

공식 페이지:

- [구독 키 안내](https://uncomtrade.org/docs/api-subscription-keys/)
- [구독 종류](https://uncomtrade.org/docs/subscriptions/)
- [개발자 포털](https://comtradedeveloper.un.org/)

발급 순서:

1. 개발자 포털에 로그인합니다.
2. `Products` → `Free APIs`를 엽니다.
3. 무료 상품의 `Subscribe`를 선택합니다.
4. 프로필의 구독 화면에서 `Show keys`를 눌러 키를 복사합니다.
5. `.env` 8번째 줄에 넣습니다.

```dotenv
COMTRADE_API_KEY=복사한_키
```

포털에 `Server error`가 계속 표시될 때 공식적으로 별도 키를 발급하는 다른 기관은
확인되지 않았습니다. 브라우저 쿠키 삭제·시크릿 창·다른 네트워크로 재시도하고,
복구 전에는 `--live-apis` 없이 실행하세요. 임의 판매자나 비공식 키는 사용하지
않습니다.

## 5. FRED

비용: 무료.

공식 페이지:
[FRED API 키 안내](https://fred.stlouisfed.org/docs/api/api_key.html)

1. FRED 계정으로 로그인합니다.
2. API Keys 메뉴에서 용도를 입력해 새 키를 만듭니다.
3. `.env` 9번째 줄에 넣습니다.

```dotenv
FRED_API_KEY=복사한_키
```

키가 없으면 현재 코드는 FRED 공개 CSV 경로를 사용할 수 있습니다.

## 6. 한국은행 ECOS

비용: 무료.

공식 페이지:
[한국은행 ECOS Open API](https://ecos.bok.or.kr/api/)

1. ECOS에 회원가입하고 로그인합니다.
2. Open API의 인증키 신청/발급 메뉴에서 키를 만듭니다.
3. `.env` 10번째 줄에 넣습니다.

```dotenv
ECOS_API_KEY=복사한_키
```

## 7. 키가 필요 없는 무료 데이터

다음 값은 로컬 DB에 미리 저장된 고정 데이터가 아니라, `--live-apis`를 켰을 때
각 공식 공개 원천에서 가져옵니다.

| 원천 | 가져오는 데이터 | 키 |
|---|---|---|
| World Bank Indicators/WGI | 거버넌스·관세·무역·물류·CO2 지표 | 없음 |
| GDACS RSS | 국가 관련 재난 경보 | 없음 |
| GDELT DOC API | 공급·정책·물류·탄소 관련 뉴스 신호 | 없음 |
| IMF PortWatch ArcGIS | 일별 항만 호출량 | 없음 |

공식 원천:

- [World Bank Indicators API](https://api.worldbank.org/v2/)
- [World Bank WGI](https://www.worldbank.org/en/publication/worldwide-governance-indicators)
- [GDACS](https://www.gdacs.org/)
- [GDELT DOC API](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/)
- [IMF PortWatch](https://portwatch.imf.org/)

`PORTWATCH_FEATURE_URL`은 IMF PortWatch가 공개한 ArcGIS FeatureServer 주소이며
별도 로그인이나 키가 없습니다.

## 8. API가 아닌 공식 파일

- `CBAM_DATA_PATH`: EU CBAM 공식 기본값 파일의 로컬 경로
- `LCI_DATA_PATH`: 검증된 환경부 LCI 파일의 로컬 경로

이 두 값은 API 키가 아닙니다. 현재 모델의 자동 수집 경로에는 연결하지 않았으므로
확실한 공식 파일이 없으면 비워 둡니다.

## 9. 설정 확인

```powershell
python -m supplyguard_sgri.api_audit
python -m unittest discover -s tests -v
```

감사 결과에는 키 값이 아니라 설정 여부만 표시됩니다. 실제 API 키가 포함된
`.env`는 GitHub에 커밋하지 않습니다.
