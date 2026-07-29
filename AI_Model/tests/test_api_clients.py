import unittest

from supplyguard_sgri.api_clients import (
    ComtradeClient,
    CustomsClient,
    EcosClient,
    FredClient,
    PortWatchClient,
    WorldBankClient,
)
from supplyguard_sgri.http_client import ApiError


class QueueHttp:
    def __init__(self, json_payloads=None, text_payloads=None):
        self.json_payloads = list(json_payloads or [])
        self.text_payloads = list(text_payloads or [])
        self.urls = []
        self.headers = []

    def get_json(self, url, headers=None):
        self.urls.append(url)
        self.headers.append(headers or {})
        return self.json_payloads.pop(0), None

    def get_text(self, url, headers=None):
        self.urls.append(url)
        self.headers.append(headers or {})
        return self.text_payloads.pop(0), None


class FailingHttp:
    def get_json(self, url, headers=None):
        return None, ApiError("http", "failed", url)

    def get_text(self, url, headers=None):
        return None, ApiError("http", "failed", url)


class ApiClientTests(unittest.TestCase):
    def test_world_bank_fetches_all_six_wgi_indicators(self):
        payloads = []
        for index in range(len(WorldBankClient.INDICATORS)):
            payloads.append(
                [
                    {"page": 1},
                    [
                        {
                            "value": 0.5 + index / 10,
                            "date": "2024",
                            "country": {"value": "China"},
                        }
                    ],
                ]
            )
        http = QueueHttp(json_payloads=payloads)
        result = WorldBankClient(http).fetch_country_risk("CHN")
        expected_wgi = {
            "voice_accountability",
            "political_stability",
            "government_effectiveness",
            "regulatory_quality",
            "rule_of_law",
            "control_corruption",
        }
        self.assertTrue(expected_wgi.issubset(result.metrics))
        self.assertEqual(len(http.urls), len(WorldBankClient.INDICATORS))

    def test_customs_xml_is_converted_to_supply_and_price_metrics(self):
        xml = """<?xml version="1.0" encoding="UTF-8"?>
        <response><body><items>
          <item><year>202501</year><hsCd>850760</hsCd><impWgt>100</impWgt><impDlr>1000</impDlr></item>
          <item><year>202502</year><hsCd>850760</hsCd><impWgt>80</impWgt><impDlr>960</impDlr></item>
        </items></body></response>"""
        http = QueueHttp(text_payloads=[xml])
        result = CustomsClient(http, api_key="free-key").fetch_item_trade(
            "850760", "202501", "202502"
        )
        self.assertIn("customs_supply_cv", result.metrics)
        self.assertIn("customs_price_cv", result.metrics)

    def test_comtrade_uses_free_v1_endpoint_and_subscription_header(self):
        http = QueueHttp(
            json_payloads=[
                {
                    "data": [
                        {
                            "partnerCode": 156,
                            "partnerDesc": "China",
                            "primaryValue": 80,
                            "period": "2024",
                        },
                        {
                            "partnerCode": 704,
                            "partnerDesc": "Viet Nam",
                            "primaryValue": 20,
                            "period": "2024",
                        },
                    ]
                }
            ]
        )
        result = ComtradeClient(http, api_key="free-key").fetch_import_partners(
            "850760", "410", "2024"
        )
        self.assertIn("/data/v1/get/", http.urls[0])
        self.assertEqual(
            http.headers[0]["Ocp-Apim-Subscription-Key"], "free-key"
        )
        self.assertAlmostEqual(result.metrics["comtrade_top_partner_share_pct"], 80)

    def test_fred_public_csv_fallback_requires_no_key(self):
        csv = "observation_date,SERIES\n2026-01-01,100\n2026-02-01,110\n"
        http = QueueHttp(text_payloads=[csv])
        result = FredClient(http, api_key="").fetch_public_csv_series("SERIES")
        self.assertEqual(result.metrics["fred_values"], [100.0, 110.0])

    def test_ecos_json_is_converted_to_volatility_metrics(self):
        http = QueueHttp(
            json_payloads=[
                {
                    "StatisticSearch": {
                        "row": [
                            {"TIME": "202501", "DATA_VALUE": "100"},
                            {"TIME": "202502", "DATA_VALUE": "105"},
                        ]
                    }
                }
            ]
        )
        result = EcosClient(http, api_key="free-key").fetch_series(
            "731Y001", "0000001", "M", "202501", "202502"
        )
        self.assertEqual(result.metrics["ecos_values"], [100.0, 105.0])
        self.assertIn("ecos_price_cv", result.metrics)

    def test_portwatch_public_rows_are_converted_to_logistics_metric(self):
        http = QueueHttp(
            json_payloads=[
                {
                    "features": [
                        {"attributes": {"portcalls": 110}},
                        {"attributes": {"portcalls": 100}},
                    ]
                }
            ]
        )
        result = PortWatchClient(http).fetch_activity("CHN")
        self.assertEqual(result.metrics["portwatch_record_count"], 2)
        self.assertIn("portwatch_portcall_cv", result.metrics)
        self.assertIn("ISO3%3D%27CHN%27", http.urls[0])

    def test_url_embedded_api_keys_are_redacted_from_errors(self):
        fred = FredClient(FailingHttp(), api_key="fred-secret").fetch_series("SERIES")
        customs = CustomsClient(
            FailingHttp(), api_key="customs-secret"
        ).fetch_item_trade("850760", "202501", "202502")
        ecos = EcosClient(FailingHttp(), api_key="ecos-secret").fetch_series(
            "731Y001", "0000001", "M", "202501", "202502"
        )
        combined = " ".join(
            str(error.url)
            for result in (fred, customs, ecos)
            for error in result.errors
        )
        self.assertNotIn("fred-secret", combined)
        self.assertNotIn("customs-secret", combined)
        self.assertNotIn("ecos-secret", combined)


if __name__ == "__main__":
    unittest.main()
