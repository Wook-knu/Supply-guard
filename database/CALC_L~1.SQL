-- ============================================================================
-- L(물류 리스크) 계산 - 재난(GDACS) + 항만 혼잡/차질(PortWatch)
--
-- 입력: gdacs_alerts, portwatch_port_activity
-- 출력: country_risk_scores.score_l (국가 단위)
--
-- 구성(각 0~100 정규화 후 평균):
--   재난 리스크  = 최근 재난 경보 심각도 합 (Red=3, Orange=2, Green=1 가중)
--   항만 리스크  = 최근 운항 차질(disruption) 비율 + 혼잡도
-- ============================================================================

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_l, sgri_score)
WITH disaster AS (
    -- 국가별 최근 6개월 재난 경보 가중 합
    SELECT country_code,
           SUM(CASE alert_level
                 WHEN 'Red' THEN 3 WHEN 'Orange' THEN 2 WHEN 'Green' THEN 1
                 ELSE 0 END) AS disaster_raw
    FROM gdacs_alerts
    WHERE country_code IS NOT NULL
      AND from_date >= (CURRENT_DATE - INTERVAL '6 months')
    GROUP BY country_code
),
port AS (
    -- 국가별 최근 3개월 항만 차질 비율(0~1)
    SELECT country_code,
           AVG(CASE WHEN disruption_flag THEN 1.0 ELSE 0.0 END) AS disruption_ratio
    FROM portwatch_port_activity
    WHERE country_code IS NOT NULL
      AND obs_date >= (CURRENT_DATE - INTERVAL '3 months')
    GROUP BY country_code
),
merged AS (
    SELECT COALESCE(d.country_code, p.country_code) AS country_code,
           d.disaster_raw, p.disruption_ratio
    FROM disaster d
    FULL OUTER JOIN port p ON d.country_code = p.country_code
),
norm AS (
    -- 재난 점수는 국가 간 min-max, 항만은 비율×100
    SELECT country_code,
           CASE WHEN (SELECT MAX(disaster_raw) FROM merged) > 0
                THEN 100.0 * COALESCE(disaster_raw,0)
                     / (SELECT MAX(disaster_raw) FROM merged)
                ELSE 0 END AS disaster_score,
           COALESCE(disruption_ratio,0) * 100 AS port_score
    FROM merged
)
SELECT
    country_code,
    NULL::varchar        AS hs_code,          -- 국가 단위 지표(품목 무관)
    DATE '2024-01-01'    AS as_of_date,
    ROUND((disaster_score + port_score) / 2.0, 3) AS score_l,
    0                    AS sgri_score
FROM norm
ON CONFLICT (country_code, hs_code, as_of_date)
DO UPDATE SET score_l = EXCLUDED.score_l;

-- ※ country_risk_scores 의 UNIQUE 는 (country_code, hs_code, as_of_date).
--   hs_code=NULL 인 국가 단위 행과, 품목별 행을 함께 쓰려면
--   SGRI 계산 시 두 행을 country_code 로 join 해 병합하는 규칙 필요(팀 결정).
