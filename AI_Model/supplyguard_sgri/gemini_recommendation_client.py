from __future__ import annotations

from typing import Any

from .gemini_json_client import GeminiInteractionsJsonClient, GeminiJsonError


GeminiRecommendationError = GeminiJsonError
RECOMMENDATION_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "recommendations": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "rank": {"type": "integer"},
                    "country_code": {"type": "string"},
                    "rationale": {"type": "string"},
                    "strengths": {"type": "array", "items": {"type": "string"}},
                    "cautions": {"type": "array", "items": {"type": "string"}},
                },
                "required": [
                    "rank",
                    "country_code",
                    "rationale",
                    "strengths",
                    "cautions",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "recommendations"],
    "additionalProperties": False,
}
SYSTEM_PROMPT = """Explain the supplied procurement ranking in Korean.
Keep every rank and country code unchanged. Use only the supplied data and include
strengths, cautions, missing-data limits, and practical verification steps."""


class GeminiInteractionsRecommendationClient:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.client = GeminiInteractionsJsonClient(
            api_key=api_key,
            timeout_seconds=timeout_seconds,
        )

    def explain(
        self,
        payload: dict[str, Any],
        *,
        model: str,
        reasoning_effort: str,
        safety_identifier: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        return self.client.generate(
            payload,
            system_prompt=SYSTEM_PROMPT,
            schema=RECOMMENDATION_SCHEMA,
            schema_name="supplyguard_recommendations",
            model=model,
            reasoning_effort=reasoning_effort,
            max_output_tokens=2000,
            safety_identifier=safety_identifier,
        )
