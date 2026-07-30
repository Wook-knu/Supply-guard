-- ============================================================================
-- S(수급 불안정성) 계산 - 품목별 월간 수입 추세의 변동성
--
-- 입력: s_source_monthly 뷰
--       (현재 = comtrade_trade_flows 의 World 합계행 / 관세청 승인 후 = 관세청 실적)
-- 출력: country_risk_scores.score_s (품목 단위 → 후보국 공통 적용)
--
-- 방법: 품목별 월간 수입액의 변동계수(CV)
--   CV = 표준편차 / 평균
--   → CV 클수록 수급 불안정 → S 위험 高
--   → 품목 간 min-max 정규화로 0~100 변환
--
-- ▶ 변경점 (관세청 API 대체에 따른 정정)
--   이전 버전은 S 를 "공급국×품목" 단위로 계산했으나, 이는 C(집중도)와 성격이 겹치고
--   calc_sgri.sql 하단 주석("품목 단위 : S·C·V") 및 calc_merge_item.sql 의 설계
--   ("score_c ... 후보국 공통(시장 취약성)")와도 어긋났다.
--   S 는 원래 관세청 품목별 실적(국가 구분 없음)으로 산출하기로 한 지표이므로
--   품목 단위로 바로잡고, V·E 와 동일하게 모든 후보국에 공통 적용한다.
--   → 국가별로 갈리는 위험은 C(집중도)·L(물류)·P(정책)이 담당한다.
--
-- ※ 단일 품목만 다루는 MVP 단계에서는 calc_merge_item.sql 이 S 를 직접 계산하므로
--   이 파일은 다품목으로 확장할 때 쓴다. (두 파일의 CV 계산식은 동일)
-- ============================================================================

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_s, sgri_score)
WITH supply AS (
    -- 품목별 월간 통계 (기간이 2개 이상이어야 변동성 계산 가능)
    SELECT
        hs_code,
        STDDEV_SAMP(import_value) AS sd,
        AVG(import_value)         AS mean_val,
        COUNT(*)                  AS n_periods
    FROM s_source_monthly
    GROUP BY hs_code
    HAVING COUNT(*) >= 2 AND AVG(import_value) > 0
),
cv AS (
    SELECT hs_code, sd / mean_val AS cv FROM supply
),
norm AS (
    -- 품목 간 상대 비교 (min-max)
    SELECT hs_code, cv,
           MIN(cv) OVER () AS cv_min,
           MAX(cv) OVER () AS cv_max
    FROM cv
)
SELECT
    c.country_code,                            -- 품목 단위 지표 → 모든 후보국 동일
    n.hs_code,
    DATE '2024-01-01'                AS as_of_date,   -- 산출 기준일(교체)
    CASE WHEN n.cv_max = n.cv_min THEN 50      -- 비교 대상 품목이 1개뿐이면 중립(50)
         ELSE ROUND(100 * (n.cv - n.cv_min) / (n.cv_max - n.cv_min), 3)
    END                              AS score_s,
    0                                AS sgri_score    -- SGRI 는 이후 단계에서
FROM norm n, countries c            -- 콤마 조인 = CROSS JOIN (V·E 와 동일 패턴)
ON CONFLICT (country_code, hs_code, as_of_date)
DO UPDATE SET score_s = EXCLUDED.score_s;

-- 확인: SELECT DISTINCT hs_code, score_s FROM country_risk_scores
--       WHERE score_s IS NOT NULL ORDER BY score_s DESC;
