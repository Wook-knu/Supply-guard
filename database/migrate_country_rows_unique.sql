-- ============================================================================
-- 국가단위(hs_code=NULL) 행 중복 정리 + 부분 유니크 인덱스
--
-- 문제: PostgreSQL은 NULL을 서로 다르게 취급 → (country_code, hs_code, as_of_date)
--   유니크 제약이 hs_code=NULL 행에는 안 먹어, P·L 계산이 UPSERT 못하고 중복 누적.
-- 해결: 국가별 지표를 한 행으로 통합 후, 부분 유니크 인덱스로 이후 UPSERT 보장.
-- (calc_policy_risk.sql / calc_logistics_risk.sql 의 ON CONFLICT 를 이 인덱스로 교정)
-- 재실행 안전.
-- ============================================================================
BEGIN;

CREATE TEMP TABLE _crs_country AS
SELECT country_code,
       MAX(score_s) AS score_s, MAX(score_c) AS score_c, MAX(score_v) AS score_v,
       MAX(score_l) AS score_l, MAX(score_p) AS score_p, MAX(score_e) AS score_e
FROM country_risk_scores
WHERE hs_code IS NULL
GROUP BY country_code;

DELETE FROM country_risk_scores WHERE hs_code IS NULL;

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_s, score_c, score_v, score_l, score_p, score_e, sgri_score)
SELECT country_code, NULL, DATE '2024-01-01',
       score_s, score_c, score_v, score_l, score_p, score_e, 0
FROM _crs_country;

CREATE UNIQUE INDEX IF NOT EXISTS uq_crs_country_null_hs
    ON country_risk_scores (country_code, as_of_date)
    WHERE hs_code IS NULL;

COMMIT;
