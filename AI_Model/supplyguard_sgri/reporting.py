from __future__ import annotations

import re
from typing import Any

from .gemini_json_client import GeminiInteractionsJsonClient, GeminiJsonError


MODEL = "gemini-3.6-flash"
OUTLINE = (
    ("summary", "경영진 요약"),
    ("risk", "공급망 리스크 분석"),
    ("alternative", "대체 공급처 제안"),
    ("action", "권장 대응 전략"),
)
SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "executive_summary": {"type": "string"},
        "risk_analysis": {"type": "string"},
        "alternative_suppliers": {"type": "string"},
        "recommended_actions": {"type": "string"},
        "data_limitations": {
            "type": "array",
            "items": {"type": "string"},
        },
    },
    "required": [
        "title",
        "executive_summary",
        "risk_analysis",
        "alternative_suppliers",
        "recommended_actions",
        "data_limitations",
    ],
    "additionalProperties": False,
}
PROMPT = """Write a concise Korean supply-chain risk report draft.
Use exactly this outline: 경영진 요약, 공급망 리스크 분석, 대체 공급처 제안,
권장 대응 전략. Use only the supplied assessment and company recommendations.
Return section bodies only; do not repeat section titles inside the bodies.
In the risk section, explain why each supplied component weight was selected.
Do not invent companies, events, prices, certifications, sources, or measurements.
State missing-data limits and require human verification before procurement."""


def generate_report_draft(
    procurement: dict[str, Any],
    risk_result: dict[str, Any],
    company_result: dict[str, Any] | None = None,
    *,
    client: GeminiInteractionsJsonClient | None = None,
) -> dict[str, Any]:
    """Generate a fixed-outline report draft from verified model outputs."""

    company_result = company_result or {
        "summary": "기업 후보 데이터가 제공되지 않았습니다.",
        "recommendations": [],
    }
    fallback = _fallback_report(procurement, risk_result, company_result)
    api_client = client or GeminiInteractionsJsonClient(timeout_seconds=30)
    try:
        result, metadata = api_client.generate(
            {
                "procurement": procurement,
                "risk_assessment": {
                    "score": risk_result["score"],
                    "level": risk_result["level_ko"],
                    "confidence": risk_result["confidence"],
                    "components": [
                        {
                            "key": row["key"],
                            "label": row["label"],
                            "score": row["score"],
                            "weight_percent": row["weight_percent"],
                            "weight_reason": row["weight_reason"],
                            "reasons": row["reasons"],
                        }
                        for row in risk_result["components"]
                    ],
                    "recommendations": risk_result["recommendations"],
                },
                "company_recommendations": {
                    "summary": company_result["summary"],
                    "recommendations": company_result["recommendations"],
                },
                "required_outline": [
                    {"id": section_id, "title": title}
                    for section_id, title in OUTLINE
                ],
            },
            system_prompt=PROMPT,
            schema=SCHEMA,
            schema_name="supplyguard_report_draft",
            model=MODEL,
            reasoning_effort="low",
            max_output_tokens=3000,
        )
        return {
            "title": str(result["title"]).strip(),
            "status": "draft",
            "sections": _sections(result),
            "data_limitations": [
                str(value) for value in result["data_limitations"]
            ],
            "human_review_required": True,
            "gemini": {
                "requested": True,
                "status": "applied",
                "model": metadata.get("model") or MODEL,
                "response_id": metadata.get("response_id"),
                "usage": metadata.get("usage") or {},
            },
        }
    except (GeminiJsonError, ValueError, TypeError, KeyError) as exc:
        fallback["gemini"] = {
            "requested": True,
            "status": "fallback",
            "model": MODEL,
            "error": str(exc),
        }
        return fallback


def _sections(result: dict[str, Any]) -> list[dict[str, str]]:
    bodies = {
        "summary": result["executive_summary"],
        "risk": result["risk_analysis"],
        "alternative": result["alternative_suppliers"],
        "action": result["recommended_actions"],
    }
    sections = [
        {
            "id": section_id,
            "title": title,
            "body": _strip_repeated_heading(bodies[section_id], title),
        }
        for section_id, title in OUTLINE
    ]
    if any(not section["body"] for section in sections):
        raise ValueError("Gemini report section is empty")
    return sections


def _strip_repeated_heading(value: Any, title: str) -> str:
    body = str(value).strip()
    pattern = (
        rf"^\s*(?:#{{1,6}}\s*)?(?:\*\*)?{re.escape(title)}"
        rf"(?:\*\*)?\s*(?::|：|-)?\s*"
    )
    return re.sub(pattern, "", body, count=1).strip()


def _fallback_report(
    procurement: dict[str, Any],
    risk_result: dict[str, Any],
    company_result: dict[str, Any],
) -> dict[str, Any]:
    companies = company_result.get("recommendations") or []
    company_text = (
        ", ".join(
            f"{row['rank']}위 {row['company_name']}({row['match_score']:.1f}점)"
            for row in companies
        )
        if companies
        else "수집된 기업 후보 데이터가 없어 추천 기업을 작성하지 않았습니다."
    )
    high_risks = sorted(
        risk_result["components"],
        key=lambda row: row["score"] * row["weight"],
        reverse=True,
    )[:3]
    risk_text = ", ".join(
        f"{row['label']} {row['score']:.1f}점" for row in high_risks
    )
    weight_text = " ".join(
        f"{row['label']} {row['weight_percent']:.1f}%: {row['weight_reason']}"
        for row in risk_result["components"]
    )
    actions = " ".join(
        f"{index}. {text}"
        for index, text in enumerate(
            risk_result["recommendations"],
            start=1,
        )
    )
    return {
        "title": f"{procurement['item_name']} 공급망 리스크 대응 보고서",
        "status": "draft",
        "sections": [
            {
                "id": "summary",
                "title": "경영진 요약",
                "body": (
                    f"HS {procurement['hs_code']} {procurement['item_name']}의 "
                    f"SGRI는 {risk_result['score']:.1f}점이며 위험 수준은 "
                    f"{risk_result['level_ko']}입니다."
                ),
            },
            {
                "id": "risk",
                "title": "공급망 리스크 분석",
                "body": (
                    f"우선 확인할 위험 항목은 {risk_text}입니다. "
                    f"가중치 설정 근거: {weight_text}"
                ),
            },
            {
                "id": "alternative",
                "title": "대체 공급처 제안",
                "body": company_text,
            },
            {
                "id": "action",
                "title": "권장 대응 전략",
                "body": actions or "담당자 검토 후 대응 전략을 확정하세요.",
            },
        ],
        "data_limitations": [
            "이 문서는 자동 생성 초안입니다.",
            "계약 전 기업 정보, 가격, 공급량, 인증과 출처를 담당자가 확인해야 합니다.",
        ],
        "human_review_required": True,
    }
