from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from .config import load_project_env


load_project_env()

INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions"


class GeminiJsonError(RuntimeError):
    pass


class GeminiInteractionsJsonClient:
    """Minimal Gemini Interactions API client for structured JSON output."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        timeout_seconds: float = 30.0,
        endpoint: str = INTERACTIONS_URL,
    ) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")
        self.timeout_seconds = timeout_seconds
        self.endpoint = endpoint

    def generate(
        self,
        payload: dict[str, Any],
        *,
        system_prompt: str,
        schema: dict[str, Any],
        schema_name: str,
        model: str,
        reasoning_effort: str,
        max_output_tokens: int,
        safety_identifier: str | None = None,
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        del schema_name, safety_identifier
        if not self.api_key:
            raise GeminiJsonError("GEMINI_API_KEY is not configured")

        body = {
            "model": model,
            "system_instruction": system_prompt,
            "input": json.dumps(payload, ensure_ascii=False),
            "response_format": {
                "type": "text",
                "mime_type": "application/json",
                "schema": schema,
            },
            "generation_config": {
                "thinking_level": _thinking_level(reasoning_effort),
                "max_output_tokens": max_output_tokens,
            },
            "store": False,
        }
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={
                "x-goog-api-key": self.api_key,
                "Content-Type": "application/json",
                "User-Agent": "SupplyGuard-SGRI/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(
                request,
                timeout=self.timeout_seconds,
            ) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            raise GeminiJsonError(
                f"Gemini API HTTP {exc.code}: {self._http_error_message(exc)}"
            ) from exc
        except urllib.error.URLError as exc:
            raise GeminiJsonError(
                f"Gemini API connection failed: {exc.reason}"
            ) from exc
        except TimeoutError as exc:
            raise GeminiJsonError("Gemini API request timed out") from exc
        except json.JSONDecodeError as exc:
            raise GeminiJsonError("Gemini API returned invalid JSON") from exc

        result = _parse_json_output(self._extract_output_text(response_payload))
        return result, {
            "response_id": response_payload.get("id"),
            "model": response_payload.get("model") or model,
            "usage": (
                response_payload.get("usage")
                or response_payload.get("usage_metadata")
                or {}
            ),
        }

    @staticmethod
    def _extract_output_text(payload: dict[str, Any]) -> str:
        direct = payload.get("output_text")
        if isinstance(direct, str) and direct.strip():
            return direct
        for step in reversed(_items(payload.get("steps"))):
            if not isinstance(step, dict) or step.get("type") != "model_output":
                continue
            for content in _items(step.get("content")):
                if isinstance(content, dict):
                    text = content.get("text")
                    if isinstance(text, str) and text.strip():
                        return text
        for item in _items(payload.get("outputs") or payload.get("output")):
            if not isinstance(item, dict):
                continue
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                return text
            for content in _items(item.get("content")):
                if isinstance(content, dict):
                    text = content.get("text")
                    if isinstance(text, str) and text.strip():
                        return text
        raise GeminiJsonError("Gemini response did not contain output text")

    @staticmethod
    def _http_error_message(exc: urllib.error.HTTPError) -> str:
        try:
            payload = json.loads(exc.read().decode("utf-8", errors="replace"))
            error = payload.get("error") or {}
            return str(error.get("message") or exc.reason)
        except (json.JSONDecodeError, AttributeError):
            return str(exc.reason)


def _thinking_level(value: str) -> str:
    normalized = str(value or "low").lower()
    if normalized in {"none", "minimal"}:
        return "minimal"
    if normalized in {"xhigh", "max"}:
        return "high"
    return normalized if normalized in {"low", "medium", "high"} else "low"


def _items(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        return [value]
    return []


def _parse_json_output(value: str) -> dict[str, Any]:
    text = value.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        text = text[first_newline + 1 :] if first_newline >= 0 else text
        if text.endswith("```"):
            text = text[:-3].rstrip()
    try:
        result = json.loads(text)
    except json.JSONDecodeError as exc:
        start, end = text.find("{"), text.rfind("}")
        if start >= 0 and end > start:
            try:
                result = json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                pass
            else:
                if isinstance(result, dict):
                    return result
        raise GeminiJsonError(
            "Gemini structured output was not valid JSON"
        ) from exc
    if not isinstance(result, dict):
        raise GeminiJsonError("Gemini structured output must be a JSON object")
    return result
