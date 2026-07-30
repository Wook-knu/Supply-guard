-- ============================================================================
-- SupplyGuard 데이터베이스 스키마 v2 (PostgreSQL)
-- 연합 학술제 13조 - 글로벌 공급망 위험 분석 & 조달국/공급기업 추천 서비스
--
-- ▶ v2 변경점: 팀 SGRI 리스크 프레임워크(S·C·V·L·P·E) 반영
--   S (수급 불안정성)   : 무역 물량 추세 (Comtrade, 관세청 품목별)
--   C (공급처 집중도)   : 국가별 수입 의존도 → HHI (Comtrade 국가별)
--   V (가격 변동성)     : 원자재가·환율 (FRED, 한국은행 ECOS)
--   L (물류 리스크)     : 항만/재해 (PortWatch, GDACS)
--   P (국가·정책 리스크) : 거버넌스·이벤트 (World Bank WGI, GDELT)
--   E (ESG·탄소규제)    : 탄소 배출 (EU CBAM, 환경부 LCI DB)
--
-- 관세청 API 참고:
--   - 15101609 관세청_품목별 수출입실적(GW) : 국가 구분 없음 → S 산출용
--   - 국가별 집중도(C)는 UN Comtrade(reporter×partner)로 계산
--
-- 계층: [1] 참조  [2] 원천(지표별)  [3] 분석/서비스
-- ============================================================================


-- ============================================================================
-- [1] 참조(DIMENSION) 테이블
-- ============================================================================

-- 국가 마스터: API마다 국가코드가 달라 ISO로 표준화
CREATE TABLE countries (
    country_code    CHAR(2)      PRIMARY KEY,          -- ISO 3166-1 alpha-2
    iso3            CHAR(3)      UNIQUE,                -- ISO alpha-3 (WGI/PortWatch용)
    m49_code        SMALLINT,                          -- UN Comtrade 숫자 코드
    name_ko         VARCHAR(100) NOT NULL,
    name_en         VARCHAR(100) NOT NULL,
    region          VARCHAR(50),
    created_at      TIMESTAMPTZ  DEFAULT now()
);

-- HS 코드 마스터 (2·4·6·10단위 계층) + SITC 매핑용 컬럼
CREATE TABLE hs_codes (
    hs_code         VARCHAR(10)  PRIMARY KEY,
    hs_level        SMALLINT     NOT NULL CHECK (hs_level IN (2, 4, 6, 10)),
    parent_hs_code  VARCHAR(10)  REFERENCES hs_codes(hs_code),
    sitc_code       VARCHAR(10),                        -- 국제표준무역분류 매핑
    cn_code         VARCHAR(10),                        -- EU CN 코드(CBAM 매핑용)
    name_ko         VARCHAR(255),
    name_en         VARCHAR(255),
    created_at      TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_hs_parent ON hs_codes(parent_hs_code);

-- HS↔SITC 변환표 (UN concordance). HS 2022부터 일부 품목이 N:N이라 별도 테이블로 처리.
CREATE TABLE hs_sitc_concordance (
    id              BIGSERIAL    PRIMARY KEY,
    hs_code         VARCHAR(10)  NOT NULL REFERENCES hs_codes(hs_code),
    sitc_code       VARCHAR(10)  NOT NULL,
    sitc_rev        VARCHAR(6)   DEFAULT 'Rev4',         -- SITC 개정판
    UNIQUE (hs_code, sitc_code, sitc_rev)
);
CREATE INDEX idx_concord_sitc ON hs_sitc_concordance(sitc_code);

-- HS↔CN 변환표 (EU CN 코드, CBAM 매핑). CN 앞 6자리는 HS와 동일.
CREATE TABLE hs_cn_concordance (
    id              BIGSERIAL    PRIMARY KEY,
    hs_code         VARCHAR(10)  NOT NULL REFERENCES hs_codes(hs_code),
    cn_code         VARCHAR(10)  NOT NULL,
    valid_year      SMALLINT,
    UNIQUE (hs_code, cn_code, valid_year)
);
CREATE INDEX idx_concord_cn ON hs_cn_concordance(cn_code);

-- 관세율 (관세청 실적 API엔 관세율 없음 → 별도 소스로 채움). 조달국 관세 조건 비교용
CREATE TABLE tariff_rates (
    tariff_id       BIGSERIAL    PRIMARY KEY,
    importer_code   CHAR(2)      NOT NULL REFERENCES countries(country_code),
    partner_code    CHAR(2)      REFERENCES countries(country_code),  -- 원산지(NULL=일반)
    hs_code         VARCHAR(10)  NOT NULL REFERENCES hs_codes(hs_code),
    tariff_type     VARCHAR(30),                        -- MFN, FTA, 기본, 잠정
    rate_percent    NUMERIC(6,3),
    valid_from      DATE,
    valid_to        DATE,
    created_at      TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_tariff_lookup ON tariff_rates(importer_code, hs_code, partner_code);


-- ============================================================================
-- [2] 원천(RAW) 테이블 - 리스크 지표별
-- ============================================================================

-- ── S & C : 무역 데이터 ──────────────────────────────────────────────────

-- UN Comtrade Plus : reporter×partner×HS×flow → 국가별 의존도(C) & 물량추세(S)
CREATE TABLE comtrade_trade_flows (
    id              BIGSERIAL    PRIMARY KEY,
    period          VARCHAR(6)   NOT NULL,              -- YYYY 또는 YYYYMM
    reporter_code   CHAR(2)      NOT NULL REFERENCES countries(country_code),
    partner_code    CHAR(2)      REFERENCES countries(country_code),
    flow_code       VARCHAR(2)   NOT NULL,              -- M X RM RX
    flow_desc       VARCHAR(20),
    hs_code         VARCHAR(10)  NOT NULL REFERENCES hs_codes(hs_code),
    classification  VARCHAR(10),
    qty             NUMERIC(20,3),
    qty_unit        VARCHAR(20),
    net_weight_kg   NUMERIC(20,3),
    trade_value_usd NUMERIC(20,2),                      -- 단가 산출 근거
    fetched_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (period, reporter_code, partner_code, flow_code, hs_code)
);
CREATE INDEX idx_comtrade_hs_partner ON comtrade_trade_flows(hs_code, partner_code, flow_code);

-- 관세청_품목별 수출입실적(15101609) : 국가 구분 없음, 한국 기준 월별 품목 실적(S)
--   수입=CIF, 수출=FOB, 중량=순중량(kg)
CREATE TABLE customs_item_trade_stats (
    id              BIGSERIAL    PRIMARY KEY,
    period          VARCHAR(7)   NOT NULL,              -- YYYY.MM
    hs_code         VARCHAR(10)  NOT NULL REFERENCES hs_codes(hs_code),
    item_name_ko    VARCHAR(100),
    export_wgt_kg   NUMERIC(18,0),                      -- 수출 순중량
    export_usd      NUMERIC(20,0),                      -- 수출 신고금액(FOB)
    import_wgt_kg   NUMERIC(18,0),                      -- 수입 순중량
    import_usd      NUMERIC(20,0),                      -- 수입 과세금액(CIF)
    trade_balance   NUMERIC(20,0),
    fetched_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (period, hs_code)
);
CREATE INDEX idx_customs_item_hs ON customs_item_trade_stats(hs_code, period);

-- ── V : 가격 변동성 (원자재가 · 환율) ────────────────────────────────────

-- FRED 시계열 메타 (series_id 단위)
CREATE TABLE fred_series (
    series_id       VARCHAR(40)  PRIMARY KEY,           -- 예: PALLFNFINDEXM
    title           VARCHAR(255),
    units           VARCHAR(80),
    frequency       VARCHAR(20),                        -- Monthly 등
    hs_code         VARCHAR(10)  REFERENCES hs_codes(hs_code), -- 품목 매핑(선택)
    created_at      TIMESTAMPTZ  DEFAULT now()
);

CREATE TABLE fred_observations (
    id              BIGSERIAL    PRIMARY KEY,
    series_id       VARCHAR(40)  NOT NULL REFERENCES fred_series(series_id),
    obs_date        DATE         NOT NULL,
    value           NUMERIC(20,4),
    fetched_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (series_id, obs_date)
);
CREATE INDEX idx_fred_series_date ON fred_observations(series_id, obs_date);

-- 한국은행 ECOS : 환율(원/달러·원/위안), 수입물가지수(PPI) 등
CREATE TABLE ecos_series (
    stat_code       VARCHAR(20)  NOT NULL,              -- 통계표코드
    item_code       VARCHAR(40)  NOT NULL,              -- 통계항목코드
    stat_name       VARCHAR(255),
    item_name       VARCHAR(255),
    unit_name       VARCHAR(40),
    freq            VARCHAR(4),                          -- D M Q A
    PRIMARY KEY (stat_code, item_code)
);

CREATE TABLE ecos_observations (
    id              BIGSERIAL    PRIMARY KEY,
    stat_code       VARCHAR(20)  NOT NULL,
    item_code       VARCHAR(40)  NOT NULL,
    time_period     VARCHAR(8)   NOT NULL,              -- YYYYMMDD/YYYYMM
    value           NUMERIC(20,4),
    fetched_at      TIMESTAMPTZ  DEFAULT now(),
    FOREIGN KEY (stat_code, item_code) REFERENCES ecos_series(stat_code, item_code),
    UNIQUE (stat_code, item_code, time_period)
);
CREATE INDEX idx_ecos_lookup ON ecos_observations(stat_code, item_code, time_period);

-- ── L : 물류 리스크 (항만 · 재해) ────────────────────────────────────────

-- IMF PortWatch : 항만 물동량/혼잡도
CREATE TABLE portwatch_port_activity (
    id              BIGSERIAL    PRIMARY KEY,
    port_id         VARCHAR(30)  NOT NULL,
    port_name       VARCHAR(150),
    country_code    CHAR(2)      REFERENCES countries(country_code),
    obs_date        DATE         NOT NULL,
    import_volume   NUMERIC(18,2),
    export_volume   NUMERIC(18,2),
    port_calls      INTEGER,
    congestion_idx  NUMERIC(8,3),
    disruption_flag BOOLEAN      DEFAULT FALSE,
    latitude        NUMERIC(9,6),
    longitude       NUMERIC(9,6),
    fetched_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (port_id, obs_date)
);
CREATE INDEX idx_portwatch_country_date ON portwatch_port_activity(country_code, obs_date);

-- GDACS : 국가별 자연재해 경보
CREATE TABLE gdacs_alerts (
    id              BIGSERIAL    PRIMARY KEY,
    event_id        VARCHAR(30)  NOT NULL,
    episode_id      VARCHAR(30),
    event_type      VARCHAR(2)   NOT NULL,              -- EQ TC FL DR VO WF
    event_type_desc VARCHAR(40),
    alert_level     VARCHAR(10),                        -- Green Orange Red
    alert_score     NUMERIC(6,3),
    country_code    CHAR(2)      REFERENCES countries(country_code),
    country_name    VARCHAR(100),
    severity        VARCHAR(255),
    from_date       DATE,
    to_date         DATE,
    latitude        NUMERIC(9,6),
    longitude       NUMERIC(9,6),
    fetched_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (event_id, episode_id)
);
CREATE INDEX idx_gdacs_country_date ON gdacs_alerts(country_code, from_date);

-- ── P : 국가·정책 리스크 (거버넌스 · 뉴스 이벤트) ─────────────────────────

-- World Bank WGI : 6개 거버넌스 지표 (연 단위, estimate -2.5~2.5)
CREATE TABLE worldbank_wgi (
    id              BIGSERIAL    PRIMARY KEY,
    country_code    CHAR(2)      NOT NULL REFERENCES countries(country_code),
    year            SMALLINT     NOT NULL,
    indicator_code  VARCHAR(10)  NOT NULL,              -- VA PV GE RQ RL CC
    indicator_name  VARCHAR(80),
    estimate        NUMERIC(6,3),                        -- -2.5 ~ 2.5
    percentile_rank NUMERIC(6,2),                        -- 0 ~ 100
    fetched_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (country_code, year, indicator_code)
);
CREATE INDEX idx_wgi_country_year ON worldbank_wgi(country_code, year);

-- GDELT : 국가별 뉴스 이벤트 톤/불안정 신호 (경량 집계 형태로 적재)
CREATE TABLE gdelt_events (
    id              BIGSERIAL    PRIMARY KEY,
    event_date      DATE         NOT NULL,
    country_code    CHAR(2)      REFERENCES countries(country_code),
    event_root_code VARCHAR(4),                          -- CAMEO 상위 코드
    goldstein_scale NUMERIC(5,2),                        -- -10 ~ 10 (갈등/협력)
    avg_tone        NUMERIC(6,3),                        -- 평균 톤
    num_mentions    INTEGER,
    num_articles    INTEGER,
    fetched_at      TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_gdelt_country_date ON gdelt_events(country_code, event_date);

-- ── E : ESG · 탄소규제 리스크 ────────────────────────────────────────────

-- EU CBAM : CN코드별 탄소 배출 기본값 (탄소세 부담 사전 계산)
CREATE TABLE cbam_emission_defaults (
    id              BIGSERIAL    PRIMARY KEY,
    cn_code         VARCHAR(10)  NOT NULL,               -- EU CN 코드
    hs_code         VARCHAR(10)  REFERENCES hs_codes(hs_code), -- 매핑
    product_name    VARCHAR(255),
    direct_emission NUMERIC(12,4),                       -- 직접배출 tCO2e/t
    indirect_emiss  NUMERIC(12,4),                       -- 간접배출 tCO2e/t
    unit            VARCHAR(20)  DEFAULT 'tCO2e/t',
    valid_year      SMALLINT,
    fetched_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (cn_code, valid_year)
);
CREATE INDEX idx_cbam_hs ON cbam_emission_defaults(hs_code);

-- 환경부 LCI DB : 원자재/에너지 단위당 탄소 배출계수 (Scope3 추정)
CREATE TABLE lci_emission_factors (
    id              BIGSERIAL    PRIMARY KEY,
    material_name   VARCHAR(255) NOT NULL,
    hs_code         VARCHAR(10)  REFERENCES hs_codes(hs_code),
    emission_factor NUMERIC(14,5),                       -- kgCO2e / unit
    unit            VARCHAR(30),
    source          VARCHAR(60)  DEFAULT '환경부 LCI DB',
    fetched_at      TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_lci_hs ON lci_emission_factors(hs_code);


-- ============================================================================
-- [3] 분석 / 서비스 테이블
-- ============================================================================

-- 공급처 집중도(C) 계산 중간 결과 : HHI, 상위 공급국 비중
CREATE TABLE supplier_concentration (
    id                  BIGSERIAL PRIMARY KEY,
    importer_code       CHAR(2)   NOT NULL REFERENCES countries(country_code),
    hs_code             VARCHAR(10) NOT NULL REFERENCES hs_codes(hs_code),
    period              VARCHAR(6) NOT NULL,
    hhi                 NUMERIC(8,4),                    -- 허핀달-허쉬만 지수(0~1 또는 0~10000)
    top_supplier_code   CHAR(2)   REFERENCES countries(country_code),
    top_supplier_share  NUMERIC(6,3),                    -- 최대 공급국 비중(%)
    num_suppliers       SMALLINT,                        -- 공급국 수
    created_at          TIMESTAMPTZ DEFAULT now(),
    UNIQUE (importer_code, hs_code, period)
);
CREATE INDEX idx_conc_hs_period ON supplier_concentration(hs_code, period);

-- 국가별 SGRI : 6개 지표(S·C·V·L·P·E) + 종합점수
CREATE TABLE country_risk_scores (
    id              BIGSERIAL    PRIMARY KEY,
    country_code    CHAR(2)      NOT NULL REFERENCES countries(country_code),
    hs_code         VARCHAR(10)  REFERENCES hs_codes(hs_code),  -- 품목별(전체면 NULL)
    as_of_date      DATE         NOT NULL,
    score_s         NUMERIC(6,3),                        -- 수급 불안정성
    score_c         NUMERIC(6,3),                        -- 공급처 집중도
    score_v         NUMERIC(6,3),                        -- 가격 변동성
    score_l         NUMERIC(6,3),                        -- 물류 리스크
    score_p         NUMERIC(6,3),                        -- 국가·정책 리스크
    score_e         NUMERIC(6,3),                        -- ESG·탄소규제
    sgri_score      NUMERIC(6,3) NOT NULL,               -- 종합 SGRI (0~100)
    weights_json    JSONB,                               -- 지표별 가중치 스냅샷
    created_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (country_code, hs_code, as_of_date)
);
CREATE INDEX idx_sgri_hs_date ON country_risk_scores(hs_code, as_of_date);

-- 사용자 질의 : 조달 요청 입력값
CREATE TABLE user_queries (
    query_id        BIGSERIAL    PRIMARY KEY,
    item_name       VARCHAR(255),
    hs_code         VARCHAR(10)  REFERENCES hs_codes(hs_code),
    required_qty    NUMERIC(18,3),
    qty_unit        VARCHAR(20),
    target_price    NUMERIC(18,2),                       -- 목표 단가(USD)
    lead_time_days  INTEGER,
    importer_code   CHAR(2)      REFERENCES countries(country_code),
    created_at      TIMESTAMPTZ  DEFAULT now()
);

-- 조달국 추천 결과 : 질의별 국가 순위 + 거래조건 + 지표별 점수 스냅샷
CREATE TABLE procurement_recommendations (
    id              BIGSERIAL    PRIMARY KEY,
    query_id        BIGINT       NOT NULL REFERENCES user_queries(query_id) ON DELETE CASCADE,
    country_code    CHAR(2)      NOT NULL REFERENCES countries(country_code),
    rank            SMALLINT     NOT NULL,
    sgri_score      NUMERIC(6,3),
    score_s         NUMERIC(6,3),
    score_c         NUMERIC(6,3),
    score_v         NUMERIC(6,3),
    score_l         NUMERIC(6,3),
    score_p         NUMERIC(6,3),
    score_e         NUMERIC(6,3),
    est_export_vol  NUMERIC(20,2),                       -- 예상 수출 가능량
    est_unit_price  NUMERIC(18,4),                       -- 예상 단가(USD)
    tariff_percent  NUMERIC(6,3),                        -- 적용 관세율
    carbon_cost     NUMERIC(18,4),                       -- 예상 탄소세 부담(E)
    transport_km    NUMERIC(10,1),
    est_lead_days   INTEGER,
    fit_score       NUMERIC(6,3),                        -- 종합 적합도
    rationale       TEXT,                                -- LLM 추천 근거
    created_at      TIMESTAMPTZ  DEFAULT now(),
    UNIQUE (query_id, country_code)
);
CREATE INDEX idx_reco_query_rank ON procurement_recommendations(query_id, rank);

-- ============================================================================
-- [4] 소스 추상화 뷰
-- ============================================================================

-- S(수급 불안정성) 계산의 입력 소스.
--
-- S 는 "한국이 이 품목을 월별로 얼마나 들쭉날쭉 수입하는지"라서 국가 구분이 필요 없다.
-- 원래는 관세청_품목별 수출입실적(15101609)으로 채울 계획이었으나 승인 대기 중이라,
-- 당분간 UN Comtrade 의 World(전세계 합계) 행으로 대체한다.
--
-- calc_supply_instability.sql / calc_merge_item.sql 은 이 뷰만 바라본다.
-- → 관세청 승인이 나면 아래 SELECT 만 customs_item_trade_stats 로 교체하면 되고,
--   계산 로직·가중치·SGRI 는 건드릴 필요가 없다.
--
-- ⚠ 소스를 바꾸면 값 기준이 달라진다(Comtrade 표준화값 vs 관세청 CIF 신고값).
--   두 소스를 한 시계열에 섞으면 변동계수(CV)가 실제보다 크게 나오므로,
--   교체할 때는 score_s 를 전 기간 재계산해야 한다.
CREATE VIEW s_source_monthly AS
SELECT
    hs_code,
    period                AS period,          -- YYYYMM
    trade_value_usd       AS import_value
FROM comtrade_trade_flows
WHERE flow_code = 'M'
  AND partner_code IS NULL      -- World 합계행
  AND trade_value_usd > 0;

-- ── 관세청 승인 후 교체용 (위 뷰를 지우고 아래로 대체) ──────────────────────
-- CREATE OR REPLACE VIEW s_source_monthly AS
-- SELECT
--     hs_code,
--     REPLACE(period, '.', '') AS period,     -- 'YYYY.MM' → 'YYYYMM' 로 형식 통일
--     import_usd               AS import_value
-- FROM customs_item_trade_stats
-- WHERE import_usd > 0;


-- ============================================================================
-- 지표 → 소스 매핑 요약
--   S : s_source_monthly 뷰 (현재 comtrade_trade_flows World행 → 승인 후 관세청)
--   C : comtrade_trade_flows → supplier_concentration(HHI)
--   V : fred_observations, ecos_observations
--   L : portwatch_port_activity, gdacs_alerts
--   P : worldbank_wgi, gdelt_events
--   E : cbam_emission_defaults, lci_emission_factors
-- ============================================================================
