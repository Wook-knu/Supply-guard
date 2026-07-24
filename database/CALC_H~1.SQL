-- ============================================================================
-- HHI(허핀달-허쉬만 지수) 기반 공급처 집중도(C) 계산
--
-- 입력: comtrade_trade_flows (수입 flow_code='M', 국가별 partner_code)
-- 출력: supplier_concentration 테이블
--
-- HHI = Σ(sᵢ²),  sᵢ = 특정 공급국 수입액 / 전체 수입액 (0~1)
--   - 1에 가까울수록 소수 국가 의존 → 집중도 高 → 위험 高
--   - 예: 한 나라서 100% 수입 → HHI=1.0 / 10개국 균등 → HHI=0.1
-- ============================================================================

INSERT INTO supplier_concentration
    (importer_code, hs_code, period, hhi,
     top_supplier_code, top_supplier_share, num_suppliers)
WITH imports AS (
    -- 수입국×품목×기간×공급국별 수입액 합계
    SELECT
        reporter_code       AS importer_code,
        hs_code,
        period,
        partner_code,
        SUM(trade_value_usd) AS partner_value
    FROM comtrade_trade_flows
    WHERE flow_code = 'M'                 -- 수입만
      AND partner_code IS NOT NULL        -- World 합계행 제외
      AND trade_value_usd > 0
    GROUP BY reporter_code, hs_code, period, partner_code
),
totals AS (
    -- 그룹별 전체 수입액 + 공급국 수
    SELECT importer_code, hs_code, period,
           SUM(partner_value) AS total_value,
           COUNT(*)           AS num_suppliers
    FROM imports
    GROUP BY importer_code, hs_code, period
),
shares AS (
    -- 공급국별 비중(share) 계산
    SELECT i.importer_code, i.hs_code, i.period, i.partner_code,
           i.partner_value / t.total_value AS share,
           t.num_suppliers
    FROM imports i
    JOIN totals t USING (importer_code, hs_code, period)
)
SELECT
    importer_code,
    hs_code,
    period,
    ROUND(SUM(share * share), 4)                                  AS hhi,
    (ARRAY_AGG(partner_code ORDER BY share DESC))[1]              AS top_supplier_code,
    ROUND(MAX(share) * 100, 3)                                    AS top_supplier_share, -- %
    MAX(num_suppliers)                                            AS num_suppliers
FROM shares
GROUP BY importer_code, hs_code, period
ON CONFLICT (importer_code, hs_code, period) DO UPDATE SET
    hhi                = EXCLUDED.hhi,
    top_supplier_code  = EXCLUDED.top_supplier_code,
    top_supplier_share = EXCLUDED.top_supplier_share,
    num_suppliers      = EXCLUDED.num_suppliers;


-- ============================================================================
-- (참고) 특정 품목/기간만 계산하려면 위 imports CTE의 WHERE에 조건 추가:
--   AND hs_code = '020230' AND period = '2023'
-- ============================================================================

-- ── 결과 확인용 조회 ──────────────────────────────────────────────────────
-- SELECT sc.hs_code, h.name_ko, sc.period,
--        sc.hhi, c.name_ko AS 최대공급국, sc.top_supplier_share AS 최대비중_pct,
--        sc.num_suppliers AS 공급국수
-- FROM supplier_concentration sc
-- JOIN hs_codes  h ON h.hs_code = sc.hs_code
-- JOIN countries c ON c.country_code = sc.top_supplier_code
-- ORDER BY sc.hhi DESC;

-- ── C 점수(0~100)로 정규화해서 country_risk_scores 에 반영하는 예시 ──────────
-- HHI(0~1)를 그대로 100배 하면 C 점수. (정규화 방식은 팀 결정에 따라 교체)
--   score_c = ROUND(hhi * 100, 3)
