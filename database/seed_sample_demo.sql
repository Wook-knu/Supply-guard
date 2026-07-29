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


-- ── 국가 추천 샘플 (procurement_recommendations) ──────────────────────────
-- FK 때문에 실제 존재하는 query_id가 필요 → 가장 최근에 만든 질의에 자동으로 붙인다.
-- (POST /queries 로 하나라도 만든 상태여야 들어감)
INSERT INTO procurement_recommendations
    (query_id, country_code, rank, sgri_score, fit_score, est_unit_price, tariff_percent, est_lead_days, rationale)
SELECT q.query_id, v.country_code, v.rank, v.sgri, v.fit, v.price, v.tariff, v.lead, v.rationale
FROM (SELECT query_id FROM user_queries ORDER BY query_id DESC LIMIT 1) q
CROSS JOIN (VALUES
    ('CL', 1::smallint, 58.9, 92.0, 18.5, 0.0,  25, '정치 안정 + 한-칠레 FTA 무관세, 세계 최대 리튬 생산국'),
    ('CN', 2::smallint, 72.0, 78.0, 17.8, 6.5,  30, '가격 경쟁력 높으나 공급 집중도·정책 리스크 큼'),
    ('AU', 3::smallint, 41.0, 85.0, 20.1, 0.0,  35, '거버넌스 안정적이나 단가 높고 리드타임 김')
) AS v(country_code, rank, sgri, fit, price, tariff, lead, rationale)
ON CONFLICT (query_id, country_code) DO UPDATE SET
    rank = EXCLUDED.rank, rationale = EXCLUDED.rationale;


-- ── 기업 샘플 (companies) ─────────────────────────────────────────────────
-- 이름 기준 중복 방지(NOT EXISTS)로 재실행해도 안전.
INSERT INTO companies (name, name_en, country_code, company_type, hs_codes, certifications, annual_capacity, capacity_unit, status)
SELECT v.name, v.name_en, v.cc, 'supplier', v.hs::jsonb, v.certs::jsonb, v.cap, 'ton/year', 'active'
FROM (VALUES
    ('SQM',              'SQM S.A.',         'CL', '["283691"]', '["ISO 9001","ISO 14001"]', 120000),
    ('Ganfeng Lithium',  'Ganfeng',          'CN', '["283691"]', '["ISO 9001"]',              90000),
    ('Pilbara Minerals', 'Pilbara Minerals', 'AU', '["283691"]', '["ISO 9001","ISO 14001"]', 60000)
) AS v(name, name_en, cc, hs, certs, cap)
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.name = v.name);

-- 조달 데이터 보강 (단가·수량·리드타임·정시율·불량률) — 추천 차등화용
-- ※ migrate_companies_procurement.sql 로 컬럼이 먼저 추가돼 있어야 함
UPDATE companies SET unit_price=18.5, available_quantity=120000, lead_time_days=25, on_time_delivery_rate=95, defect_rate_pct=0.8 WHERE name='SQM';
UPDATE companies SET unit_price=17.8, available_quantity=90000,  lead_time_days=30, on_time_delivery_rate=88, defect_rate_pct=1.5 WHERE name='Ganfeng Lithium';
UPDATE companies SET unit_price=20.1, available_quantity=60000,  lead_time_days=35, on_time_delivery_rate=97, defect_rate_pct=0.5 WHERE name='Pilbara Minerals';


-- ── 기업 추천 샘플 (supplier_recommendations) ─────────────────────────────
-- 가장 최근 질의 + 위 기업들을 이름으로 이어붙인다.
INSERT INTO supplier_recommendations
    (query_id, company_id, rank, fit_score, est_unit_price, est_lead_days, delivery_feasibility, rationale)
SELECT q.query_id, c.company_id, r.rank, r.fit, r.price, r.lead, r.feas, r.rationale
FROM (SELECT query_id FROM user_queries ORDER BY query_id DESC LIMIT 1) q
JOIN (VALUES
    ('SQM',              1::smallint, 92.0, 18.5, 25, '높음', 'ISO 9001/14001 + 세계 최대 리튬 생산, 한-칠레 FTA 무관세'),
    ('Ganfeng Lithium',  2::smallint, 84.0, 17.8, 30, '중간', '가격 경쟁력 최고이나 공급 집중도 리스크'),
    ('Pilbara Minerals', 3::smallint, 80.0, 20.1, 35, '중간', '거버넌스 안정적, 단가 높고 리드타임 김')
) AS r(cname, rank, fit, price, lead, feas, rationale) ON TRUE
JOIN companies c ON c.name = r.cname
ON CONFLICT (query_id, company_id) DO UPDATE SET
    rank = EXCLUDED.rank, rationale = EXCLUDED.rationale;


-- ── 위험 알림 샘플 (alerts) ───────────────────────────────────────────────
-- 가장 최근 질의에 붙인다. title 기준 중복 방지로 재실행 안전.
INSERT INTO alerts (query_id, country_code, hs_code, alert_type, severity, title, message, is_read)
SELECT q.query_id, v.cc, v.hs, v.atype, v.sev, v.title, v.msg, FALSE
FROM (SELECT query_id FROM user_queries ORDER BY query_id DESC LIMIT 1) q
JOIN (VALUES
    ('CL', '283691', '물류',   'high',   '칠레 발파라이소항 혼잡 심화',   '발파라이소항 혼잡지수 급등으로 리튬 선적 지연 가능. 납기 영향 검토 필요.'),
    ('CN', '283691', '정책',   'medium', '중국 리튬 수출 정책 변화 신호', '중국 정부의 리튬 관련 수출 규제 논의 보도. 대체 조달처 검토 권고.')
) AS v(cc, hs, atype, sev, title, msg) ON TRUE
WHERE NOT EXISTS (SELECT 1 FROM alerts a WHERE a.title = v.title);
