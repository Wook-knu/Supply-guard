-- ============================================================================
-- E(ESG·탄소규제 리스크) 계산 - EU CBAM 배출 기본값 (+ LCI 보조)
--
-- 입력: cbam_emission_defaults (CN코드 → HS6 매핑, 직접+간접 배출)
-- 출력: country_risk_scores.score_e (품목 단위 → 후보국 공통)
--
-- 방법: 품목별 총 배출집약도(직접+간접) → 품목 간 min-max 정규화(0~100)
--   배출 클수록 탄소세(CBAM) 부담 高 → E 위험 高
-- ============================================================================

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_e, sgri_score)
WITH emission AS (
    -- HS6별 총 배출집약도 (같은 HS에 여러 CN이면 평균)
    SELECT hs_code,
           AVG(COALESCE(direct_emission,0) + COALESCE(indirect_emiss,0)) AS total_emission
    FROM cbam_emission_defaults
    WHERE hs_code IS NOT NULL
    GROUP BY hs_code
),
norm AS (
    SELECT hs_code, total_emission,
           MIN(total_emission) OVER () AS e_min,
           MAX(total_emission) OVER () AS e_max
    FROM emission
)
SELECT
    c.country_code,                            -- 품목 단위 → 모든 후보국 동일
    n.hs_code,
    DATE '2024-01-01' AS as_of_date,
    CASE WHEN n.e_max = n.e_min THEN 50
         ELSE ROUND(100 * (n.total_emission - n.e_min) / (n.e_max - n.e_min), 3)
    END               AS score_e,
    0                 AS sgri_score
FROM norm n, countries c
ON CONFLICT (country_code, hs_code, as_of_date)
DO UPDATE SET score_e = EXCLUDED.score_e;

-- ============================================================================
-- (참고) 환경부 LCI 배출계수로 E 보강:
--   lci_emission_factors 를 HS 매핑해 CBAM 미포함 품목의 배출집약도 보완.
-- ============================================================================
