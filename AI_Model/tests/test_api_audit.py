import os
import unittest
from unittest.mock import patch

from supplyguard_sgri.api_audit import audit_api_configuration


class ApiAuditTests(unittest.TestCase):
    def test_audit_reports_upstream_pipeline_is_not_fully_active(self):
        with patch.dict(
            os.environ,
            {
                "CUSTOMS_API_KEY": "",
                "COMTRADE_API_KEY": "",
                "UN_COMTRADE_API_KEY": "",
                "FRED_API_KEY": "",
                "ECOS_API_KEY": "",
                "GEMINI_API_KEY": "",
            },
            clear=False,
        ):
            result = audit_api_configuration()
        self.assertTrue(result["all_local_api_clients_implemented"])
        self.assertFalse(result["all_api_access_ready"])
        self.assertFalse(result["all_database_sources_active_in_upstream_main"])
        self.assertTrue(result["gemini_usage"]["used_for_weight_proposal"])
        self.assertEqual(
            result["gemini_usage"]["score_calculated_by"],
            "python_formula",
        )

    def test_no_key_apis_are_credential_ready(self):
        result = audit_api_configuration()
        rows = {
            row["name"]: row
            for row in result["sources"]
            if row["kind"] == "no_key"
        }
        self.assertTrue(rows)
        self.assertTrue(
            all(row["credential_or_source_ready"] for row in rows.values())
        )


if __name__ == "__main__":
    unittest.main()
