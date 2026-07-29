import unittest

from supplyguard_sgri.db_weighting import merge_database_component_scores
from supplyguard_sgri.models import SgriRequest, WeightOptions
from supplyguard_sgri.recommendation import (
    RecommendationOptions,
    explain_ranked_candidates,
    rank_candidates,
)
from supplyguard_sgri.scoring import evaluate_sgri
from supplyguard_sgri.weighting import (
    BASE_WEIGHTS,
    determine_entropy_weights,
    determine_weights,
    project_with_baseline_bounds,
    validate_and_normalize_weights,
)


def component_context(confidences):
    return {
        key: {
            "score": 50,
            "confidence": confidences.get(key, 70),
            "reasons": [],
            "metrics": {},
        }
        for key in BASE_WEIGHTS
    }


def candidate_rows():
    return [
        {
            "country_code": "AA",
            "component_scores": {
                "S": 20,
                "P": 30,
                "V": 25,
                "L": 35,
                "C": 30,
                "E": 40,
            },
            "neutral_fallback_keys": [],
        },
        {
            "country_code": "BB",
            "component_scores": {
                "S": 80,
                "P": 50,
                "V": 65,
                "L": 55,
                "C": 70,
                "E": 45,
            },
            "neutral_fallback_keys": [],
        },
    ]


class FakeRecommendationClient:
    def __init__(self, result):
        self.result = result
        self.payload = None

    def explain(self, payload, **kwargs):
        self.payload = payload
        return self.result, {
            "model": kwargs["model"],
            "response_id": "resp_test",
            "usage": {"input_tokens": 100, "output_tokens": 50},
        }


class FakeWeightClient:
    def __init__(self, result):
        self.result = result

    def generate(self, payload, **kwargs):
        return self.result, {
            "model": kwargs["model"],
            "response_id": "resp_weight",
            "usage": {"input_tokens": 80, "output_tokens": 40},
        }


class WeightingTests(unittest.TestCase):
    def test_normalizes_complete_proposal(self):
        result = validate_and_normalize_weights(
            {"S": 25, "P": 20, "V": 15, "L": 15, "C": 15, "E": 10}
        )
        self.assertAlmostEqual(sum(result.values()), 1.0)
        self.assertAlmostEqual(result["S"], 0.25)

    def test_rejects_incomplete_proposal(self):
        with self.assertRaises(ValueError):
            validate_and_normalize_weights(
                {"S": 0.3, "P": 0.2, "V": 0.2, "L": 0.1, "C": 0.2}
            )

    def test_projects_to_simplex_with_baseline_bounds(self):
        projected = project_with_baseline_bounds(
            {
                "S": 0.8,
                "P": 0.05,
                "V": 0.05,
                "L": 0.04,
                "C": 0.04,
                "E": 0.02,
            },
            baseline=BASE_WEIGHTS,
            max_adjustment=0.08,
        )
        self.assertAlmostEqual(sum(projected.values()), 1.0, places=8)
        for key, value in projected.items():
            self.assertGreaterEqual(
                value, max(0, BASE_WEIGHTS[key] - 0.08) - 1e-9
            )
            self.assertLessEqual(value, BASE_WEIGHTS[key] + 0.08 + 1e-9)

    def test_equal_reliability_keeps_baseline_without_llm(self):
        decision = determine_weights(
            WeightOptions(strategy="reliability"),
            component_context({key: 80 for key in BASE_WEIGHTS}),
        )
        self.assertEqual(decision.status, "calculated")
        for key in BASE_WEIGHTS:
            self.assertAlmostEqual(
                decision.effective_weights[key], BASE_WEIGHTS[key]
            )
        self.assertFalse(decision.to_dict()["uses_llm"])

    def test_reliability_weighting_is_bounded(self):
        decision = determine_weights(
            WeightOptions(
                strategy="reliability",
                max_adjustment=0.08,
                reliability_floor=0.25,
            ),
            component_context(
                {"S": 100, "P": 90, "V": 20, "L": 30, "C": 50, "E": 10}
            ),
        )
        self.assertAlmostEqual(sum(decision.effective_weights.values()), 1.0)
        for key, value in decision.effective_weights.items():
            self.assertLessEqual(abs(value - BASE_WEIGHTS[key]), 0.08 + 1e-8)

    def test_llm_weight_proposal_is_validated_and_applied(self):
        result = {
            "weights": {
                "S": 0.35,
                "P": 0.15,
                "V": 0.15,
                "L": 0.15,
                "C": 0.10,
                "E": 0.10,
            },
            "rationales": {key: f"{key} 근거" for key in BASE_WEIGHTS},
            "summary": "기업 조달정보를 반영했습니다.",
        }
        decision = determine_weights(
            WeightOptions(strategy="llm"),
            component_context({key: 80 for key in BASE_WEIGHTS}),
            request_context={"item_name": "battery"},
            client=FakeWeightClient(result),
        )
        self.assertTrue(decision.uses_llm)
        self.assertEqual(decision.status, "applied")
        self.assertAlmostEqual(sum(decision.effective_weights.values()), 1.0)
        for key, value in decision.effective_weights.items():
            self.assertLessEqual(abs(value - BASE_WEIGHTS[key]), 0.08 + 1e-8)

    def test_invalid_llm_weight_proposal_uses_reliability_fallback(self):
        decision = determine_weights(
            WeightOptions(strategy="llm"),
            component_context({key: 80 for key in BASE_WEIGHTS}),
            client=FakeWeightClient(
                {
                    "weights": {"S": 1},
                    "rationales": {key: "근거" for key in BASE_WEIGHTS},
                    "summary": "invalid",
                }
            ),
        )
        self.assertFalse(decision.uses_llm)
        self.assertEqual(decision.status, "fallback_reliability")

    def test_sgri_response_exposes_deterministic_weight_audit(self):
        request = SgriRequest.from_dict(
            {
                "hs_code": "850760",
                "item_name": "battery material",
                "import_country": "CHN",
                "supplier_share_pct": 70,
                "alternate_supplier_count": 1,
                "inventory_days": 20,
                "lead_time_days": 45,
                "shipment_delay_days": 7,
                "unit_price_history": [100, 104, 108, 120],
                "api_options": {"use_live_apis": False},
                "weight_options": {"strategy": "reliability"},
            }
        )
        result = evaluate_sgri(request).to_dict()
        self.assertEqual(result["weight_profile"]["status"], "calculated")
        self.assertFalse(result["weight_profile"]["uses_llm"])
        self.assertEqual(result["weight_total"], 1.0)

    def test_entropy_weights_and_candidate_rank_are_deterministic(self):
        candidates = candidate_rows()
        decision = determine_entropy_weights(candidates)
        ranked = rank_candidates(candidates, decision.effective_weights)
        self.assertEqual([row["country_code"] for row in ranked], ["AA", "BB"])
        self.assertEqual([row["rank"] for row in ranked], [1, 2])
        self.assertAlmostEqual(sum(decision.effective_weights.values()), 1.0)
        self.assertFalse(decision.to_dict()["uses_llm"])

    def test_recommendation_limits_model_and_candidate_count(self):
        with self.assertRaisesRegex(ValueError, "locked"):
            RecommendationOptions(model="gemini-3.6-pro")
        with self.assertRaisesRegex(ValueError, "between 1 and 10"):
            rank_candidates(candidate_rows(), BASE_WEIGHTS, top_n=11)

    def test_gemini_can_explain_but_cannot_change_rank(self):
        ranked = rank_candidates(candidate_rows(), BASE_WEIGHTS)
        result = {
            "summary": "고정 순위 설명",
            "recommendations": [
                {
                    "rank": row["rank"],
                    "country_code": row["country_code"],
                    "rationale": "설명",
                    "strengths": ["장점"],
                    "cautions": ["주의"],
                }
                for row in ranked
            ],
        }
        client = FakeRecommendationClient(result)
        explained = explain_ranked_candidates(
            ranked,
            weights=BASE_WEIGHTS,
            options=RecommendationOptions(
                model="gemini-3.6-flash",
                procurement_context={"item_name": "battery material"},
            ),
            client=client,
        )
        self.assertEqual(explained["gemini"]["status"], "applied")
        self.assertFalse(explained["gemini"]["uses_for_scoring"])
        self.assertEqual(
            client.payload["procurement_context"]["item_name"],
            "battery material",
        )

    def test_gemini_reordering_falls_back_to_deterministic_explanation(self):
        ranked = rank_candidates(candidate_rows(), BASE_WEIGHTS)
        result = {
            "summary": "순서 변경 시도",
            "recommendations": [
                {
                    "rank": 1,
                    "country_code": "BB",
                    "rationale": "변경",
                    "strengths": [],
                    "cautions": [],
                },
                {
                    "rank": 2,
                    "country_code": "AA",
                    "rationale": "변경",
                    "strengths": [],
                    "cautions": [],
                },
            ],
        }
        explained = explain_ranked_candidates(
            ranked,
            weights=BASE_WEIGHTS,
            options=RecommendationOptions(model="gemini-3.6-flash"),
            client=FakeRecommendationClient(result),
        )
        self.assertEqual(explained["gemini"]["status"], "fallback")
        self.assertEqual(
            [row["country_code"] for row in explained["recommendations"]],
            ["AA", "BB"],
        )

    def test_database_merge_prefers_country_level_policy_and_logistics(self):
        item = {
            "score_s": 70,
            "score_p": None,
            "score_v": 40,
            "score_l": None,
            "score_c": 80,
            "score_e": 30,
        }
        country = {
            "score_s": None,
            "score_p": 65,
            "score_v": None,
            "score_l": 55,
            "score_c": None,
            "score_e": None,
        }
        merged = merge_database_component_scores(item, country)
        self.assertEqual(
            merged["component_scores"],
            {"S": 70, "P": 65, "V": 40, "L": 55, "C": 80, "E": 30},
        )
        self.assertEqual(merged["fallback_keys"], [])


if __name__ == "__main__":
    unittest.main()
