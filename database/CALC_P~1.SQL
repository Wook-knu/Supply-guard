-- ============================================================================
-- V(가격 변동성) 계산 - 원자재가/환율 시계열의 변동성
--
-- 입력: fred_observations + fred_series (품목 매핑된 가격 시계열)
-- 출력: country_risk_scores.score_v (품목 단위 → 후보국 공통 적용)
--
-- 방법: 최근 N개월 가격의 변동계수(CV)
--   CV = 표준편차 / 평균
--   → CV 클수록 가격 변동성 高 → V 위험 高
--   ※ ECOS(환율/수입물가)도 같은 방식으로 계산해 합산 가능(하단 참고)
-- ============================================================================

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_v, sgri_score)
WITH price AS (
    -- 품목별 최근 12개월 가격 통계
    SELECT
        s.hs_code,
        STDDEV_SAMP(o.value) AS sd,
        AVG(o.value)         AS mean_val,
        COUNT(*)             AS n_obs
    FROM fred_observations o
    JOIN fred_series s ON s.series_id = o.series_id
    WHERE s.hs_code IS NOT NULL
      AND o.value IS NOT NULL
      AND o.obs_date >= (CURRENT_DATE - INTERVAL '12 months')
    GROUP BY s.hs_code
    HAVING COUNT(*) >= 2 AND AVG(o.value) > 0
),
cv AS (
    SELECT hs_code, sd / mean_val AS cv FROM price
)
SELECT
    c.country_code,                                -- 품목 단위 지표 → 모든 후보국 동일
    cv.hs_code,
    DATE '2024-01-01'                AS as_of_date,
    LEAST(ROUND(cv.cv * 100, 3), 100) AS score_v,  -- CV(0~1+) → 0~100 (상한 100)
    0                                AS sgri_score
FROM cv, countries c              -- 콤마 조인 = CROSS JOIN (품목 지표를 전 후보국에 적용)
ON CONFLICT (country_code, hs_code, as_of_date)
DO UPDATE SET score_v = EXCLUDED.score_v;

-- ============================================================================
-- (참고) ECOS 환율/수입물가로 V 보강 시:
--   fred_observations → ecos_observations 로 바꾸고
--   JOIN 조건을 stat_code/item_code ↔ 품목 매핑 규칙으로 교체.
--   여러 소스를 쓰면 소스별 CV를 평균/가중합해 최종 score_v 로.
-- (정규화 방식 min-max vs 상한 cap 은 팀 결정에 따라 통일)
-- ============================================================================
