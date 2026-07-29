from __future__ import annotations

import json
from typing import Any

from .company_recommendation import (
    load_company_candidates_from_database,
    recommend_companies,
)
from .db_recommendation import recommend_countries_from_database
from .models import ProcurementProfile, SgriRequest, WeightOptions
from .recommendation import RECOMMENDATION_MODEL, RecommendationOptions
from .reporting import generate_report_draft
from .scoring import evaluate_sgri


MODEL_API_VERSION = "3.0"
PROCUREMENT_FIELDS = {
    "hs_code",
    "item_name",
    "quantity",
    "target_price",
    "delivery_date",
    "quality_certification",
}


def evaluate_company_risk(
    payload: dict[str, Any],
    *,
    use_live_apis: bool = False,
) -> dict[str, Any]:
    """Evaluate the procurement request defined by the requirements workbook."""

    profile = _procurement_profile(payload)
    request = SgriRequest.from_dict(
        {
            **profile.to_dict(),
            "import_country": "GLOBAL",
            "delivery_due_date": profile.delivery_date,
            "api_options": {"use_live_apis": use_live_apis},
            "weight_options": {"strategy": "llm"},
        }
    )
    result = evaluate_sgri(request).to_dict()
    return {
        "schema_version": MODEL_API_VERSION,
        "model": {
            "name": "SupplyGuard SGRI",
            "task": "procurement_request_risk_evaluation",
            "weights_may_use_llm": True,
            "score_calculated_by": "python_formula",
        },
        "procurement": profile.to_dict(),
        "result": result,
    }


def analyze_procurement(
    payload: dict[str, Any],
    *,
    candidate_companies: list[dict[str, Any]] | None = None,
    load_company_database: bool = False,
    dsn: str | None = None,
    use_live_apis: bool = False,
) -> dict[str, Any]:
    """Return risk, company recommendations, and a report draft."""

    assessment = evaluate_company_risk(
        payload,
        use_live_apis=use_live_apis,
    )
    procurement = assessment["procurement"]
    candidates = candidate_companies
    if candidates is None and load_company_database:
        candidates = load_company_candidates_from_database(
            procurement["hs_code"],
            dsn=dsn,
        )
    company_result = recommend_companies(procurement, candidates or [])
    report = generate_report_draft(
        procurement,
        assessment["result"],
        company_result,
    )
    return {
        "schema_version": MODEL_API_VERSION,
        "model": {
            "name": "SupplyGuard procurement analysis",
            "task": "risk_evaluation_company_recommendation_report_draft",
            "llm": "gemini-3.6-flash",
            "score_calculated_by": "python_formula",
            "llm_roles": [
                "bounded_weight_proposal",
                "company_recommendation_from_supplied_candidates",
                "report_draft",
            ],
        },
        "procurement": procurement,
        "risk_assessment": assessment["result"],
        "company_recommendations": company_result,
        "report_draft": report,
    }


def recommend_company_countries(
    payload: dict[str, Any],
    *,
    dsn: str | None = None,
) -> dict[str, Any]:
    """Recommend countries from DB data using the same six procurement fields."""

    profile = _procurement_profile(payload)
    context = profile.to_dict()
    result = recommend_countries_from_database(
        hs_code=profile.hs_code,
        recommendation_options=RecommendationOptions(
            use_gemini=True,
            model=RECOMMENDATION_MODEL,
            reasoning_effort="low",
            business_context=json.dumps(context, ensure_ascii=False),
            procurement_context=context,
        ),
        top_n=5,
        dsn=dsn,
        weight_options=WeightOptions(strategy="llm"),
    )
    return {
        "schema_version": MODEL_API_VERSION,
        "model": {
            "name": "SupplyGuard procurement country recommendation",
            "task": "procurement_country_recommendation",
            "weights_may_use_llm": True,
            "score_and_rank_calculated_by": "python_using_effective_weights",
        },
        "procurement": context,
        "result": result,
    }


class SupplyGuardCompanyModel:
    """Backend-neutral model facade."""

    api_version = MODEL_API_VERSION

    def evaluate(
        self,
        payload: dict[str, Any],
        *,
        use_live_apis: bool = False,
    ) -> dict[str, Any]:
        return evaluate_company_risk(payload, use_live_apis=use_live_apis)

    def recommend(
        self,
        payload: dict[str, Any],
        *,
        dsn: str | None = None,
    ) -> dict[str, Any]:
        return recommend_company_countries(payload, dsn=dsn)

    def analyze(
        self,
        payload: dict[str, Any],
        *,
        candidate_companies: list[dict[str, Any]] | None = None,
        load_company_database: bool = False,
        dsn: str | None = None,
        use_live_apis: bool = False,
    ) -> dict[str, Any]:
        return analyze_procurement(
            payload,
            candidate_companies=candidate_companies,
            load_company_database=load_company_database,
            dsn=dsn,
            use_live_apis=use_live_apis,
        )


def _procurement_profile(payload: dict[str, Any]) -> ProcurementProfile:
    if not isinstance(payload, dict):
        raise ValueError("payload must be a JSON object")
    unknown_top = sorted(set(payload) - {"procurement"})
    if unknown_top:
        raise ValueError(
            f"payload contains unsupported field(s): {', '.join(unknown_top)}"
        )
    procurement = payload.get("procurement")
    if isinstance(procurement, dict):
        unknown = sorted(set(procurement) - PROCUREMENT_FIELDS)
        if unknown:
            raise ValueError(
                "procurement contains unsupported field(s): "
                + ", ".join(unknown)
            )
    return ProcurementProfile.from_dict(procurement)
