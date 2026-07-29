# SupplyGuard 모델 연동 규격

이 패키지는 화면이나 HTTP 서버를 포함하지 않는 Python 모델입니다.

## 역할 분리

- 프론트엔드: 정해진 조달정보만 입력받습니다.
- 백엔드: 입력 JSON 검증, 실제 기업 후보 조회, 모델 호출, 결과 저장을 담당합니다.
- 모델: 위험 계산, 후보 기업 추천, 추천 근거와 보고서 초안을 반환합니다.

## 사용자 입력 계약

최상위 요청은 `procurement` 객체 하나만 허용합니다.

| JSON 필드 | 형식 |
|---|---|
| `hs_code` | 구분기호 제거 후 숫자 2·4·6·10자리 |
| `item_name` | 실제 거래 품목명 |
| `quantity` | 0보다 큰 숫자 |
| `target_price` | 소수점 없는 1 이상의 실제 단가 정수 |
| `delivery_date` | 오늘 이후 `YYYY-MM-DD` |
| `quality_certification` | 요구 인증 또는 `없음` |

다른 사용자 필드는 `ValueError`로 거부합니다. 정확한 규격은
[company_model_request.schema.json](schemas/company_model_request.schema.json)을
사용하세요.

## 통합 분석 호출

```python
from supplyguard_sgri import analyze_procurement

response_json = analyze_procurement(
    request_json,
    candidate_companies=company_rows,
    use_live_apis=False,
)
```

`company_rows`는 백엔드가 DB 등에서 조회한 실제 기업의 `list[dict]`입니다.
규격은 [company_candidates.schema.json](schemas/company_candidates.schema.json)을
따릅니다. 후보가 없으면 빈 배열을 전달하며, 모델은 가상 기업을 생성하지 않습니다.

DB 테이블을 모델이 직접 조회하게 할 수도 있습니다.

```python
response_json = analyze_procurement(
    request_json,
    load_company_database=True,
    dsn=database_dsn,
)
```

이 방식은
[sgri_deterministic_recommendation.sql](sql/sgri_deterministic_recommendation.sql)의
`supplier_company_candidates` 테이블이 필요합니다.

## 응답 계약

계약 버전은 `3.0`입니다.

| 필드 | 백엔드 사용 |
|---|---|
| `procurement` | 정규화된 사용자 입력 표시 |
| `risk_assessment` | 위험 대시보드 |
| `risk_assessment.weight_profile` | Gemini 가중치·항목별 설정 이유·대체 감사 |
| `company_recommendations.recommendations` | 기업 추천 카드 |
| `company_recommendations.*.evidence` | 추천 근거 표시 |
| `report_draft.sections` | 보고서 작성 화면의 4개 섹션 |
| `report_draft.data_limitations` | 데이터 한계 안내 |

통합 응답 규격:
[procurement_analysis_response.schema.json](schemas/procurement_analysis_response.schema.json)

## 처리 경계

- 최종 SGRI는 항상 Python이 계산합니다.
- Gemini 가중치는 Python의 범위·합계 검증을 통과해야 적용됩니다.
- Gemini 기업 추천은 전달된 회사 ID와 실제 존재하는 근거 필드만 허용합니다.
- Gemini 보고서는 모델 결과와 기업 추천 데이터만 사용합니다.
- `GEMINI_API_KEY`가 없거나 무료 할당량이 끝나면 규칙 기반 결과로 대체합니다.
- API 키·DB 비밀번호는 프론트엔드 요청이나 응답에 포함하지 않습니다.

입력 오류는 `ValueError`, DB 연결·데이터 오류는 `DatabaseWeightingError`로
처리하면 됩니다.
