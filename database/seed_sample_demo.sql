-- ============================================================================
-- 데모/개발용 샘플 데이터 (진짜 API 데이터가 없을 때 화면·엔드포인트 확인용)
-- 리튬 탄산염(HS 283691)에 대한 국가별 SGRI 예시 3건.
-- 실행: psql -U postgres -d supplyguard -f database/seed_sample_demo.sql
-- ※ 실제 배치(calc_sgri.sql)가 돌면 이 값들은 대체됨. 어디까지나 임시 데모용.
-- ============================================================================

INSERT INTO country_risk_scores
    (country_code, hs_code, as_of_date, score_s, score_c, score_v, score_l, score_p, score_e, sgri_score)
VALUES
    ('CL', '283691', DATE '2025-07-01', 55, 60, 48, 70, 38, 52, 58.9),  -- 칠레
    ('CN', '283691', DATE '2025-07-01', 62, 80, 55, 40, 68, 60, 72.0),  -- 중국
    ('AU', '283691', DATE '2025-07-01', 40, 45, 42, 35, 20, 48, 41.0)   -- 호주
ON CONFLICT (country_code, hs_code, as_of_date) DO UPDATE SET
    sgri_score = EXCLUDED.sgri_score;
