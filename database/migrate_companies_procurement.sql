-- ============================================================================
-- companies 테이블에 조달/추천용 컬럼 추가 (AI 추천 정교화)
-- AI_Model candidate 스키마의 unit_price·available_quantity·lead_time·
-- on_time_delivery_rate·defect_rate_pct 를 실제로 넘겨주기 위함.
-- 재실행 안전(IF NOT EXISTS).
--   psql -U postgres -d supplyguard -f database/migrate_companies_procurement.sql
-- ============================================================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS unit_price            NUMERIC(18,4);  -- 단위당 단가(USD)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS available_quantity    NUMERIC(20,2);  -- 공급 가능 수량
ALTER TABLE companies ADD COLUMN IF NOT EXISTS lead_time_days        INTEGER;         -- 리드타임(일)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS on_time_delivery_rate NUMERIC(5,2);    -- 정시 납품률(%)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS defect_rate_pct       NUMERIC(5,2);    -- 불량률(%)
