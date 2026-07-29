from __future__ import annotations

from contextlib import closing
from typing import Any

from .db_weighting import (
    DatabaseWeightingError,
    database_dsn,
    load_psycopg2,
    merge_database_component_scores,
)
from .models import SCORE_KEYS, WeightOptions
from .recommendation import (
    RecommendationOptions,
    explain_ranked_candidates,
    rank_candidates,
)
from .weighting import determine_entropy_weights, determine_weights


def recommend_countries_from_database(
    *,
    hs_code: str,
    recommendation_options: RecommendationOptions,
    as_of_date: str | None = None,
    top_n: int = 5,
    dsn: str | None = None,
    entropy_blend_ratio: float = 0.50,
    max_weight_adjustment: float = 0.08,
    weight_options: WeightOptions | None = None,
    query_id: int | None = None,
    persist: bool = False,
) -> dict[str, Any]:
    """Rank DB candidates deterministically, then ask Gemini to explain."""

    if persist and query_id is None:
        raise ValueError("query_id is required when persist=True")
    psycopg2 = load_psycopg2()
    with closing(psycopg2.connect(database_dsn(dsn))) as connection:
        item_rows = _fetch_latest_rows(
            connection,
            hs_code=hs_code,
            as_of_date=as_of_date,
        )
        if not item_rows:
            raise DatabaseWeightingError(
                f"No country_risk_scores candidates found for hs_code={hs_code}"
            )
        country_rows = _fetch_latest_rows(
            connection,
            hs_code=None,
            as_of_date=as_of_date,
        )
        country_by_code = {
            str(row["country_code"]).strip(): row for row in country_rows
        }

        candidates: list[dict[str, Any]] = []
        for item_row in item_rows:
            country_code = str(item_row["country_code"]).strip()
            merged = merge_database_component_scores(
                item_row,
                country_by_code.get(country_code),
            )
            candidates.append(
                {
                    "country_code": country_code,
                    "country_name": item_row.get("country_name"),
                    "as_of_date": _date_value(item_row.get("as_of_date")),
                    "component_scores": merged["component_scores"],
                    "component_sources": merged["sources"],
                    "neutral_fallback_keys": merged["fallback_keys"],
                }
            )

        if weight_options:
            weight_decision = determine_weights(
                weight_options,
                _candidate_weight_context(candidates),
                request_context={
                    "hs_code": hs_code,
                    "procurement_context": (
                        recommendation_options.procurement_context or {}
                    ),
                    "business_context": recommendation_options.business_context,
                    "candidate_count": len(candidates),
                },
            )
        else:
            weight_decision = determine_entropy_weights(
                candidates,
                blend_ratio=entropy_blend_ratio,
                max_adjustment=max_weight_adjustment,
            )
        ranked = rank_candidates(
            candidates,
            weight_decision.effective_weights,
            top_n=top_n,
        )
        explanation = explain_ranked_candidates(
            ranked,
            weights=weight_decision.effective_weights,
            options=recommendation_options,
        )
        explanation_by_key = {
            (
                int(item["rank"]),
                str(item["country_code"]).strip().upper(),
            ): item
            for item in explanation["recommendations"]
        }
        for candidate in ranked:
            candidate["recommendation"] = explanation_by_key[
                (candidate["rank"], candidate["country_code"].upper())
            ]

        result = {
            "title": "SupplyGuard 조달 후보국 추천",
            "hs_code": hs_code,
            "as_of_date_upper_bound": as_of_date,
            "ranking_method": "deterministic_sgri_ascending",
            "weight_profile": weight_decision.to_dict(),
            "recommendation_summary": explanation["summary"],
            "gemini": explanation["gemini"],
            "candidates": ranked,
            "weights_use_gemini": weight_decision.uses_llm,
            "score_and_rank_calculated_by": "python_using_effective_weights",
            "gemini_role": "bounded weight proposal and natural-language explanation",
            "persisted": False,
        }
        if persist:
            _persist_recommendations(
                connection,
                query_id=int(query_id),
                candidates=ranked,
            )
            result["persisted"] = True
            result["query_id"] = query_id
        return result


def _candidate_weight_context(
    candidates: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    count = len(candidates)
    return {
        key: {
            "score": sum(row["component_scores"][key] for row in candidates) / count,
            "confidence": (
                sum(
                    30 if key in row["neutral_fallback_keys"] else 75
                    for row in candidates
                )
                / count
            ),
            "candidate_scores": [
                row["component_scores"][key] for row in candidates
            ],
        }
        for key in SCORE_KEYS
    }


def _fetch_latest_rows(
    connection: Any,
    *,
    hs_code: str | None,
    as_of_date: str | None,
) -> list[dict[str, Any]]:
    hs_predicate = "crs.hs_code IS NULL" if hs_code is None else "crs.hs_code = %s"
    params: list[Any] = []
    if hs_code is not None:
        params.append(hs_code)
    date_predicate = ""
    if as_of_date:
        date_predicate = "AND crs.as_of_date <= %s"
        params.append(as_of_date)
    query = f"""
        SELECT DISTINCT ON (crs.country_code)
            crs.country_code,
            c.name_ko AS country_name,
            crs.hs_code,
            crs.as_of_date,
            crs.score_s,
            crs.score_p,
            crs.score_v,
            crs.score_l,
            crs.score_c,
            crs.score_e,
            crs.sgri_score
        FROM country_risk_scores crs
        JOIN countries c ON c.country_code = crs.country_code
        WHERE {hs_predicate}
          {date_predicate}
        ORDER BY crs.country_code, crs.as_of_date DESC
    """
    with connection.cursor() as cursor:
        cursor.execute(query, params)
        columns = [description.name for description in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _persist_recommendations(
    connection: Any,
    *,
    query_id: int,
    candidates: list[dict[str, Any]],
) -> None:
    query = """
        INSERT INTO procurement_recommendations (
            query_id,
            country_code,
            rank,
            sgri_score,
            score_s,
            score_c,
            score_v,
            score_l,
            score_p,
            score_e,
            fit_score,
            rationale
        ) VALUES (
            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
        )
        ON CONFLICT (query_id, country_code) DO UPDATE SET
            rank = EXCLUDED.rank,
            sgri_score = EXCLUDED.sgri_score,
            score_s = EXCLUDED.score_s,
            score_c = EXCLUDED.score_c,
            score_v = EXCLUDED.score_v,
            score_l = EXCLUDED.score_l,
            score_p = EXCLUDED.score_p,
            score_e = EXCLUDED.score_e,
            fit_score = EXCLUDED.fit_score,
            rationale = EXCLUDED.rationale
    """
    with connection.cursor() as cursor:
        for candidate in candidates:
            scores = candidate["component_scores"]
            cursor.execute(
                query,
                (
                    query_id,
                    candidate["country_code"],
                    candidate["rank"],
                    candidate["sgri_score"],
                    scores["S"],
                    scores["C"],
                    scores["V"],
                    scores["L"],
                    scores["P"],
                    scores["E"],
                    candidate["fit_score"],
                    candidate["recommendation"]["rationale"],
                ),
            )
    connection.commit()


def _date_value(value: Any) -> Any:
    return value.isoformat() if hasattr(value, "isoformat") else value
