import unittest
from unittest.mock import patch

from supplyguard_sgri.models import SgriRequest
from supplyguard_sgri.api_clients import ApiFetchResult
from supplyguard_sgri.scoring import (
    cbam_category_for_hs,
    evaluate_sgri,
    governance_estimate_to_risk,
)


class SgriScoringTests(unittest.TestCase):
    def test_evaluate_offline_request(self):
        request = SgriRequest.from_dict(
            {
                "hs_code": "850760",
                "item_name": "battery material",
                "import_country": "CHN",
                "quantity": 1000,
                "target_price": 95,
                "quality_certification": "ISO 9001",
                "delivery_due_date": "2099-12-31",
                "supplier_share_pct": 70,
                "alternate_supplier_count": 1,
                "inventory_days": 20,
                "lead_time_days": 45,
                "shipment_delay_days": 7,
                "unit_price_history": [100, 104, 108, 120, 124, 130],
                "api_options": {"use_live_apis": False},
            }
        )
        payload = evaluate_sgri(request).to_dict()

        self.assertGreater(payload["score"], 0)
        self.assertIn(payload["level"], {"low", "medium", "high", "very_high"})
        self.assertEqual(payload["level_ko"], "보통")
        self.assertEqual(
            payload["input_summary"]["거래 희망 품목"],
            {
                "HS 코드": "850760",
                "품목명": "battery material",
                "수량": 1000.0,
                "실제 단가": 95,
                "납기일": "2099-12-31",
                "품질/인증 기준": "ISO 9001",
            },
        )
        self.assertEqual(payload["weight_total"], 1.0)
        self.assertIn("1.00", payload["weight_total_note"])
        self.assertEqual(payload["api_usage_summary"], [])
        self.assertEqual({item["key"] for item in payload["components"]}, {"S", "P", "V", "L", "C", "E"})
        for item in payload["components"]:
            self.assertIn("reasons", item)
            self.assertTrue(item["reasons"])
            self.assertTrue(item["weight_reason"])
            self.assertIn("api_usage", item)
            self.assertNotIn("evidence", item)
        self.assertEqual(payload["rag_report"]["weight_basis"]["version"], "reliability-v1")

    def test_api_usage_summary_is_visible_when_api_metrics_exist(self):
        request = SgriRequest.from_dict(
            {
                "hs_code": "850760",
                "item_name": "battery material",
                "import_country": "CHN",
                "supplier_share_pct": 70,
                "alternate_supplier_count": 1,
                "inventory_days": 20,
                "lead_time_days": 45,
                "shipment_delay_days": 7,
                "unit_price_history": [100, 104, 108],
                "fred_series_id": "PCU335911335911",
                "api_options": {"use_live_apis": True},
            }
        )
        api_result = ApiFetchResult(
            metrics={
                "weighted_tariff": 2.2,
                "weighted_tariff_year": "2022",
                "trade_gdp_pct": 37.2,
                "trade_gdp_pct_year": "2024",
                "lpi_overall": 3.7,
                "gdacs_event_count": 0,
                "fred_series_id": "PCU335911335911",
                "fred_values": [100.0, 102.0, 105.0],
                "fred_price_points": 3,
                "fred_latest_price_change_pct": 2.9,
                "co2_per_capita": 8.0,
                "gdelt_article_count": 0,
                "gdelt_keyword_hits": {},
                "political_stability": 0.5,
                "political_stability_year": "2024",
                "regulatory_quality": 0.8,
                "regulatory_quality_year": "2024",
            }
        )

        with patch("supplyguard_sgri.scoring.fetch_external_data", return_value=api_result):
            payload = evaluate_sgri(request).to_dict()

        api_names = {item["api"] for item in payload["api_usage_summary"]}
        self.assertIn("World Bank API", api_names)
        self.assertIn("World Bank WGI API", api_names)
        self.assertIn("FRED API", api_names)
        self.assertIn("GDACS RSS", api_names)
        self.assertTrue(any(item["component"] == "P" and item["metric_key"] == "weighted_tariff" for item in payload["api_usage_summary"]))
        self.assertTrue(any(item["component"] == "V" and item["api"] == "FRED API" for item in payload["api_usage_summary"]))

    def test_governance_estimate_to_risk(self):
        self.assertAlmostEqual(governance_estimate_to_risk(2.5), 0)
        self.assertAlmostEqual(governance_estimate_to_risk(-2.5), 100)
        self.assertAlmostEqual(governance_estimate_to_risk(0), 50)

    def test_cbam_prefix(self):
        self.assertEqual(cbam_category_for_hs("7601"), "aluminium")
        self.assertEqual(cbam_category_for_hs("850760"), None)


if __name__ == "__main__":
    unittest.main()
