-- ============================================================================
-- P(국가·정책 리스크) 계산 - World Bank WGI (+ GDELT 보조)
--
-- 입력: worldbank_wgi (6개 거버넌스 지표, estimate -2.5~2.5)
-- 출력: country_risk_scores.score_p (국가 단위)
--
-- 방법: 국가별 최신연도 6개 지표 평균 → 위험 점수로 반전·정규화
--   거버넌스 estimate 높을수록(=좋을수록) 위험 낮음
--   score_p = (2.5 - 평균estimate) / 5 * 100   → 0(안전)~100(위험)
-- ============================================================================

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_p, sgri_score)
WITH latest AS (
    -- 국가·지표별 최신연도 값
    SELECT DISTINCT ON (country_code, indicator_code)
           country_code, indicator_code, estimate
    FROM worldbank_wgi
    WHERE estimate IS NOT NULL
    ORDER BY country_code, indicator_code, year DESC
),
avg_gov AS (
    SELECT country_code, AVG(estimate) AS avg_est
    FROM latest
    GROUP BY country_code
)
SELECT
    country_code,
    NULL::varchar     AS hs_code,             -- 국가 단위
    DATE '2024-01-01' AS as_of_date,
    -- estimate 범위(-2.5~2.5)를 위험(0~100)으로 반전. 범위 밖은 clamp.
    ROUND(GREATEST(0, LEAST(100, (2.5 - avg_est) / 5.0 * 100)), 3) AS score_p,
    0                 AS sgri_score
FROM avg_gov
ON CONFLICT (country_code, as_of_date) WHERE hs_code IS NULL
DO UPDATE SET score_p = EXCLUDED.score_p;

-- ============================================================================
-- (참고) GDELT 뉴스 톤으로 P 보강:
--   국가별 최근 avg_tone(음수=부정) 을 0~100 위험점수로 변환해
--   WGI 점수와 가중평균. 예) tone_risk = (0 - avg_tone) 를 스케일링.
-- ============================================================================
