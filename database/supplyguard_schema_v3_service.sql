-- ============================================================================
-- SupplyGuard 스키마 v3 - 서비스/제품 계층 (v2 데이터 파이프라인 위에 추가)
-- 연합 학술제 13조
--
-- v2(supplyguard_schema_v2.sql)는 "외부 데이터 수집 → SGRI 국가 추천"까지 커버.
-- v3는 요구사항/기능명세서가 요구하는 "제품" 부분을 채운다:
--   로그인(users) · 기업 추천(companies, supplier_recommendations)
--   · 피드백(recommendation_feedback) · 보고서(reports) · 알림(alerts)
--
-- ▶ 실행: v2 스키마를 먼저 올린 뒤 이 파일을 실행한다.
--   psql -d supplyguard -f supplyguard_schema_v2.sql
--   psql -d supplyguard -f supplyguard_schema_v3_service.sql
--
-- ▶ 생성 순서(FK 의존성): companies → users → user_queries(ALTER)
--   → supplier_recommendations → recommendation_feedback → reports → alerts
-- ============================================================================


-- ============================================================================
-- [1] companies - 기업 마스터 (공급기업 + 사용자 소속기업 공용)
--   기업의 "고정 사실"만 저장. 질의별 추천 결과는 supplier_recommendations에.
--   ※ MVP: 취급품목/인증은 JSONB 배열로 단순화. 나중에 junction 테이블로 정규화 가능.
-- ============================================================================
CREATE TABLE companies (
    company_id      BIGSERIAL    PRIMARY KEY,
    name            VARCHAR(255) NOT NULL,
    name_en         VARCHAR(255),
    country_code    CHAR(2)      REFERENCES countries(country_code),
    company_type    VARCHAR(20)  DEFAULT 'supplier',   -- supplier(공급기업) / buyer(사용자소속) / both
    reg_no          VARCHAR(50),                        -- 사업자/기업 등록번호
    website         VARCHAR(500),
    hs_codes        JSONB,                              -- 취급 품목 HS코드 목록 ["283691", ...]
    certifications  JSONB,                              -- 보유 인증 ["ISO 9001", "ISO 14001"]
    annual_capacity NUMERIC(20,2),                      -- 연간 생산능력
    capacity_unit   VARCHAR(20),                        -- 예: ton/year
    status          VARCHAR(20)  DEFAULT 'active',      -- active / warning / inactive
    data_source     VARCHAR(60),                        -- 출처: manual / news / api
    created_at      TIMESTAMPTZ  DEFAULT now(),
    updated_at      TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_companies_country ON companies(country_code);


-- ============================================================================
-- [2] users - 사용자 (Google 로그인)
--   요구사항 1(로그인/회원가입), 2(자신의 기업 위험도)
-- ============================================================================
CREATE TABLE users (
    user_id       BIGSERIAL    PRIMARY KEY,
    google_sub    VARCHAR(50)  UNIQUE,                  -- Google OAuth 고유 식별자(sub)
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(100),
    picture_url   VARCHAR(500),
    company_id    BIGINT       REFERENCES companies(company_id),  -- 소속 기업
    role          VARCHAR(20)  DEFAULT 'member',        -- member / admin
    created_at    TIMESTAMPTZ  DEFAULT now(),
    last_login_at TIMESTAMPTZ
);
CREATE INDEX idx_users_company ON users(company_id);


-- ============================================================================
-- [3] user_queries 확장 - 질의를 사용자에 연결
--   (v2의 user_queries에는 user_id가 없어 "누가 조회했는지" 추적 불가 → 추가)
-- ============================================================================
ALTER TABLE user_queries
    ADD COLUMN IF NOT EXISTS user_id BIGINT REFERENCES users(user_id);
CREATE INDEX IF NOT EXISTS idx_user_queries_user ON user_queries(user_id);


-- ============================================================================
-- [4] supplier_recommendations - 기업 추천 결과 (국가 추천의 기업 버전)
--   procurement_recommendations(국가)와 대칭. 질의마다 새로 생성.
--   F-07/F-08, 요구사항 9~10
-- ============================================================================
CREATE TABLE supplier_recommendations (
    id                   BIGSERIAL   PRIMARY KEY,
    query_id             BIGINT      NOT NULL REFERENCES user_queries(query_id) ON DELETE CASCADE,
    company_id           BIGINT      NOT NULL REFERENCES companies(company_id),
    rank                 SMALLINT    NOT NULL,           -- 기업 순위
    fit_score            NUMERIC(6,3),                   -- 종합 적합도
    est_unit_price       NUMERIC(18,4),                  -- 예상 단가(USD)
    est_lead_days        INTEGER,                        -- 예상 납기일
    delivery_feasibility VARCHAR(10),                    -- 납기 가능성: 높음/중간/낮음
    past_trade_summary   TEXT,                           -- 과거 거래 요약(공개 데이터)
    rationale            TEXT,                           -- LLM 추천 근거 (왜 이 기업인지)
    created_at           TIMESTAMPTZ DEFAULT now(),
    UNIQUE (query_id, company_id)
);
CREATE INDEX idx_supplier_reco_query_rank ON supplier_recommendations(query_id, rank);


-- ============================================================================
-- [5] recommendation_feedback - 추천에 대한 사용자 피드백
--   요구사항 11(피드백 버튼). 국가/기업 추천 모두에 달 수 있게 polymorphic.
--   ※ reco_id는 reco_type에 따라 대상 테이블이 달라 FK를 걸지 않음(의도된 설계).
-- ============================================================================
CREATE TABLE recommendation_feedback (
    feedback_id   BIGSERIAL   PRIMARY KEY,
    user_id       BIGINT      REFERENCES users(user_id),
    reco_type     VARCHAR(20) NOT NULL,                  -- 'country' / 'supplier'
    reco_id       BIGINT      NOT NULL,                  -- 해당 추천 행의 id
    rating        SMALLINT,                              -- 1=👍 / -1=👎
    comment       TEXT,
    created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_feedback_reco ON recommendation_feedback(reco_type, reco_id);
CREATE INDEX idx_feedback_user ON recommendation_feedback(user_id);


-- ============================================================================
-- [6] reports - AI 보고서 (초안/최종)
--   F-09/F-10, 요구사항 12(초안 목차·요약), 13(LLM 뼈대), 14(이메일 발송)
-- ============================================================================
CREATE TABLE reports (
    report_id     BIGSERIAL    PRIMARY KEY,
    query_id      BIGINT       REFERENCES user_queries(query_id) ON DELETE SET NULL,
    user_id       BIGINT       REFERENCES users(user_id),
    title         VARCHAR(255),
    status        VARCHAR(20)  DEFAULT 'draft',          -- draft(초안) / final(최종)
    sections      JSONB,                                 -- 목차별 본문 {"개요":..., "리스크":..., "추천":...}
    summary       TEXT,                                  -- 보고서 요약
    pdf_url       VARCHAR(500),                          -- 생성된 PDF 경로
    sent_to       VARCHAR(255),                          -- 이메일 발송 대상
    sent_at       TIMESTAMPTZ,                           -- 발송 시각
    created_at    TIMESTAMPTZ  DEFAULT now(),
    updated_at    TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_reports_query ON reports(query_id);
CREATE INDEX idx_reports_user  ON reports(user_id);


-- ============================================================================
-- [7] alerts - 위험 알림
--   F-10, 기능명세서 "긴급 알림 / 계약 전 확인사항" 카드
-- ============================================================================
CREATE TABLE alerts (
    alert_id      BIGSERIAL    PRIMARY KEY,
    user_id       BIGINT       REFERENCES users(user_id),
    query_id      BIGINT       REFERENCES user_queries(query_id) ON DELETE CASCADE,
    country_code  CHAR(2)      REFERENCES countries(country_code),
    hs_code       VARCHAR(10)  REFERENCES hs_codes(hs_code),
    alert_type    VARCHAR(30),                           -- 납기지연 / 가격급등 / 정책위험 / 재해 등
    severity      VARCHAR(10),                           -- high / medium / low
    title         VARCHAR(255),
    message       TEXT,
    is_read       BOOLEAN      DEFAULT FALSE,
    created_at    TIMESTAMPTZ  DEFAULT now()
);
CREATE INDEX idx_alerts_user_read ON alerts(user_id, is_read);


-- ============================================================================
-- 요약: v3 추가 테이블 6개 (+ user_queries.user_id 컬럼)
--   companies · users · supplier_recommendations
--   · recommendation_feedback · reports · alerts
--   → v2(21) + v3(6) = 총 27개 테이블
-- ============================================================================
