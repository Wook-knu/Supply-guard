-- ============================================================================
-- L(물류 리스크) 계산 - 항만 물동량 변동성(PortWatch) + 재난(GDACS)
--
-- 입력: portwatch_country_stats (국가별 항만 기항 CV), gdacs_alerts
-- 출력: country_risk_scores.score_l (국가 단위, hs_code=NULL)
--
-- 구성:
--   항만 리스크 = 항만 물동량 변동성(CV) → 0~100 (CV 2.0 이상을 100으로 캡)
--                변동성 클수록 물류 처리 불안정 → 리스크 高
--   재난 리스크 = 최근 6개월 재난 경보 심각도 (Red=3/Orange=2/Green=1) 국가 간 정규화
--   → 둘 다 있으면 항만 0.6 + 재난 0.4, 하나만 있으면 그 값 사용
-- ============================================================================

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_l, sgri_score)
WITH pctl AS (
    -- 아웃라이어 압축 방지: CV의 p10~p90을 0~100 앵커로 사용(윈저화)
    SELECT percentile_cont(0.1) WITHIN GROUP (ORDER BY cv) AS p10,
           percentile_cont(0.9) WITHIN GROUP (ORDER BY cv) AS p90
    FROM portwatch_country_stats
),
port AS (
    -- 항만 물동량 변동성(CV) → 리스크 점수. 실 공개데이터(IMF PortWatch)
    SELECT s.country_code,
           GREATEST(0, LEAST(100,
               ROUND((100.0 * (s.cv - p.p10) / NULLIF(p.p90 - p.p10, 0))::numeric, 3))) AS port_score
    FROM portwatch_country_stats s, pctl p
),
disaster AS (
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
dnorm AS (
    SELECT country_code,
           CASE WHEN (SELECT MAX(disaster_raw) FROM disaster) > 0
                THEN 100.0 * disaster_raw / (SELECT MAX(disaster_raw) FROM disaster)
                ELSE 0 END AS disaster_score
    FROM disaster
),
merged AS (
    SELECT COALESCE(p.country_code, d.country_code) AS country_code,
           p.port_score, d.disaster_score
    FROM port p
    FULL OUTER JOIN dnorm d ON p.country_code = d.country_code
)
SELECT
    country_code,
    NULL::varchar        AS hs_code,          -- 국가 단위 지표(품목 무관)
    DATE '2024-01-01'    AS as_of_date,
    CASE
        WHEN port_score IS NOT NULL AND disaster_score IS NOT NULL
            THEN ROUND(port_score * 0.6 + disaster_score * 0.4, 3)
        WHEN port_score IS NOT NULL THEN port_score
        ELSE ROUND(disaster_score, 3)
    END                  AS score_l,
    0                    AS sgri_score
FROM merged
ON CONFLICT (country_code, as_of_date) WHERE hs_code IS NULL
DO UPDATE SET score_l = EXCLUDED.score_l;
