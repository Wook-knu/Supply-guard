from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_USER_AGENT = "SupplyGuard-SGRI/0.1 (+https://example.local/supplyguard)"


@dataclass(slots=True)
class ApiError:
    provider: str
    message: str
    url: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {"provider": self.provider, "message": self.message, "url": self.url}


class JsonHttpClient:
    def __init__(self, timeout_seconds: float = 8.0, user_agent: str = DEFAULT_USER_AGENT) -> None:
        self.timeout_seconds = timeout_seconds
        self.user_agent = user_agent

    def get_json(self, url: str, headers: dict[str, str] | None = None) -> tuple[Any | None, ApiError | None]:
        request_headers = {"User-Agent": self.user_agent, "Accept": "application/json"}
        request_headers.update(headers or {})
        request = urllib.request.Request(url, headers=request_headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                body = response.read().decode("utf-8", errors="replace")
                return json.loads(body), None
        except urllib.error.HTTPError as exc:
            return None, ApiError("http", f"HTTP {exc.code}: {exc.reason}", url)
        except urllib.error.URLError as exc:
            return None, ApiError("http", f"URL error: {exc.reason}", url)
        except TimeoutError:
            return None, ApiError("http", "Request timed out", url)
        except json.JSONDecodeError as exc:
            return None, ApiError("http", f"Invalid JSON: {exc}", url)

    def get_text(self, url: str, headers: dict[str, str] | None = None) -> tuple[str | None, ApiError | None]:
        request_headers = {"User-Agent": self.user_agent, "Accept": "*/*"}
        request_headers.update(headers or {})
        request = urllib.request.Request(url, headers=request_headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                return response.read().decode("utf-8", errors="replace"), None
        except urllib.error.HTTPError as exc:
            return None, ApiError("http", f"HTTP {exc.code}: {exc.reason}", url)
        except urllib.error.URLError as exc:
            return None, ApiError("http", f"URL error: {exc.reason}", url)
        except TimeoutError:
            return None, ApiError("http", "Request timed out", url)


def build_url(base_url: str, params: dict[str, Any]) -> str:
    clean = {key: value for key, value in params.items() if value not in (None, "")}
    return f"{base_url}?{urllib.parse.urlencode(clean, doseq=True)}"

