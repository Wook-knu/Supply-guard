-- ============================================================================
-- Comtrade World 합계행(partner_code=NULL) UPSERT 보장
--
-- 문제: migrate_country_rows_unique.sql 과 동일한 원인.
--   comtrade_trade_flows 의 UNIQUE (period, reporter_code, partner_code,
--   flow_code, hs_code) 는 partner_code 가 NULL 이면 걸리지 않는다
--   (PostgreSQL 은 NULL 을 서로 다른 값으로 취급).
--   → S 지표용 World 합계행을 재적재할 때마다 행이 중복 누적된다.
--
-- 해결: 기존 방식(부분 유니크 인덱스)과 동일하게 처리.
--   ingest/comtrade.py 의 run_world() 가 이 인덱스에 맞춰
--   ON CONFLICT (...) WHERE partner_code IS NULL 로 UPSERT 한다.
--
-- 재실행 안전.
-- ============================================================================
BEGIN;

-- 이미 중복 적재된 World 행이 있으면 최신 1건만 남긴다
DELETE FROM comtrade_trade_flows a
USING comtrade_trade_flows b
WHERE a.partner_code IS NULL
  AND b.partner_code IS NULL
  AND a.period        = b.period
  AND a.reporter_code = b.reporter_code
  AND a.flow_code     = b.flow_code
  AND a.hs_code       = b.hs_code
  AND a.id < b.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_comtrade_world_null_partner
    ON comtrade_trade_flows (period, reporter_code, flow_code, hs_code)
    WHERE partner_code IS NULL;

COMMIT;
