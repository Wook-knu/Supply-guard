-- ============================================================================
-- SGRI(공급망 위험지수) 가중합 계산
--
-- 6개 지표(0~100)를 가중합해 종합 SGRI(0~100) 산출.
--   SGRI = Σ(wᵢ × scoreᵢ) / Σ(wᵢ)   ← 사용 가능한 지표의 가중치만 분모에 포함
--   → 아직 수집 안 된 지표(NULL)가 있어도 점수가 왜곡되지 않음
--
-- 전제: country_risk_scores 에 (country_code, hs_code, as_of_date) 행과
--       각 지표 점수(score_s ~ score_e)가 이미 채워져 있어야 함.
--       (지표별 정규화·적재는 각 지표 계산 단계에서 수행 — 하단 참고)
--
-- ▶ 가중치는 아래 weights CTE 에서 수정 (팀 결정 사항). 합이 1이 아니어도 됨.
-- ============================================================================

WITH weights AS (
    SELECT
        0.20::numeric AS w_s,   -- 수급 불안정성
        0.20::numeric AS w_c,   -- 공급처 집중도
        0.15::numeric AS w_v,   -- 가격 변동성
        0.15::numeric AS w_l,   -- 물류 리스크
        0.15::numeric AS w_p,   -- 국가·정책 리스크
        0.15::numeric AS w_e    -- ESG·탄소규제
)
UPDATE country_risk_scores crs
SET
    sgri_score = ROUND(
        ( COALESCE(crs.score_s * w.w_s, 0)
        + COALESCE(crs.score_c * w.w_c, 0)
        + COALESCE(crs.score_v * w.w_v, 0)
        + COALESCE(crs.score_l * w.w_l, 0)
        + COALESCE(crs.score_p * w.w_p, 0)
        + COALESCE(crs.score_e * w.w_e, 0) )
        / NULLIF(
          ( CASE WHEN crs.score_s IS NOT NULL THEN w.w_s ELSE 0 END
          + CASE WHEN crs.score_c IS NOT NULL THEN w.w_c ELSE 0 END
          + CASE WHEN crs.score_v IS NOT NULL THEN w.w_v ELSE 0 END
          + CASE WHEN crs.score_l IS NOT NULL THEN w.w_l ELSE 0 END
          + CASE WHEN crs.score_p IS NOT NULL THEN w.w_p ELSE 0 END
          + CASE WHEN crs.score_e IS NOT NULL THEN w.w_e ELSE 0 END ), 0)
    , 3),
    weights_json = jsonb_build_object(
        's', w.w_s, 'c', w.w_c, 'v', w.w_v,
        'l', w.w_l, 'p', w.w_p, 'e', w.w_e)
FROM weights w;


-- ============================================================================
-- (참고 1) 지표 점수는 country_risk_scores 에 어떻게 채우나
--   각 지표를 0~100으로 정규화해 UPSERT. 예시는 C(집중도)만 — 나머지는 TODO.
--   ※ 지표 성격 주의(팀 논의 필요):
--     · 국가 단위 : P(정책)·L(물류)·E(탄소)  → 후보 조달국마다 다름
--     · 품목 단위 : S(수급)·C(집중)·V(가격)  → 후보국 공통(시장 취약성)
-- ============================================================================

-- 예) C 점수 채우기: supplier_concentration.hhi(0~1) → 0~100
-- INSERT INTO country_risk_scores (country_code, hs_code, as_of_date, score_c, sgri_score)
-- SELECT c.country_code, sc.hs_code, DATE '2024-01-01',
--        ROUND(sc.hhi * 100, 3) AS score_c, 0 AS sgri_score
-- FROM supplier_concentration sc
-- CROSS JOIN countries c            -- 품목 단위 지표라 모든 후보국에 동일 적용
-- WHERE sc.period = '2023'
-- ON CONFLICT (country_code, hs_code, as_of_date)
-- DO UPDATE SET score_c = EXCLUDED.score_c;


-- ============================================================================
-- (참고 2) 결과 확인 — 조달국 위험 순위(SGRI 낮을수록 안전)
-- ============================================================================
-- SELECT crs.hs_code, h.name_ko AS 품목, c.name_ko AS 조달국,
--        crs.score_s, crs.score_c, crs.score_v,
--        crs.score_l, crs.score_p, crs.score_e,
--        crs.sgri_score
-- FROM country_risk_scores crs
-- JOIN countries c ON c.country_code = crs.country_code
-- JOIN hs_codes  h ON h.hs_code = crs.hs_code
-- WHERE crs.hs_code = '020230' AND crs.as_of_date = DATE '2024-01-01'
-- ORDER BY crs.sgri_score ASC;
