from __future__ import annotations

import json
import os
from contextlib import closing
from datetime import date
from typing import Any

from .config import load_project_env
from .models import SCORE_KEYS, WeightOptions, clamp
from .scoring import RISK_LEVELS_KO, risk_level
from .weighting import determine_weights, weighted_score


load_project_env()

DB_SCORE_COLUMNS = {
    "S": "score_s",
    "P": "score_p",
    "V": "score_v",
    "L": "score_l",
    "C": "score_c",
    "E": "score_e",
}
COUNTRY_LEVEL_KEYS = {"P", "L"}


class DatabaseWeightingError(RuntimeError):
    pass


def database_dsn(explicit_dsn: str | None = None) -> str:
    if explicit_dsn:
        return explicit_dsn
    if os.environ.get("DATABASE_URL"):
        return str(os.environ["DATABASE_URL"])
    parts = {
        "host": os.environ.get("DB_HOST", "localhost"),
        "port": os.environ.get("DB_PORT", "5432"),
        "dbname": os.environ.get("DB_NAME"),
        "user": os.environ.get("DB_USER", "postgres"),
        "password": os.environ.get("DB_PASSWORD", ""),
    }
    if not parts["dbname"]:
        raise DatabaseWeightingError(
            "DATABASE_URL or DB_NAME must be configured for database weighting"
        )
    return " ".join(f"{key}={value}" for key, value in parts.items())


def evaluate_latest_database_risk(
    *,
    country_code: str,
    hs_code: str,
    weight_options: WeightOptions,
    as_of_date: str | None = None,
    dsn: str | None = None,
    persist: bool = False,
) -> dict[str, Any]:
    psycopg2 = load_psycopg2()
    with closing(psycopg2.connect(database_dsn(dsn))) as connection:
        item_row = _fetch_latest_row(
            connection,
            country_code=country_code,
            hs_code=hs_code,
            as_of_date=as_of_date,
        )
        if not item_row:
            raise DatabaseWeightingError(
                f"No country_risk_scores row found for country={country_code}, hs_code={hs_code}"
            )
        country_row = _fetch_latest_row(
            connection,
            country_code=country_code,
            hs_code=None,
            as_of_date=as_of_date,
        )
        merged = merge_database_component_scores(item_row, country_row)
        component_scores = merged["component_scores"]
        component_context = {
            key: {
                "label": key,
                "score": component_scores[key],
                "confidence": 75 if key not in merged["fallback_keys"] else 30,
                "reasons": [
                    merged["sources"][key],
                ],
                "metrics": {
                    "database_column": DB_SCORE_COLUMNS[key],
                    "item_as_of_date": _json_value(item_row.get("as_of_date")),
                    "country_as_of_date": _json_value(
                        country_row.get("as_of_date") if country_row else None
                    ),
                },
            }
            for key in SCORE_KEYS
        }
        decision = determine_weights(
            weight_options,
            component_context,
            request_context={
                "country_code": country_code,
                "hs_code": hs_code,
                "item_name": item_row.get("item_name"),
                "database": "country_risk_scores",
                "missing_scores_filled_with_neutral_50": merged["fallback_keys"],
            },
        )
        score = weighted_score(component_scores, decision.effective_weights)
        level = risk_level(score)
        result = {
            "title": "SupplyGuard DB 기반 SGRI 가중치 계산 결과",
            "country_code": country_code,
            "hs_code": hs_code,
            "item_name": item_row.get("item_name"),
            "as_of_date": _json_value(item_row.get("as_of_date")),
            "component_scores": component_scores,
            "component_sources": merged["sources"],
            "neutral_fallback_keys": merged["fallback_keys"],
            "weight_profile": decision.to_dict(),
            "score": round(clamp(score), 3),
            "level": level,
            "level_ko": RISK_LEVELS_KO.get(level, level),
            "calculation": " + ".join(
                f"{key} {component_scores[key]:.3f} x "
                f"{decision.effective_weights[key]:.6f}"
                for key in SCORE_KEYS
            ),
            "caveat": (
                "가중치는 요청 전략에 따라 LLM 제안 또는 데이터 신뢰도를 사용하며 "
                "검증과 최종 점수 계산은 Python이 수행합니다. "
                "실제 지연·품절·원가손실 라벨이 쌓이면 통계 모델로 재보정할 수 있습니다."
            ),
        }
        if persist:
            _persist_weight_profile(connection, result)
            result["persisted"] = True
        else:
            result["persisted"] = False
        return result


def merge_database_component_scores(
    item_row: dict[str, Any],
    country_row: dict[str, Any] | None,
) -> dict[str, Any]:
    scores: dict[str, float] = {}
    sources: dict[str, str] = {}
    fallback_keys: list[str] = []
    for key in SCORE_KEYS:
        column = DB_SCORE_COLUMNS[key]
        item_value = _number(item_row.get(column))
        country_value = _number(country_row.get(column)) if country_row else None
        if key in COUNTRY_LEVEL_KEYS and country_value is not None:
            value = country_value
            source = f"국가 단위 행(hs_code=NULL)의 {column}"
        elif item_value is not None:
            value = item_value
            source = f"국가×품목 행의 {column}"
        elif country_value is not None:
            value = country_value
            source = f"국가 단위 행(hs_code=NULL)의 {column}"
        else:
            value = 50.0
            source = f"{column} 결측으로 중립값 50 적용"
            fallback_keys.append(key)
        scores[key] = clamp(value)
        sources[key] = source
    return {
        "component_scores": scores,
        "sources": sources,
        "fallback_keys": fallback_keys,
    }


def _fetch_latest_row(
    connection: Any,
    *,
    country_code: str,
    hs_code: str | None,
    as_of_date: str | None,
) -> dict[str, Any] | None:
    hs_predicate = "crs.hs_code IS NULL" if hs_code is None else "crs.hs_code = %s"
    params: list[Any] = [country_code]
    if hs_code is not None:
        params.append(hs_code)
    date_predicate = ""
    if as_of_date:
        date_predicate = "AND crs.as_of_date <= %s"
        params.append(as_of_date)
    query = f"""
        SELECT
            crs.country_code,
            crs.hs_code,
            crs.as_of_date,
            crs.score_s,
            crs.score_p,
            crs.score_v,
            crs.score_l,
            crs.score_c,
            crs.score_e,
            crs.sgri_score,
            h.name_ko AS item_name
        FROM country_risk_scores crs
        LEFT JOIN hs_codes h ON h.hs_code = crs.hs_code
        WHERE crs.country_code = %s
          AND {hs_predicate}
          {date_predicate}
        ORDER BY crs.as_of_date DESC
        LIMIT 1
    """
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        row = cursor.fetchone()
        if row is None:
            return None
        columns = [description.name for description in cursor.description]
        return dict(zip(columns, row))


def _persist_weight_profile(connection: Any, result: dict[str, Any]) -> None:
    profile = result["weight_profile"]
    query = """
        INSERT INTO sgri_weight_profiles (
            country_code,
            hs_code,
            as_of_date,
            strategy,
            status,
            formula_version,
            component_scores,
            baseline_weights,
            objective_weights,
            effective_weights,
            reliability,
            summary,
            sgri_score,
            uses_llm
        ) VALUES (
            %s, %s, %s, %s, %s, %s,
            %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb, %s::jsonb,
            %s, %s, %s
        )
    """
    values = (
        result["country_code"],
        result["hs_code"],
        result["as_of_date"],
        profile["strategy"],
        profile["status"],
        profile["formula_version"],
        json.dumps(result["component_scores"]),
        json.dumps(profile["baseline_weights"]),
        json.dumps(profile.get("objective_weights")),
        json.dumps(profile["effective_weights"]),
        json.dumps(profile.get("reliability") or {}),
        profile.get("summary"),
        result["score"],
        bool(profile.get("uses_llm")),
    )
    with connection.cursor() as cursor:
        cursor.execute(query, values)
    connection.commit()


def load_psycopg2() -> Any:
    try:
        import psycopg2
    except ImportError as exc:
        raise DatabaseWeightingError(
            "psycopg2 is required for DB mode; install requirements-db.txt"
        ) from exc
    return psycopg2


def _number(value: Any) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _json_value(value: Any) -> Any:
    if isinstance(value, date):
        return value.isoformat()
    return value
