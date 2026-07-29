-- ============================================================================
-- S(수급 불안정성) 계산 - 공급국별 공급량 추세의 변동성
--
-- 입력: comtrade_trade_flows (수입 flow_code='M', 공급국 partner_code)
-- 출력: country_risk_scores.score_s (국가×품목 단위)
--
-- 방법: 공급국이 시간에 따라 얼마나 들쭉날쭉 공급하는지 = 변동계수(CV)
--   CV = 표준편차 / 평균   (기간별 수입액 기준)
--   → CV 클수록 공급 불안정 → S 위험 高
--   → 품목 내 국가 간 min-max 정규화로 0~100 변환
-- ============================================================================

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_s, sgri_score)
WITH supply AS (
    -- 공급국×품목별 기간 통계 (기간이 2개 이상이어야 변동성 계산 가능)
    SELECT
        partner_code,
        hs_code,
        STDDEV_SAMP(trade_value_usd) AS sd,
        AVG(trade_value_usd)         AS mean_val,
        COUNT(*)                     AS n_periods
    FROM comtrade_trade_flows
    WHERE flow_code = 'M'
      AND partner_code IS NOT NULL
      AND trade_value_usd > 0
    GROUP BY partner_code, hs_code
    HAVING COUNT(*) >= 2 AND AVG(trade_value_usd) > 0
),
cv AS (
    SELECT partner_code, hs_code, sd / mean_val AS cv FROM supply
),
norm AS (
    -- 같은 품목 안에서 국가 간 상대 비교 (min-max)
    SELECT partner_code, hs_code, cv,
           MIN(cv) OVER (PARTITION BY hs_code) AS cv_min,
           MAX(cv) OVER (PARTITION BY hs_code) AS cv_max
    FROM cv
)
SELECT
    partner_code                                   AS country_code,
    hs_code,
    DATE '2024-01-01'                              AS as_of_date,  -- 산출 기준일(교체)
    CASE WHEN cv_max = cv_min THEN 50              -- 비교 대상 1개뿐이면 중립(50)
         ELSE ROUND(100 * (cv - cv_min) / (cv_max - cv_min), 3)
    END                                            AS score_s,
    0                                              AS sgri_score   -- SGRI는 이후 단계에서
FROM norm
ON CONFLICT (country_code, hs_code, as_of_date)
DO UPDATE SET score_s = EXCLUDED.score_s;

-- 확인: SELECT country_code, hs_code, score_s FROM country_risk_scores
--       WHERE score_s IS NOT NULL ORDER BY score_s DESC;
