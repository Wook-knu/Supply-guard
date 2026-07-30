"""
품목 SGRI 파이프라인 (일반화) — 임의의 HS 코드에 대해 SGRI를 구축한다.

동작: Comtrade 다년치 수집 → HHI(C)·병합(P·L·C·V·E)·수급(S)·종합 SGRI 계산.
  · P·L : 국가단위 (이미 계산돼 있다고 가정 — 전 품목 공통)
  · C·S : comtrade 기반, 해당 품목
  · V   : FRED 원자재지수 + ECOS 환율 (품목 무관 프록시)
  · E   : LCI 배출계수 (있으면), 없으면 NULL

※ calc_merge_item.sql(283691 하드코딩)을 파라미터(%(hs)s)로 일반화한 버전.
"""
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import engine

# database/ 를 import 경로에 추가하고 그쪽 .env(Comtrade 키·DB) 로드
_DB_DIR = Path(__file__).resolve().parents[3] / "database"
if str(_DB_DIR) not in sys.path:
    sys.path.insert(0, str(_DB_DIR))
load_dotenv(_DB_DIR / ".env")

# 품목 무관 재계산 파일 (comtrade에 있는 모든 품목 대상)
_CALC_C = "calc_hhi_concentration.sql"      # C: supplier_concentration
_CALC_S = "calc_supply_instability.sql"     # S: score_s
# 종합 SGRI는 calc_sgri.sql(고정 가중치) 대신 제미나이 가중치(weighting_ai)로 계산

# 국가×품목 병합 (calc_merge_item.sql 파라미터화). %(hs)s 로 임의 품목 지원.
_MERGE_SQL = """
DELETE FROM country_risk_scores WHERE hs_code = %(hs)s;

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_p, score_l, score_c, score_v, score_e, sgri_score)
SELECT
    cl.country_code, %(hs)s, DATE '2024-01-01',
    MAX(cl.score_p), MAX(cl.score_l), MAX(ic.score_c), MAX(vv.score_v), MAX(ee.score_e), 0
FROM country_risk_scores cl
JOIN (
    SELECT DISTINCT partner_code FROM comtrade_trade_flows
    WHERE hs_code = %(hs)s AND flow_code = 'M' AND partner_code IS NOT NULL
) part ON part.partner_code = cl.country_code
LEFT JOIN LATERAL (
    SELECT ROUND(hhi * 100, 3) AS score_c FROM supplier_concentration
    WHERE importer_code = 'KR' AND hs_code = %(hs)s ORDER BY period DESC LIMIT 1
) ic ON TRUE
LEFT JOIN LATERAL (
    WITH fred_cv AS (
        SELECT STDDEV_SAMP(value) / NULLIF(AVG(value), 0) AS cv FROM fred_observations
        WHERE series_id = 'PALLFNFINDEXM' AND value IS NOT NULL
          AND obs_date >= (CURRENT_DATE - INTERVAL '24 months')),
    ecos_cv AS (
        SELECT STDDEV_SAMP(value) / NULLIF(AVG(value), 0) AS cv FROM ecos_observations
        WHERE stat_code = '731Y001' AND value IS NOT NULL)
    SELECT LEAST(ROUND(
        (100 * COALESCE((SELECT cv FROM fred_cv), 0) + 100 * COALESCE((SELECT cv FROM ecos_cv), 0))
        / NULLIF((CASE WHEN (SELECT cv FROM fred_cv) IS NOT NULL THEN 1 ELSE 0 END
                + CASE WHEN (SELECT cv FROM ecos_cv) IS NOT NULL THEN 1 ELSE 0 END), 0), 3), 100) AS score_v
) vv ON TRUE
LEFT JOIN LATERAL (
    SELECT LEAST(ROUND(AVG(emission_factor) / 20.0 * 100, 3), 100) AS score_e
    FROM lci_emission_factors WHERE hs_code = %(hs)s AND emission_factor IS NOT NULL
) ee ON TRUE
WHERE cl.hs_code IS NULL
GROUP BY cl.country_code;
"""


def build_item_sgri(db: Session, hs_code: str) -> dict:
    """임의 HS 코드에 대해 Comtrade 수집 + SGRI 계산. 계산된 국가 수를 반환."""
    hs = "".join(ch for ch in str(hs_code) if ch.isdigit())
    if len(hs) < 2:
        return {"hs_code": hs_code, "error": "invalid hs_code"}

    # 1) Comtrade 다년치 수집 (S 변동성 계산용)
    from ingest import comtrade  # database/ingest/comtrade
    ingested = 0
    for yr in ("2019", "2020", "2021", "2022", "2023"):
        try:
            comtrade.run("410", yr, hs, "M")
            ingested += 1
        except Exception:  # noqa: BLE001 - 일부 연도 실패해도 계속
            pass

    # 2) 지표 계산(공식/SQL): C → 병합(P·L·C·V·E) → S
    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute("SET client_encoding TO 'UTF8'")
        cur.execute((_DB_DIR / _CALC_C).read_text(encoding="utf-8"))
        cur.execute(_MERGE_SQL, {"hs": hs})
        cur.execute((_DB_DIR / _CALC_S).read_text(encoding="utf-8"))
        raw.commit()
    finally:
        raw.close()

    # 3) 종합 SGRI: 제미나이 가중치(AI_Model) + Python 검증으로 가중합
    from app.services.weighting_ai import apply_gemini_sgri
    weighting = apply_gemini_sgri(db, hs)

    return {
        "hs_code": hs,
        "comtrade_years_ingested": ingested,
        "countries": weighting.get("countries", 0),
        "uses_llm": weighting.get("uses_llm"),
        "weights": weighting.get("weights"),
    }
