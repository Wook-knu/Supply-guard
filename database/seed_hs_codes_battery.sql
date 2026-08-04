-- ============================================================================
-- 배터리 소재 HS코드 계층 등록 (4단위/6단위)
--   283691 탄산리튬은 seed_hs_codes.sql 에 이미 존재 → 여기서는 나머지 2건 추가
--   country_risk_scores.hs_code 의 FK 제약 때문에 반드시 선행 실행 필요.
-- 실행: psql -U postgres -d supplyguard -f database/seed_hs_codes_battery.sql
-- ※ 선행: seed_hs_codes.sql (2단위 챕터 28 이 있어야 함)
-- ============================================================================
INSERT INTO hs_codes (hs_code, hs_level, parent_hs_code, name_ko, name_en) VALUES
  ('2825',  4,'28',  '히드라진·금속 산화물류','Hydrazine, metal oxides/hydroxides nes'),
  ('282520',6,'2825','산화리튬·수산화리튬','Lithium oxide and hydroxide'),
  ('2822',  4,'28',  '코발트 산화물·수산화물','Cobalt oxides and hydroxides'),
  ('282200',6,'2822','산화코발트·수산화코발트','Cobalt oxides and hydroxides; commercial cobalt oxides')
ON CONFLICT (hs_code) DO NOTHING;
