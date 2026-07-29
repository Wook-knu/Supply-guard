import os
import unittest
from unittest.mock import patch

from supplyguard_sgri.gemini_json_client import (
    GeminiInteractionsJsonClient,
    GeminiJsonError,
    _parse_json_output,
)


class GeminiClientTests(unittest.TestCase):
    def test_extracts_interactions_output_text(self):
        text = GeminiInteractionsJsonClient._extract_output_text(
            {"outputs": [{"type": "text", "text": '{"ok": true}'}]}
        )
        self.assertEqual(text, '{"ok": true}')

    def test_extracts_rest_steps_output_text(self):
        text = GeminiInteractionsJsonClient._extract_output_text(
            {
                "steps": [
                    {
                        "type": "user_input",
                        "content": [{"type": "text", "text": "input"}],
                    },
                    {
                        "type": "model_output",
                        "content": [
                            {"type": "text", "text": '{"ok": true}'}
                        ],
                    },
                ]
            }
        )
        self.assertEqual(text, '{"ok": true}')

    def test_missing_key_stops_before_network(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}, clear=False):
            client = GeminiInteractionsJsonClient(api_key="")
            with self.assertRaisesRegex(GeminiJsonError, "GEMINI_API_KEY"):
                client.generate(
                    {},
                    system_prompt="test",
                    schema={"type": "object"},
                    schema_name="test",
                    model="gemini-3.6-flash",
                    reasoning_effort="low",
                    max_output_tokens=10,
                )

    def test_parses_json_inside_markdown_fence(self):
        self.assertEqual(
            _parse_json_output('```json\n{"ok": true}\n```'),
            {"ok": True},
        )


if __name__ == "__main__":
    unittest.main()
