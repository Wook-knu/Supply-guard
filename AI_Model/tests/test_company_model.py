import json
import os
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

from supplyguard_sgri import (
    ProcurementProfile,
    analyze_procurement,
    evaluate_company_risk,
)
from supplyguard_sgri.company_model_cli import _print_summary, _prompt_payload


ROOT = Path(__file__).resolve().parent.parent


def valid_request():
    return {
        "procurement": {
            "hs_code": "850760",
            "item_name": "battery material",
            "quantity": 1000,
            "target_price": 95,
            "delivery_date": "2099-12-31",
            "quality_certification": "ISO 9001",
        }
    }


class CompanyModelTests(unittest.TestCase):
    def setUp(self):
        self.env_patch = patch.dict(os.environ, {"GEMINI_API_KEY": ""})
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()

    def test_request_returns_json_contract(self):
        response = evaluate_company_risk(valid_request())
        self.assertEqual(response["schema_version"], "3.0")
        self.assertEqual(response["procurement"], valid_request()["procurement"])
        self.assertEqual(response["result"]["weight_total"], 1.0)
        self.assertEqual(
            set(response["result"]["input_summary"]["거래 희망 품목"]),
            {"HS 코드", "품목명", "수량", "실제 단가", "납기일", "품질/인증 기준"},
        )

    def test_all_six_fields_are_required(self):
        for field in valid_request()["procurement"]:
            payload = valid_request()
            payload["procurement"][field] = ""
            with self.assertRaises(ValueError, msg=field):
                evaluate_company_risk(payload)

    def test_quantity_and_target_price_must_be_positive(self):
        for field in ("quantity", "target_price"):
            payload = valid_request()
            payload["procurement"][field] = 0
            with self.assertRaisesRegex(ValueError, "greater than zero"):
                evaluate_company_risk(payload)

    def test_actual_unit_price_rejects_decimals(self):
        payload = valid_request()
        payload["procurement"]["target_price"] = 95.5
        with self.assertRaisesRegex(ValueError, "without decimals"):
            evaluate_company_risk(payload)

    def test_delivery_date_format_is_validated(self):
        payload = valid_request()
        payload["procurement"]["delivery_date"] = "31-12-2030"
        with self.assertRaisesRegex(ValueError, "YYYY-MM-DD"):
            evaluate_company_risk(payload)

    def test_fields_not_in_requirements_are_rejected(self):
        payload = valid_request()
        payload["procurement"]["company_size"] = "large"
        with self.assertRaisesRegex(ValueError, "unsupported field"):
            evaluate_company_risk(payload)

    def test_interactive_input_builds_runnable_payload(self):
        answers = [
            "850760",
            "battery material",
            "1000",
            "95",
            "2099-12-31",
            "ISO 9001",
        ]
        with patch("builtins.input", side_effect=answers):
            response = analyze_procurement(_prompt_payload())
        self.assertEqual(response["procurement"]["quantity"], 1000)

        output = StringIO()
        with redirect_stdout(output):
            _print_summary(response)
        self.assertIn("종합 SGRI", output.getvalue())
        self.assertIn("가중치 설정 근거", output.getvalue())
        self.assertIn("항목별 위험 점수", output.getvalue())
        self.assertIn("보고서 초안", output.getvalue())

    def test_profile_contract(self):
        profile = ProcurementProfile.from_dict(valid_request()["procurement"])
        self.assertEqual(profile.to_dict(), valid_request()["procurement"])

    def test_hs_code_separators_are_normalized(self):
        payload = valid_request()
        payload["procurement"]["hs_code"] = "8507.60"
        response = evaluate_company_risk(payload)
        self.assertEqual(response["procurement"]["hs_code"], "850760")

    def test_full_analysis_contains_new_requirements(self):
        response = analyze_procurement(valid_request())
        self.assertIn("company_recommendations", response)
        self.assertIn("report_draft", response)
        self.assertEqual(len(response["report_draft"]["sections"]), 4)

    def test_contract_schema_files_are_valid_json(self):
        for name in (
            "company_model_request.schema.json",
            "company_model_response.schema.json",
            "company_candidates.schema.json",
            "procurement_analysis_response.schema.json",
        ):
            schema = json.loads(
                (ROOT / "schemas" / name).read_text(encoding="utf-8")
            )
            self.assertEqual(
                schema["$schema"],
                "https://json-schema.org/draft/2020-12/schema",
            )


if __name__ == "__main__":
    unittest.main()
