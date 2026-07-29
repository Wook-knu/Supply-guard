from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .models import SCORE_KEYS, clamp
from .gemini_recommendation_client import (
    GeminiInteractionsRecommendationClient,
    GeminiRecommendationError,
)
from .weighting import weighted_score


LABELS_KO = {
    "S": "수급 불안정성",
    "P": "국가·정책 리스크",
    "V": "가격 변동성",
    "L": "물류 리스크",
    "C": "공급처 집중도",
    "E": "ESG·탄소규제",
}
RECOMMENDATION_MODEL = "gemini-3.6-flash"


@dataclass(slots=True)
class RecommendationOptions:
    use_gemini: bool = True
    model: str = RECOMMENDATION_MODEL
    reasoning_effort: str = "low"
    business_context: str = ""
    procurement_context: dict[str, Any] | None = None
    timeout_seconds: float = 30.0
    safety_identifier: str | None = None

    def __post_init__(self) -> None:
        if self.model != RECOMMENDATION_MODEL:
            raise ValueError(
                f"recommendation model is locked to {RECOMMENDATION_MODEL}"
            )
        if self.reasoning_effort not in {
            "minimal",
            "low",
            "medium",
            "high",
        }:
            raise ValueError("unsupported recommendation reasoning_effort")
        if self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be greater than zero")
        if len(self.business_context) > 4000:
            raise ValueError("business_context must be 4000 characters or fewer")
        if self.procurement_context is not None and not isinstance(
            self.procurement_context, dict
        ):
            raise ValueError("procurement_context must be a JSON object")


def rank_candidates(
    candidates: list[dict[str, Any]],
    weights: dict[str, float],
    *,
    top_n: int = 5,
) -> list[dict[str, Any]]:
    if not 1 <= top_n <= 10:
        raise ValueError("top_n must be between 1 and 10")
    ranked: list[dict[str, Any]] = []
    for candidate in candidates:
        component_scores = {
            key: clamp(float(candidate["component_scores"][key]))
            for key in SCORE_KEYS
        }
        score = weighted_score(component_scores, weights)
        ranked.append(
            {
                **candidate,
                "component_scores": component_scores,
                "sgri_score": round(score, 3),
                "fit_score": round(100 - score, 3),
            }
        )
    ranked.sort(key=lambda item: (item["sgri_score"], item["country_code"]))
    for index, candidate in enumerate(ranked[:top_n], start=1):
        candidate["rank"] = index
    return ranked[:top_n]


def explain_ranked_candidates(
    ranked: list[dict[str, Any]],
    *,
    weights: dict[str, float],
    options: RecommendationOptions,
    client: GeminiInteractionsRecommendationClient | None = None,
) -> dict[str, Any]:
    deterministic = deterministic_explanations(ranked)
    if not options.use_gemini:
        return {
            "summary": "결정론적 SGRI 순위와 규칙 기반 근거를 사용했습니다.",
            "recommendations": deterministic,
            "gemini": {
                "requested": False,
                "status": "disabled",
                "model": None,
                "uses_for_scoring": False,
            },
        }

    api_client = client or GeminiInteractionsRecommendationClient(
        timeout_seconds=options.timeout_seconds
    )
    payload = {
        "task": (
            "Explain the fixed deterministic procurement ranking. "
            "Do not calculate scores or change order."
        ),
        "business_context": options.business_context,
        "procurement_context": options.procurement_context or {},
        "calculation_boundary": {
            "weights": "already selected and validated before this call",
            "scores_calculated_by": "Python formula",
            "ranking_calculated_by": "Python ascending SGRI sort",
            "this_call_role": "natural-language explanation only",
        },
        "effective_weights": weights,
        "fixed_candidates": [
            {
                "rank": candidate["rank"],
                "country_code": candidate["country_code"],
                "country_name": candidate.get("country_name"),
                "sgri_score": candidate["sgri_score"],
                "fit_score": candidate["fit_score"],
                "component_scores": candidate["component_scores"],
                "missing_data": candidate.get("neutral_fallback_keys") or [],
            }
            for candidate in ranked
        ],
    }
    try:
        result, metadata = api_client.explain(
            payload,
            model=options.model,
            reasoning_effort=options.reasoning_effort,
            safety_identifier=options.safety_identifier,
        )
        validated = validate_fixed_ranking(result, ranked)
        return {
            "summary": str(result["summary"]).strip(),
            "recommendations": validated,
            "gemini": {
                "requested": True,
                "status": "applied",
                "model": metadata.get("model") or options.model,
                "response_id": metadata.get("response_id"),
                "usage": metadata.get("usage") or {},
                "uses_for_scoring": False,
            },
        }
    except (GeminiRecommendationError, ValueError, TypeError) as exc:
        return {
            "summary": (
                "Gemini 추천 설명을 적용하지 못해 결정론적 순위와 규칙 기반 "
                "근거를 반환했습니다."
            ),
            "recommendations": deterministic,
            "gemini": {
                "requested": True,
                "status": "fallback",
                "model": options.model,
                "error": str(exc),
                "uses_for_scoring": False,
            },
        }


def validate_fixed_ranking(
    result: dict[str, Any],
    ranked: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not isinstance(result, dict) or not str(result.get("summary") or "").strip():
        raise ValueError("Gemini recommendation summary is missing")
    recommendations = result.get("recommendations")
    if not isinstance(recommendations, list) or len(recommendations) != len(ranked):
        raise ValueError("Gemini must return exactly one explanation per fixed candidate")

    expected = [
        (candidate["rank"], candidate["country_code"].upper())
        for candidate in ranked
    ]
    actual: list[tuple[int, str]] = []
    for item in recommendations:
        if not isinstance(item, dict):
            raise ValueError("Gemini recommendation item must be an object")
        actual.append(
            (
                int(item.get("rank")),
                str(item.get("country_code") or "").strip().upper(),
            )
        )
    if actual != expected:
        raise ValueError("Gemini attempted to change the deterministic ranking")
    return recommendations


def deterministic_explanations(
    ranked: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    explanations: list[dict[str, Any]] = []
    for candidate in ranked:
        ordered = sorted(
            candidate["component_scores"].items(),
            key=lambda item: item[1],
        )
        strengths = [
            f"{LABELS_KO[key]} 점수가 {score:.1f}점으로 상대적으로 낮습니다."
            for key, score in ordered[:2]
        ]
        cautions = [
            f"{LABELS_KO[key]} 점수가 {score:.1f}점이므로 계약 전 확인이 필요합니다."
            for key, score in reversed(ordered[-2:])
        ]
        missing = candidate.get("neutral_fallback_keys") or []
        if missing:
            cautions.append(
                f"{', '.join(missing)} 지표는 결측으로 중립값 50을 사용했습니다."
            )
        explanations.append(
            {
                "rank": candidate["rank"],
                "country_code": candidate["country_code"],
                "rationale": (
                    f"Python 계산 SGRI {candidate['sgri_score']:.1f}점으로 "
                    f"{candidate['rank']}위입니다. 점수가 낮을수록 공급망 위험이 낮습니다."
                ),
                "strengths": strengths,
                "cautions": cautions,
            }
        )
    return explanations
