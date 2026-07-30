-- ============================================================================
-- PortWatch 국가별 항만 물동량 통계 테이블 (L 물류 리스크 소스)
-- ingest/portwatch.py 가 ISO3별 집계를 여기 UPSERT 한다.
-- ============================================================================
CREATE TABLE IF NOT EXISTS portwatch_country_stats (
    country_code   VARCHAR(2) PRIMARY KEY,
    avg_portcalls  NUMERIC(12, 3),   -- 일평균 항만 기항 수
    sd_portcalls   NUMERIC(12, 3),   -- 표준편차
    cv             NUMERIC(10, 4),   -- 변동계수(sd/avg) = 물동량 불안정성
    obs_count      INTEGER,          -- 표본 일수
    period_from    DATE,             -- 집계 시작
    updated_at     TIMESTAMP DEFAULT now()
);
