"""
Gemini 기업 후보 폴백.

회사 DB(companies)에 해당 품목(HS)을 취급하는 공급사가 없을 때,
Gemini로 실제 주요 공급사 후보를 생성해 companies 에 저장한다.
  - name / name_en / country_code / certifications / website → 실제 기업 기준
  - unit_price / lead_time_days / on_time_delivery_rate / defect_rate_pct → ★AI 추정치★
  - data_source = 'ai:gemini' 로 실데이터와 명확히 구분(프론트에서 라벨 표시).

무거운 호출(수십 초)이라 build_item_sgri(비동기) 경로에서만 켠다.
GEMINI_API_KEY 없음/429/실패 시 조용히 0을 반환(추천은 계속 진행).
"""
import json
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.orm import Session

# AI_Model 패키지(gemini_json_client) 를 import 경로에 추가
_AI_MODEL = Path(__file__).resolve().parents[3] / "AI_Model"
if str(_AI_MODEL) not in sys.path:
    sys.path.insert(0, str(_AI_MODEL))

# Gemini 구조화 출력 스키마 (배열은 최상위 dict로 감싼다 — 클라이언트가 dict를 요구)
_SCHEMA = {
    "type": "object",
    "required": ["companies"],
    "properties": {
        "companies": {
            "type": "array",
            "maxItems": 8,
            "items": {
                "type": "object",
                "required": ["name", "country_code"],
                "properties": {
                    "name": {"type": "string"},
                    "name_en": {"type": ["string", "null"]},
                    "country_code": {"type": "string"},
                    "website": {"type": ["string", "null"]},
                    "certifications": {"type": "array", "items": {"type": "string"}},
                    "unit_price": {"type": ["number", "null"], "minimum": 0},
                    "lead_time_days": {"type": ["number", "null"], "minimum": 0},
                    "on_time_delivery_rate": {"type": ["number", "null"], "minimum": 0, "maximum": 100},
                    "defect_rate_pct": {"type": ["number", "null"], "minimum": 0, "maximum": 100},
                },
                "additionalProperties": False,
            },
        }
    },
    "additionalProperties": False,
}

_SYSTEM = (
    "You are a global supply-chain sourcing analyst. Given an HS code, item name and candidate supplier "
    "countries, list up to 8 REAL, well-known supplier or manufacturer companies for that item. "
    "Use the company's real name and its actual headquarters country as an ISO-2 code. Strongly prefer "
    "companies located in the given candidate countries. certifications should be plausible real standards "
    "(e.g. ISO 9001, ISO 14001, IATF 16949). unit_price (USD per unit), lead_time_days, "
    "on_time_delivery_rate (percent) and defect_rate_pct (percent) are ESTIMATES — give reasonable "
    "market-based numbers. Never invent fake company names; if unsure, return fewer companies. "
    "Respond only with JSON matching the provided schema."
)


def _num(v):
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def generate_ai_companies(db: Session, hs: str, item_name: str, candidate_countries: list[str]) -> int:
    """해당 HS의 AI 공급사 후보를 생성해 companies 에 저장한다. 저장한 수를 반환."""
    try:
        from supplyguard_sgri.gemini_json_client import GeminiInteractionsJsonClient
        client = GeminiInteractionsJsonClient(timeout_seconds=45)
        payload = {
            "hs_code": hs,
            "item_name": item_name or f"HS {hs}",
            "candidate_countries": candidate_countries[:12],
        }
        result, _ = client.generate(
            payload,
            system_prompt=_SYSTEM,
            schema=_SCHEMA,
            schema_name="company_candidates",
            model="gemini-3.6-flash",
            reasoning_effort="low",
            max_output_tokens=2000,
        )
    except Exception:  # noqa: BLE001 - 키없음/429/타임아웃 등은 폴백 실패로 간주
        return 0

    companies = result.get("companies") if isinstance(result, dict) else None
    if not companies:
        return 0

    inserted = 0
    for c in companies:
        if not isinstance(c, dict):
            continue
        name = (c.get("name") or "").strip()
        cc = (c.get("country_code") or "").strip().upper()[:2]
        if not name or len(cc) != 2:
            continue
        try:
            with db.begin_nested():
                db.execute(text(
                    "INSERT INTO companies "
                    "  (name, name_en, country_code, company_type, hs_codes, certifications, "
                    "   website, status, data_source, unit_price, lead_time_days, "
                    "   on_time_delivery_rate, defect_rate_pct) "
                    "SELECT :name, :name_en, :cc, 'supplier', CAST(:hs AS jsonb), CAST(:certs AS jsonb), "
                    "   :web, 'active', 'ai:gemini', :price, :lead, :otd, :defect "
                    "WHERE NOT EXISTS (SELECT 1 FROM companies WHERE name = :name)"
                ), {
                    "name": name,
                    "name_en": c.get("name_en"),
                    "cc": cc,
                    "hs": json.dumps([hs]),
                    "certs": json.dumps([str(x) for x in (c.get("certifications") or [])]),
                    "web": c.get("website"),
                    "price": _num(c.get("unit_price")),
                    "lead": int(_num(c.get("lead_time_days"))) if _num(c.get("lead_time_days")) is not None else None,
                    "otd": _num(c.get("on_time_delivery_rate")),
                    "defect": _num(c.get("defect_rate_pct")),
                })
            inserted += 1
        except Exception:  # noqa: BLE001 - 개별 회사 저장 실패는 건너뜀(savepoint 롤백)
            pass

    db.commit()
    return inserted
