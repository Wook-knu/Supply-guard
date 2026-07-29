# SupplyGuard 조달 위험·기업 추천 모델

조달정보를 입력받아 다음 결과를 반환하는 Python 모델 패키지입니다.

1. Python이 계산한 공급망 위험점수(SGRI)와 항목별 근거
2. 수집된 실제 기업 데이터 중 적합한 기업과 추천 근거
3. 정해진 목차에 맞춘 공급망 리스크 보고서 초안

프론트엔드나 웹 서버는 포함하지 않습니다. 다른 개발자가 Python 함수와 JSON
규격으로 연결할 수 있도록 구성했습니다.

## 계산과 Gemini의 역할

- S·P·V·L·C·E 위험점수와 최종 SGRI는 Python이 계산합니다.
- Gemini는 위험 항목의 가중치를 제안합니다. Python이 누락·범위·합계와 기준
  가중치 대비 최대 변동폭을 검증한 뒤에만 적용합니다.
- 기업 추천은 백엔드가 전달한 후보 안에서만 수행합니다. 없는 기업이나 데이터를
  새로 만들 수 없도록 회사 ID와 근거 필드를 Python이 다시 검증합니다.
- 보고서 초안은 `경영진 요약 → 공급망 리스크 분석 → 대체 공급처 제안 →
  권장 대응 전략` 순서로 작성합니다.
- Gemini 키가 없거나 호출에 실패하면 위험 계산은 계속되며, 가중치·기업 추천·
  보고서는 규칙 기반 결과로 대체됩니다.

사용 모델은 2026-07-29 기준 무료 티어를 지원하는 최신 안정 Flash 모델
`gemini-3.6-flash`로 고정되어 있습니다.

## 1. 처음 한 번만 설정

필요 조건은 Windows PowerShell과 Python 3.11 이상입니다.

프로젝트 폴더를 PowerShell로 연 뒤 `.env`를 만듭니다.

```powershell
Copy-Item .env.example .env
notepad .env
```

Google AI Studio에서 무료 API 키를 만든 뒤 `.env` 4번째 줄의 `=` 오른쪽에
키만 붙여 넣습니다. 따옴표는 쓰지 않습니다.

```dotenv
GEMINI_API_KEY=발급받은_키
```

키 발급: [Google AI Studio API Keys](https://aistudio.google.com/app/apikey)

무료만 사용하려면 Google Cloud 결제를 연결하거나 유료 티어로 전환하지 마세요.
무료 할당량이 끝나면 Gemini 요청은 오류가 나며 이 모델은 규칙 기반 방식으로
대체합니다. 실제 `.env`는 Python 파일이나 GitHub에 올리지 않습니다.

무료 티어 입력 데이터는 Google 제품 개선에 사용될 수 있으므로 영업비밀·개인정보
같은 민감정보는 보내지 마세요. 민감 데이터를 다뤄야 한다면 Gemini 키를 비워 두고
규칙 기반 결과만 사용합니다.

다른 무료 데이터 API 설정은 [API_SETUP_KO.md](API_SETUP_KO.md)에 있습니다.
기본 실행은 외부 데이터 API를 호출하지 않으므로 해당 키는 비워 두어도 됩니다.

## 2. 가장 간단한 실행

```powershell
.\run_company_model.ps1
```

또는 `RUN_MODEL.cmd`를 더블클릭합니다. 6개 질문에 답하면 PowerShell에 위험점수,
추천 기업, 추천 근거와 보고서 초안이 표시되고 다음 파일이 생성됩니다.

```text
company_model_result.json
```

## 3. 입력 항목과 쓰는 방법

사용자가 입력하는 조달정보는 다음과 같습니다.

| 입력 항목 | 쓰는 방법 | 올바른 입력 예시 |
|---|---|---|
| HS코드 | 숫자 2·4·6·10자리. 점·하이픈·공백은 자동 제거 | `850760` 또는 `8507.60` |
| 품목명 | HS코드에 해당하는 실제 거래 품목명 | `리튬이온 축전지` |
| 수량 | 단위와 쉼표 없이 0보다 큰 숫자 | `1000` |
| 실제 단가 | 소수점·통화기호·쉼표 없이 1 이상의 단위당 정수 | `95` |
| 납기일 | 오늘 이후 날짜, `YYYY-MM-DD` | `2030-12-31` |
| 품질/인증 기준 | 공급사가 충족해야 할 인증을 쉼표로 구분. 없으면 `없음` | `ISO 9001, RoHS` |

입력 시 주의사항:

- HS코드는 국가코드가 아니며 국가를 입력한다고 자동 생성되지 않습니다. 관세율표나
  통관 담당자를 통해 실제 품목 분류를 확인해야 합니다.
- `8507.60`은 저장 시 `850760`으로 정리됩니다. 형식은 검사하지만 품목명과
  HS코드의 의미가 일치하는지는 자동 보증하지 않습니다.
- 품목명에 `아무거나`, `테스트` 같은 임시 문구를 쓰면 추천 신뢰성이 떨어집니다.
  계약서·견적서에서 사용하는 구체적인 이름을 입력합니다.
- 수량과 실제 단가는 기업 후보 데이터의 `available_quantity`, `unit_price`와
  같은 단위·통화여야 합니다. 예를 들어 실제 단가가 원/개라면 후보 단가도
  USD/개로 통일합니다.
- 인증이 여러 개면 `ISO 9001, RoHS`처럼 작성합니다. 별도 요구가 없을 때만
  `없음`을 입력합니다.

### PowerShell 입력 예시

```text
=== 조달 요청 정보 입력 ===
HS코드: 8507.60
품목명: 리튬이온 축전지
수량: 1000
실제 단가: 95
납기일(YYYY-MM-DD): 2030-12-31
품질/인증 기준(없으면 '없음'): ISO 9001, RoHS
```

내부적으로 전달되는 JSON은 다음 형식입니다.

```json
{
  "procurement": {
    "hs_code": "850760",
    "item_name": "리튬이온 축전지",
    "quantity": 1000,
    "target_price": 95,
    "delivery_date": "2030-12-31",
    "quality_certification": "ISO 9001, RoHS"
  }
}
```

입력 규격: [company_model_request.schema.json](schemas/company_model_request.schema.json)

## 4. 실제 기업 추천에 필요한 데이터

기업명은 사용자에게 입력받지 않습니다. 크롤러·공공데이터·관리자 검증 등으로
백엔드가 수집한 후보를 모델에 전달해야 합니다. 후보가 없으면 모델은 기업을
지어내지 않고 “후보 데이터 없음”을 반환합니다.

| 기업 후보 필드 | 입력 기준 |
|---|---|
| `company_id` | 백엔드의 고유 ID, 필수 |
| `company_name` | 실제 기업명, 필수 |
| `country` | 국가명 또는 백엔드 표준코드 |
| `business_type` | 제조사·유통사 등 |
| `hs_codes` | 실제 취급 HS코드 배열 |
| `unit_price` | 실제 단가와 같은 통화·단위 |
| `available_quantity` | 조달 수량과 같은 단위 |
| `lead_time_days` | 예상 조달 소요일 |
| `certifications` | 검증된 인증명 배열 |
| `on_time_delivery_rate` | 0~100 정시 납품률 |
| `defect_rate_pct` | 0~100 불량률 |
| `verified` | 출처 검증 여부 |
| `source_urls` | 원본 확인 URL 배열 |

후보 JSON 배열 규격:
[company_candidates.schema.json](schemas/company_candidates.schema.json)

백엔드가 실제 후보 배열을 `companies.json`으로 내보냈다면 다음처럼 실행합니다.

```powershell
python -m supplyguard_sgri.company_model_cli `
  --interactive `
  --company-data companies.json `
  --output company_model_result.json
```

PostgreSQL을 사용하면
[sgri_deterministic_recommendation.sql](sql/sgri_deterministic_recommendation.sql)의
`supplier_company_candidates` 테이블에 수집 데이터를 저장한 뒤 실행합니다.

```powershell
python -m pip install -r requirements-db.txt
python -m supplyguard_sgri.company_model_cli --interactive --company-db
```

## 5. JSON 파일과 외부 데이터 API로 실행

대화형 입력 대신 요청 JSON을 전달할 수 있습니다.

```powershell
python -m supplyguard_sgri.company_model_cli `
  request.json `
  --company-data companies.json `
  --output company_model_result.json
```

설정한 관세청·Comtrade·FRED·ECOS 및 키가 필요 없는 공식 데이터 API까지
호출하려면 `--live-apis`를 추가합니다. 외부 API가 실패해도 계산 가능한 데이터로
계속 진행합니다.

```powershell
python -m supplyguard_sgri.company_model_cli `
  request.json `
  --live-apis `
  --output company_model_result.json
```
python -m supplyguard_sgri.company_model_cli --interactive --company-db --live-apis --output company_model_result.json

## 6. 결과 읽기

SGRI는 0~100점이며 높을수록 위험합니다.

| SGRI | 위험 수준 |
|---:|---|
| 0~30 | 낮음 |
| 30 초과~60 | 보통 |
| 60 초과~80 | 높음 |
| 80 초과~100 | 매우 높음 |

결과 JSON의 핵심 필드는 다음과 같습니다.

| 필드 | 의미 |
|---|---|
| `risk_assessment` | SGRI, 신뢰도, 항목별 점수·가중치·근거 |
| `risk_assessment.weight_profile` | Gemini 가중치, 전체 설정 요약과 항목별 설정 이유 |
| `company_recommendations` | 추천 기업, 적합도, 실제 근거 필드, 주의사항 |
| `report_draft.sections` | 고정 목차 4개의 보고서 초안 |
| `report_draft.human_review_required` | 담당자 검토 필요 여부 |

통합 출력 규격:
[procurement_analysis_response.schema.json](schemas/procurement_analysis_response.schema.json)

## 7. 백엔드 연동

모델의 주 함수는 `analyze_procurement`입니다.

```python
from supplyguard_sgri import analyze_procurement

result = analyze_procurement(
    request_json,
    candidate_companies=company_rows,
    use_live_apis=False,
)
```

PostgreSQL 후보 테이블을 직접 읽게 하려면 백엔드 내부에서만 다음 옵션을 사용합니다.

```python
result = analyze_procurement(
    request_json,
    load_company_database=True,
    dsn=database_dsn,
)
```

프론트엔드는 6개 필드만 수집하고, 백엔드는 인증된 기업 후보를 모델에 함께
전달합니다. API 키와 DB 비밀번호는 요청 JSON이 아니라 백엔드 `.env`에서
관리합니다. 연동 규칙은 [MODEL_INTEGRATION_KO.md](MODEL_INTEGRATION_KO.md)를
참고하세요.

## 8. 검증

```powershell
python -m unittest discover -s tests -v
```

검증 항목은 6개 입력값, HS코드 정규화, Python 점수·가중치 제한, Gemini 실패
대체, 추천 기업 ID·근거 검증, 고정 보고서 목차와 API 키 비노출입니다.

SGRI와 자동 보고서는 의사결정 보조 자료입니다. 계약 전 기업 실재 여부, 가격,
공급량, 인증과 원본 출처를 담당자가 다시 확인해야 합니다.
