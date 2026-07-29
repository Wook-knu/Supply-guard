import unittest

from supplyguard_sgri.gemini_json_client import GeminiJsonError
from supplyguard_sgri.reporting import generate_report_draft
from supplyguard_sgri.reporting import _strip_repeated_heading


PROCUREMENT = {
    "hs_code": "850760",
    "item_name": "리튬이온 축전지",
    "quantity": 1000,
    "target_price": 95,
    "delivery_date": "2099-12-31",
    "quality_certification": "ISO 9001",
}
RISK = {
    "score": 52.3,
    "level": "medium",
    "level_ko": "보통",
    "confidence": 70,
    "components": [
        {
            "key": key,
            "label": label,
            "score": score,
            "weight": weight,
            "weight_percent": weight * 100,
            "weight_reason": "검증용 가중치 근거",
            "reasons": ["검증용 근거"],
        }
        for key, label, score, weight in (
            ("S", "수급 불안정성", 60, 0.25),
            ("P", "국가·정책 리스크", 50, 0.20),
            ("V", "가격 변동성", 45, 0.15),
            ("L", "물류 리스크", 55, 0.15),
            ("C", "공급처 집중도", 50, 0.15),
            ("E", "ESG·탄소규제", 40, 0.10),
        )
    ],
    "recommendations": ["공급처를 확인하세요."],
}


class FakeClient:
    def generate(self, payload, **kwargs):
        return {
            "title": "공급망 리스크 보고서",
            "executive_summary": "요약",
            "risk_analysis": "위험 분석",
            "alternative_suppliers": "대체 공급처",
            "recommended_actions": "대응 전략",
            "data_limitations": ["담당자 검토 필요"],
        }, {"model": kwargs["model"], "response_id": "test", "usage": {}}


class FailingClient:
    def generate(self, payload, **kwargs):
        raise GeminiJsonError("test failure")


class ReportingTests(unittest.TestCase):
    def test_repeated_section_heading_is_removed(self):
        self.assertEqual(
            _strip_repeated_heading(
                "경영진 요약: 공급망 위험은 보통입니다.",
                "경영진 요약",
            ),
            "공급망 위험은 보통입니다.",
        )

    def test_gemini_report_uses_fixed_outline(self):
        report = generate_report_draft(
            PROCUREMENT,
            RISK,
            client=FakeClient(),
        )
        self.assertEqual(report["gemini"]["status"], "applied")
        self.assertEqual(
            [row["title"] for row in report["sections"]],
            ["경영진 요약", "공급망 리스크 분석", "대체 공급처 제안", "권장 대응 전략"],
        )

    def test_api_failure_returns_complete_draft(self):
        report = generate_report_draft(
            PROCUREMENT,
            RISK,
            client=FailingClient(),
        )
        self.assertEqual(report["gemini"]["status"], "fallback")
        self.assertEqual(len(report["sections"]), 4)
        self.assertTrue(report["human_review_required"])


if __name__ == "__main__":
    unittest.main()
