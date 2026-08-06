from __future__ import annotations

import math
import os
import statistics
import urllib.parse
import xml.etree.ElementTree as ET
import csv
import io
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .config import load_project_env
from .http_client import ApiError, JsonHttpClient, build_url
from .models import Evidence


load_project_env()

COUNTRY_TO_WORLD_BANK = {
    "CHINA": "CHN",
    "CN": "CHN",
    "CHN": "CHN",
    "KOREA": "KOR",
    "KR": "KOR",
    "KOR": "KOR",
    "JAPAN": "JPN",
    "JP": "JPN",
    "JPN": "JPN",
    "VIETNAM": "VNM",
    "VN": "VNM",
    "VNM": "VNM",
    "USA": "USA",
    "US": "USA",
    "UNITED STATES": "USA",
    "GERMANY": "DEU",
    "DEU": "DEU",
    "TAIWAN": "TWN",
    "TWN": "TWN",
    "INDIA": "IND",
    "IND": "IND",
}


def normalize_country_code(country: str | None) -> str | None:
    if not country:
        return None
    return COUNTRY_TO_WORLD_BANK.get(country.strip().upper(), country.strip().upper())


@dataclass(slots=True)
class ApiFetchResult:
    metrics: dict[str, Any] = field(default_factory=dict)
    evidence: list[Evidence] = field(default_factory=list)
    errors: list[ApiError] = field(default_factory=list)

    def extend(self, other: "ApiFetchResult") -> None:
        self.metrics.update(other.metrics)
        self.evidence.extend(other.evidence)
        self.errors.extend(other.errors)


class WorldBankClient:
    """No-key World Bank connector for WGI, trade, logistics, and CO2 indicators."""

    BASE_URL = "https://api.worldbank.org/v2/country/{country}/indicator/{indicator}"

    INDICATORS = {
        # Worldwide Governance Indicators used by the upstream database design.
        "voice_accountability": "VA.EST",
        "political_stability": "PV.EST",
        "government_effectiveness": "GE.EST",
        "regulatory_quality": "RQ.EST",
        "rule_of_law": "RL.EST",
        "control_corruption": "CC.EST",
        "weighted_tariff": "TM.TAX.MRCH.WM.AR.ZS",
        "trade_gdp_pct": "NE.TRD.GNFS.ZS",
        "lpi_overall": "LP.LPI.OVRL.XQ",
        "co2_per_capita": "EN.ATM.CO2E.PC",
    }

    def __init__(self, http: JsonHttpClient) -> None:
        self.http = http

    def latest_indicator(self, country: str, indicator: str) -> tuple[dict[str, Any] | None, ApiError | None]:
        url = build_url(
            self.BASE_URL.format(country=country, indicator=indicator),
            {"format": "json", "per_page": 80, "MRV": 10},
        )
        data, error = self.http.get_json(url)
        if error:
            error.provider = "World Bank"
            return None, error
        if not isinstance(data, list) or len(data) < 2 or not isinstance(data[1], list):
            return None, ApiError("World Bank", "Unexpected indicator response shape", url)
        for row in data[1]:
            if row.get("value") is not None:
                return {
                    "indicator": indicator,
                    "value": row.get("value"),
                    "date": row.get("date"),
                    "country": row.get("country", {}).get("value"),
                    "url": url,
                }, None
        return None, ApiError("World Bank", f"No recent value for {indicator}", url)

    def fetch_country_risk(self, country: str | None) -> ApiFetchResult:
        result = ApiFetchResult()
        wb_country = normalize_country_code(country)
        if not wb_country:
            result.errors.append(ApiError("World Bank", "No import_country supplied"))
            return result

        for metric_name, indicator in self.INDICATORS.items():
            row, error = self.latest_indicator(wb_country, indicator)
            if error:
                result.errors.append(error)
                continue
            if row:
                value = row["value"]
                result.metrics[metric_name] = value
                result.metrics[f"{metric_name}_year"] = row.get("date")
                result.evidence.append(
                    Evidence(
                        source="World Bank",
                        title=f"{metric_name.replace('_', ' ').title()} ({indicator})",
                        url=row.get("url"),
                        observed_at=str(row.get("date") or ""),
                        confidence=82,
                        metric=metric_name,
                        value=value,
                    )
                )
        return result


class GdeltClient:
    """No-key GDELT DOC API connector for global news risk signals."""

    BASE_URL = "https://api.gdeltproject.org/api/v2/doc/doc"
    RISK_TERMS = [
        "shortage",
        "export ban",
        "sanction",
        "tariff",
        "strike",
        "port congestion",
        "delay",
        "earthquake",
        "flood",
        "fire",
        "war",
        "regulation",
        "carbon",
        "CBAM",
        "customs",
    ]

    def __init__(self, http: JsonHttpClient) -> None:
        self.http = http

    def search_articles(
        self,
        query_terms: list[str],
        timespan: str = "7d",
        max_records: int = 50,
    ) -> ApiFetchResult:
        result = ApiFetchResult()
        base_query = " OR ".join([f'"{term}"' for term in query_terms[:5] if term])
        risk_query = " OR ".join([f'"{term}"' for term in self.RISK_TERMS])
        if not base_query:
            result.errors.append(ApiError("GDELT", "No search terms supplied"))
            return result
        query = f"({base_query}) ({risk_query})"
        url = build_url(
            self.BASE_URL,
            {
                "query": query,
                "mode": "artlist",
                "format": "json",
                "timespan": timespan,
                "maxrecords": max(1, min(max_records, 250)),
                "sort": "datedesc",
            },
        )
        data, error = self.http.get_json(url)
        if error:
            error.provider = "GDELT"
            result.errors.append(error)
            return result

        articles = data.get("articles", []) if isinstance(data, dict) else []
        result.metrics["gdelt_article_count"] = len(articles)
        result.metrics["gdelt_query"] = query
        result.metrics["gdelt_url"] = url
        keyword_hits: dict[str, int] = {term: 0 for term in self.RISK_TERMS}
        for article in articles[:10]:
            title = article.get("title") or article.get("seendate") or "GDELT article"
            text = f"{article.get('title', '')} {article.get('domain', '')}".lower()
            for term in self.RISK_TERMS:
                if term.lower() in text:
                    keyword_hits[term] += 1
            result.evidence.append(
                Evidence(
                    source="GDELT",
                    title=title,
                    url=article.get("url"),
                    observed_at=article.get("seendate"),
                    confidence=66,
                    metric="article",
                    value=article.get("domain"),
                )
            )
        result.metrics["gdelt_keyword_hits"] = {key: val for key, val in keyword_hits.items() if val}
        return result


class GdacsClient:
    """No-key GDACS RSS connector for natural disaster signals."""

    RSS_URL = "https://www.gdacs.org/xml/rss.xml"

    def __init__(self, http: JsonHttpClient) -> None:
        self.http = http

    def fetch_disasters(self, country: str | None) -> ApiFetchResult:
        result = ApiFetchResult()
        text, error = self.http.get_text(self.RSS_URL)
        if error:
            error.provider = "GDACS"
            result.errors.append(error)
            return result
        try:
            root = ET.fromstring(text or "")
        except ET.ParseError as exc:
            result.errors.append(ApiError("GDACS", f"Invalid RSS XML: {exc}", self.RSS_URL))
            return result

        needle = (country or "").lower()
        items = root.findall(".//item")
        matched = []
        for item in items:
            title = item.findtext("title") or ""
            description = item.findtext("description") or ""
            link = item.findtext("link")
            pub_date = item.findtext("pubDate")
            combined = f"{title} {description}".lower()
            if not needle or needle in combined:
                matched.append((title, link, pub_date))

        result.metrics["gdacs_event_count"] = len(matched)
        for title, link, pub_date in matched[:8]:
            result.evidence.append(
                Evidence(
                    source="GDACS",
                    title=title,
                    url=link,
                    observed_at=pub_date,
                    confidence=74,
                    metric="disaster_event",
                )
            )
        return result


class FredClient:
    """Optional FRED connector for commodity or index series selected by the caller."""

    BASE_URL = "https://api.stlouisfed.org/fred/series/observations"
    CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"

    def __init__(self, http: JsonHttpClient, api_key: str | None = None) -> None:
        self.http = http
        self.api_key = api_key or os.environ.get("FRED_API_KEY")

    def fetch_series(self, series_id: str | None, limit: int = 24) -> ApiFetchResult:
        result = ApiFetchResult()
        if not series_id:
            result.errors.append(ApiError("FRED", "No fred_series_id supplied"))
            return result
        if not self.api_key:
            return self.fetch_public_csv_series(series_id, limit=limit)
        url = build_url(
            self.BASE_URL,
            {
                "series_id": series_id,
                "api_key": self.api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": limit,
            },
        )
        data, error = self.http.get_json(url)
        if error:
            error.provider = "FRED"
            # Never expose the query-string API key in reports or logs.
            error.url = build_url(self.BASE_URL, {"series_id": series_id})
            result.errors.append(error)
            return result
        observations = data.get("observations", []) if isinstance(data, dict) else []
        values = []
        for row in observations:
            try:
                value = float(row.get("value"))
            except (TypeError, ValueError):
                continue
            if math.isfinite(value):
                values.append(value)
        values.reverse()
        result.metrics["fred_series_id"] = series_id
        result.metrics["fred_values"] = values
        result.evidence.append(
            Evidence(
                source="FRED",
                title=f"FRED series {series_id}",
                url=f"https://fred.stlouisfed.org/series/{urllib.parse.quote(series_id)}",
                observed_at=datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
                confidence=78,
                metric="price_series",
                value={"points": len(values)},
            )
        )
        return result

    def fetch_public_csv_series(self, series_id: str, limit: int = 24) -> ApiFetchResult:
        result = ApiFetchResult()
        url = build_url(self.CSV_URL, {"id": series_id})
        text, error = self.http.get_text(url)
        if error:
            error.provider = "FRED"
            result.errors.append(error)
            return result

        values: list[float] = []
        reader = csv.DictReader(io.StringIO(text or ""))
        for row in reader:
            raw_value = row.get(series_id)
            try:
                value = float(raw_value)
            except (TypeError, ValueError):
                continue
            if math.isfinite(value):
                values.append(value)

        values = values[-limit:]
        result.metrics["fred_series_id"] = series_id
        result.metrics["fred_values"] = values
        result.evidence.append(
            Evidence(
                source="FRED",
                title=f"FRED public CSV series {series_id}",
                url=url,
                observed_at=datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
                confidence=76,
                metric="price_series",
                value={"points": len(values), "mode": "public_csv"},
            )
        )
        return result


class ComtradeClient:
    """Optional UN Comtrade v1 connector for HS-code import concentration."""

    BASE_URL = "https://comtradeapi.un.org/data/v1/get/C/M/HS"

    def __init__(self, http: JsonHttpClient, api_key: str | None = None) -> None:
        self.http = http
        self.api_key = (
            api_key
            or os.environ.get("COMTRADE_API_KEY")
            or os.environ.get("UN_COMTRADE_API_KEY")
        )

    def fetch_import_partners(
        self,
        hs_code: str,
        reporter_code: str | None,
        period: str | None,
        partner_code: str | None = None,
    ) -> ApiFetchResult:
        result = ApiFetchResult()
        if not self.api_key:
            result.errors.append(
                ApiError(
                    "UN Comtrade",
                    "COMTRADE_API_KEY (or UN_COMTRADE_API_KEY) is not configured",
                )
            )
            return result
        if not reporter_code:
            result.errors.append(ApiError("UN Comtrade", "comtrade_reporter_code is required"))
            return result
        params = {
            "cmdCode": hs_code,
            "flowCode": "M",
            "reporterCode": reporter_code,
            "partnerCode": partner_code or "all",
            "period": period,
            "includeDesc": "true",
            "breakdownMode": "classic",
        }
        url = build_url(self.BASE_URL, params)
        data, error = self.http.get_json(url, headers={"Ocp-Apim-Subscription-Key": self.api_key})
        if error:
            error.provider = "UN Comtrade"
            result.errors.append(error)
            return result
        rows = data.get("data", []) if isinstance(data, dict) else []
        partner_values = []
        for row in rows:
            value = row.get("primaryValue")
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                continue
            partner_values.append(
                {
                    "partner_code": row.get("partnerCode"),
                    "partner": row.get("partnerDesc"),
                    "value": numeric_value,
                    "period": row.get("period"),
                }
            )
        partner_values.sort(key=lambda item: item["value"], reverse=True)
        total = sum(item["value"] for item in partner_values)
        top_share = (partner_values[0]["value"] / total * 100) if total else None
        hhi = sum((item["value"] / total) ** 2 for item in partner_values) * 100 if total else None
        result.metrics["comtrade_partner_values"] = partner_values[:20]
        result.metrics["comtrade_top_partner_share_pct"] = top_share
        result.metrics["comtrade_hhi"] = hhi
        result.evidence.append(
            Evidence(
                source="UN Comtrade",
                title=f"HS {hs_code} import partners",
                url=url,
                observed_at=period,
                confidence=80,
                metric="trade_concentration",
                value={"rows": len(partner_values), "top_share_pct": top_share, "hhi": hhi},
            )
        )
        return result


class CustomsClient:
    """Korea Customs Service item trade API for supply and import-price signals."""

    BASE_URL = "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"

    def __init__(self, http: JsonHttpClient, api_key: str | None = None) -> None:
        self.http = http
        self.api_key = api_key or os.environ.get("CUSTOMS_API_KEY")

    def fetch_item_trade(
        self,
        hs_code: str,
        start_yymm: str | None,
        end_yymm: str | None,
        country_code: str | None = None,
    ) -> ApiFetchResult:
        result = ApiFetchResult()
        if not self.api_key:
            result.errors.append(
                ApiError("Korea Customs", "CUSTOMS_API_KEY is not configured")
            )
            return result
        if not start_yymm or not end_yymm:
            result.errors.append(
                ApiError(
                    "Korea Customs",
                    "customs_start_yymm and customs_end_yymm are required",
                )
            )
            return result
        if not country_code:
            result.errors.append(
                ApiError("Korea Customs", "country code (cntyCd) is required")
            )
            return result
        # 포털 인증키는 Encoding/Decoding 두 형태가 있는데, unquote로 정규화하면
        # build_url(urlencode)이 한 번만 인코딩해 이중 인코딩 문제를 피한다.
        url = build_url(
            self.BASE_URL,
            {
                "serviceKey": urllib.parse.unquote(self.api_key),
                "strtYymm": start_yymm,
                "endYymm": end_yymm,
                "hsSgn": hs_code,
                "cntyCd": country_code,
            },
        )
        text, error = self.http.get_text(url)
        if error:
            error.provider = "Korea Customs"
            # The request URL contains serviceKey; keep only the public endpoint.
            error.url = self.BASE_URL
            result.errors.append(error)
            return result
        try:
            root = ET.fromstring(text or "")
        except ET.ParseError as exc:
            result.errors.append(
                ApiError("Korea Customs", f"Invalid XML: {exc}", self.BASE_URL)
            )
            return result

        import_weights: list[float] = []
        unit_prices: list[float] = []
        periods: list[str] = []
        for item in root.iter("item"):
            hs = (item.findtext("hsCd") or "").strip()
            period = (item.findtext("year") or "").strip()
            # 합계행(year="총계", hsCd="-")은 변동계수 계산에서 제외
            if not hs or hs == "-" or period == "총계":
                continue
            import_weight = _numeric_text(item.findtext("impWgt"))
            import_usd = _numeric_text(item.findtext("impDlr"))
            if import_weight is not None:
                import_weights.append(import_weight)
            if import_weight and import_usd is not None:
                unit_prices.append(import_usd / import_weight)
            periods.append(period)

        supply_metrics = price_volatility_metrics(import_weights)
        price_metrics = price_volatility_metrics(unit_prices)
        result.metrics["customs_import_weights"] = import_weights
        result.metrics["customs_unit_prices"] = unit_prices
        if supply_metrics:
            result.metrics["customs_supply_cv"] = supply_metrics["price_cv"]
            result.metrics["customs_supply_change_pct"] = supply_metrics[
                "latest_price_change_pct"
            ]
        if price_metrics:
            result.metrics["customs_price_cv"] = price_metrics["price_cv"]
            result.metrics["customs_price_change_pct"] = price_metrics[
                "latest_price_change_pct"
            ]
        result.evidence.append(
            Evidence(
                source="Korea Customs",
                title=f"HS {hs_code} item trade statistics",
                url=self.BASE_URL,
                observed_at=periods[-1] if periods else end_yymm,
                confidence=82,
                metric="customs_trade",
                value={"rows": len(periods)},
            )
        )
        return result


class EcosClient:
    """Bank of Korea ECOS series for exchange-rate and price volatility."""

    BASE_URL = "https://ecos.bok.or.kr/api/StatisticSearch"

    def __init__(self, http: JsonHttpClient, api_key: str | None = None) -> None:
        self.http = http
        self.api_key = api_key or os.environ.get("ECOS_API_KEY")

    def fetch_series(
        self,
        stat_code: str | None,
        item_code: str | None,
        frequency: str | None,
        start: str | None,
        end: str | None,
        limit: int = 1000,
    ) -> ApiFetchResult:
        result = ApiFetchResult()
        if not self.api_key:
            result.errors.append(ApiError("ECOS", "ECOS_API_KEY is not configured"))
            return result
        required = [stat_code, item_code, frequency, start, end]
        if any(not value for value in required):
            result.errors.append(
                ApiError(
                    "ECOS",
                    "ecos_stat_code, ecos_item_code, ecos_frequency, "
                    "ecos_start and ecos_end are required",
                )
            )
            return result
        url = (
            f"{self.BASE_URL}/{urllib.parse.quote(self.api_key)}/json/kr/1/{limit}/"
            f"{stat_code}/{frequency}/{start}/{end}/{item_code}"
        )
        data, error = self.http.get_json(url)
        if error:
            error.provider = "ECOS"
            # ECOS puts its key in the URL path, so redact the failing URL.
            error.url = self.BASE_URL
            result.errors.append(error)
            return result
        rows = (
            data.get("StatisticSearch", {}).get("row", [])
            if isinstance(data, dict)
            else []
        )
        values: list[float] = []
        periods: list[str] = []
        for row in rows:
            value = _finite_float(row.get("DATA_VALUE"))
            if value is not None:
                values.append(value)
                periods.append(str(row.get("TIME") or ""))
        result.metrics["ecos_values"] = values
        result.metrics["ecos_stat_code"] = stat_code
        ecos_metrics = price_volatility_metrics(values)
        for key, value in ecos_metrics.items():
            result.metrics[f"ecos_{key}"] = value
        result.evidence.append(
            Evidence(
                source="ECOS",
                title=f"ECOS {stat_code}/{item_code}",
                url=self.BASE_URL,
                observed_at=periods[-1] if periods else end,
                confidence=82,
                metric="price_series",
                value={"points": len(values)},
            )
        )
        return result


class PortWatchClient:
    """IMF PortWatch daily port activity from the public ArcGIS table."""

    DEFAULT_ENDPOINT = (
        "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/ArcGIS/rest/services/"
        "Daily_Ports_Data/FeatureServer/0/query"
    )

    def __init__(self, http: JsonHttpClient, endpoint: str | None = None) -> None:
        self.http = http
        self.endpoint = (
            endpoint
            or os.environ.get("PORTWATCH_FEATURE_URL")
            or self.DEFAULT_ENDPOINT
        )

    def fetch_activity(
        self,
        country: str | None,
        limit: int = 180,
    ) -> ApiFetchResult:
        result = ApiFetchResult()
        iso3 = normalize_country_code(country)
        if not iso3:
            result.errors.append(
                ApiError("PortWatch", "No import_country supplied")
            )
            return result
        url = build_url(
            self.endpoint,
            {
                "where": f"ISO3='{iso3}'",
                "outFields": "date,portid,portname,ISO3,portcalls,import,export",
                "f": "json",
                "orderByFields": "date DESC",
                "resultOffset": 0,
                "resultRecordCount": limit,
                "returnGeometry": "false",
            },
        )
        data, error = self.http.get_json(url)
        if error:
            error.provider = "PortWatch"
            result.errors.append(error)
            return result
        features = data.get("features", []) if isinstance(data, dict) else []
        result.metrics["portwatch_record_count"] = len(features)
        port_calls: list[float] = []
        for feature in reversed(features):
            attributes = feature.get("attributes") or {}
            value = _finite_float(attributes.get("portcalls"))
            if value is not None:
                port_calls.append(value)
        activity_metrics = price_volatility_metrics(port_calls)
        if activity_metrics:
            result.metrics["portwatch_portcall_cv"] = activity_metrics["price_cv"]
            result.metrics["portwatch_portcall_change_pct"] = activity_metrics[
                "latest_price_change_pct"
            ]
        result.evidence.append(
            Evidence(
                source="PortWatch",
                title="PortWatch port activity",
                url=self.endpoint,
                observed_at=datetime.now(UTC).isoformat(timespec="seconds").replace(
                    "+00:00", "Z"
                ),
                confidence=70,
                metric="port_activity",
                value={"records": len(features), "country": iso3},
            )
        )
        return result


def price_volatility_metrics(values: list[float]) -> dict[str, float]:
    clean = [float(value) for value in values if value is not None and math.isfinite(float(value))]
    if len(clean) < 2:
        return {}
    mean = statistics.fmean(clean)
    stdev = statistics.pstdev(clean)
    cv = abs(stdev / mean) if mean else 0.0
    latest = clean[-1]
    previous_window = clean[-4:-1] if len(clean) >= 4 else clean[:-1]
    previous_avg = statistics.fmean(previous_window) if previous_window else clean[-2]
    latest_change_pct = ((latest - previous_avg) / previous_avg * 100) if previous_avg else 0.0
    return {
        "price_mean": mean,
        "price_stdev": stdev,
        "price_cv": cv,
        "latest_price_change_pct": latest_change_pct,
        "price_points": len(clean),
    }


def gdelt_url_for_manual_check(query: str) -> str:
    return "https://api.gdeltproject.org/api/v2/doc/doc?" + urllib.parse.urlencode(
        {"query": query, "mode": "artlist", "format": "json", "timespan": "7d", "maxrecords": 20}
    )


def _numeric_text(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return _finite_float(str(value).replace(",", ""))


def _finite_float(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None
