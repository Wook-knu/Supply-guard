-- ============================================================================
-- 국가×품목 병합 (README TODO 해결의 MVP 버전)
--
-- 대상 품목: 283691 (리튬 탄산염)
-- 규칙:
--   후보국 = Comtrade 상 KR이 이 품목을 실제 수입하는 상대국(partner)
--   각 후보국 행(country, 283691)에:
--     score_p, score_l = 그 국가의 국가단위 행(hs=NULL)에서 가져옴 (WGI/GDACS·PortWatch)
--     score_c          = 이 품목의 HHI(집중도) — 후보국 공통(시장 취약성)
--   (S·V·E 는 데이터 확보 후 같은 방식으로 확장)
--
-- 실행 순서: calc_policy_risk → calc_hhi_concentration → calc_logistics_risk
--            → (이 파일) → calc_sgri
-- ============================================================================

-- 기존 품목 행 제거(데모 값 포함) 후 실데이터로 재생성
DELETE FROM country_risk_scores WHERE hs_code = '283691';

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_p, score_l, score_c, score_v, score_e, sgri_score)
-- ※ 국가단위 행(hs=NULL)은 NULL 유니크 특성상 P행·L행이 분리 저장됨
--   → GROUP BY 국가 + MAX 로 P·L을 한 행으로 합친다.
SELECT
    cl.country_code,
    '283691'          AS hs_code,
    DATE '2024-01-01' AS as_of_date,
    MAX(cl.score_p)   AS score_p,     -- 국가단위 P (WGI)
    MAX(cl.score_l)   AS score_l,     -- 국가단위 L (GDACS/PortWatch)
    MAX(ic.score_c)   AS score_c,     -- 품목단위 C (HHI), 후보국 공통
    MAX(vv.score_v)   AS score_v,     -- 품목단위 V (원자재가+환율 변동성), 후보국 공통
    MAX(ee.score_e)   AS score_e,     -- 품목단위 E (LCI 배출계수), 후보국 공통
    0                 AS sgri_score
FROM country_risk_scores cl
JOIN (
    -- 후보국: KR이 이 품목을 실제 수입하는 상대국들
    SELECT DISTINCT partner_code
    FROM comtrade_trade_flows
    WHERE hs_code = '283691' AND flow_code = 'M' AND partner_code IS NOT NULL
) part ON part.partner_code = cl.country_code
LEFT JOIN LATERAL (
    SELECT ROUND(hhi * 100, 3) AS score_c
    FROM supplier_concentration
    WHERE importer_code = 'KR' AND hs_code = '283691'
    ORDER BY period DESC LIMIT 1
) ic ON TRUE
LEFT JOIN LATERAL (
    -- V = FRED(원자재가지수) CV 와 ECOS(원/달러) CV 의 평균 → 0~100 (상한 100)
    WITH fred_cv AS (
        SELECT STDDEV_SAMP(value) / NULLIF(AVG(value), 0) AS cv
        FROM fred_observations
        WHERE series_id = 'PALLFNFINDEXM' AND value IS NOT NULL
          AND obs_date >= (CURRENT_DATE - INTERVAL '24 months')
    ),
    ecos_cv AS (
        SELECT STDDEV_SAMP(value) / NULLIF(AVG(value), 0) AS cv
        FROM ecos_observations
        WHERE stat_code = '731Y001' AND value IS NOT NULL
    )
    SELECT LEAST(ROUND(
        ( 100 * COALESCE((SELECT cv FROM fred_cv), 0)
        + 100 * COALESCE((SELECT cv FROM ecos_cv), 0) )
        / NULLIF(
          ( CASE WHEN (SELECT cv FROM fred_cv) IS NOT NULL THEN 1 ELSE 0 END
          + CASE WHEN (SELECT cv FROM ecos_cv) IS NOT NULL THEN 1 ELSE 0 END ), 0)
    , 3), 100) AS score_v
) vv ON TRUE
LEFT JOIN LATERAL (
    -- E = LCI 배출계수(kgCO2e/kg) → 0~100 (참고 상한 20 기준). CBAM 비대상이라 LCI 사용.
    SELECT LEAST(ROUND(AVG(emission_factor) / 20.0 * 100, 3), 100) AS score_e
    FROM lci_emission_factors
    WHERE hs_code = '283691' AND emission_factor IS NOT NULL
) ee ON TRUE
WHERE cl.hs_code IS NULL   -- 국가단위(P·L) 행에서만 가져옴
GROUP BY cl.country_code;
