import unittest

from supplyguard_sgri.company_recommendation import recommend_companies
from supplyguard_sgri.gemini_json_client import GeminiJsonError


PROCUREMENT = {
    "hs_code": "850760",
    "item_name": "리튬이온 축전지",
    "quantity": 1000,
    "target_price": 95,
    "delivery_date": "2099-12-31",
    "quality_certification": "ISO 9001, RoHS",
}
CANDIDATES = [
    {
        "company_id": "c1",
        "company_name": "공급사 A",
        "country": "대한민국",
        "business_type": "제조사",
        "hs_codes": ["8507.60"],
        "unit_price": 90,
        "available_quantity": 1500,
        "lead_time_days": 20,
        "certifications": ["ISO 9001", "RoHS"],
        "on_time_delivery_rate": 97,
        "defect_rate_pct": 0.3,
        "verified": True,
        "source_urls": ["https://example.com/a"],
    },
    {
        "company_id": "c2",
        "company_name": "공급사 B",
        "country": "일본",
        "hs_codes": ["850760"],
        "unit_price": 99,
        "available_quantity": 900,
        "lead_time_days": 35,
        "certifications": ["ISO 9001"],
        "verified": False,
    },
]


class FakeClient:
    def generate(self, payload, **kwargs):
        return {
            "summary": "수집 데이터 기준 추천입니다.",
            "recommendations": [
                {
                    "rank": 1,
                    "company_id": "c1",
                    "match_score": 94,
                    "rationale": "가격·공급량·인증 조건을 충족합니다.",
                    "evidence_fields": [
                        "unit_price",
                        "available_quantity",
                        "certifications",
                    ],
                    "cautions": ["계약 전 재확인"],
                },
                {
                    "rank": 2,
                    "company_id": "c2",
                    "match_score": 72,
                    "rationale": "일부 조건을 충족합니다.",
                    "evidence_fields": ["unit_price", "available_quantity"],
                    "cautions": ["공급량 확인"],
                },
            ],
        }, {
            "model": kwargs["model"],
            "response_id": "interaction_test",
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }


class FailingClient:
    def generate(self, payload, **kwargs):
        raise GeminiJsonError("test failure")


class CompanyRecommendationTests(unittest.TestCase):
    def test_gemini_result_is_validated_and_enriched(self):
        result = recommend_companies(
            PROCUREMENT,
            CANDIDATES,
            client=FakeClient(),
        )
        self.assertEqual(result["gemini"]["status"], "applied")
        self.assertEqual(result["recommendations"][0]["company_name"], "공급사 A")
        self.assertEqual(
            result["recommendations"][0]["evidence"][0],
            {"field": "unit_price", "label": "제안 단가", "value": 90.0},
        )

    def test_api_failure_returns_calculated_fallback(self):
        result = recommend_companies(
            PROCUREMENT,
            CANDIDATES,
            client=FailingClient(),
        )
        self.assertEqual(result["gemini"]["status"], "fallback")
        self.assertEqual(result["recommendations"][0]["company_id"], "c1")

    def test_no_candidate_does_not_invent_a_company(self):
        result = recommend_companies(PROCUREMENT, [])
        self.assertEqual(result["recommendations"], [])
        self.assertEqual(result["gemini"]["status"], "no_candidates")


if __name__ == "__main__":
    unittest.main()
