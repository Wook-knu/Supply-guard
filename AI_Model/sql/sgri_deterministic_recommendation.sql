-- SupplyGuard SGRI weight audit.
-- Gemini may propose bounded weights; Python validates them and calculates scores/ranks.

CREATE TABLE IF NOT EXISTS sgri_weight_profiles (
    profile_id          BIGSERIAL PRIMARY KEY,
    country_code        CHAR(2)      NOT NULL,
    hs_code             VARCHAR(10)  NOT NULL,
    as_of_date          DATE,
    strategy            VARCHAR(20)  NOT NULL,
    status              VARCHAR(30)  NOT NULL,
    formula_version     VARCHAR(60)  NOT NULL,
    component_scores    JSONB        NOT NULL,
    baseline_weights    JSONB        NOT NULL,
    objective_weights   JSONB,
    effective_weights   JSONB        NOT NULL,
    reliability         JSONB        NOT NULL DEFAULT '{}'::jsonb,
    summary             TEXT,
    sgri_score          NUMERIC(6,3) NOT NULL,
    uses_llm            BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Compatibility when the earlier prototype table already exists.
ALTER TABLE sgri_weight_profiles
    ADD COLUMN IF NOT EXISTS formula_version VARCHAR(60);
ALTER TABLE sgri_weight_profiles
    ADD COLUMN IF NOT EXISTS objective_weights JSONB;
ALTER TABLE sgri_weight_profiles
    ADD COLUMN IF NOT EXISTS reliability JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE sgri_weight_profiles
    ADD COLUMN IF NOT EXISTS uses_llm BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sgri_weight_profiles
    DROP CONSTRAINT IF EXISTS sgri_weight_profiles_uses_llm_check;

CREATE INDEX IF NOT EXISTS idx_sgri_weight_profiles_lookup
    ON sgri_weight_profiles(country_code, hs_code, as_of_date, created_at DESC);

-- Outcome labels for future statistical calibration.
CREATE TABLE IF NOT EXISTS sgri_risk_outcomes (
    outcome_id          BIGSERIAL PRIMARY KEY,
    country_code        CHAR(2)      NOT NULL,
    hs_code             VARCHAR(10)  NOT NULL,
    observation_date    DATE         NOT NULL,
    shortage_flag       BOOLEAN,
    delay_days          NUMERIC(10,3),
    cost_overrun_pct    NUMERIC(10,3),
    quality_incident    BOOLEAN,
    realized_loss       NUMERIC(18,2),
    notes               TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE(country_code, hs_code, observation_date)
);

COMMENT ON TABLE sgri_weight_profiles IS
    'Weight audit; Gemini may propose bounded weights and Python calculates scores.';

CREATE TABLE IF NOT EXISTS supplier_company_candidates (
    company_id              BIGSERIAL PRIMARY KEY,
    company_name            TEXT           NOT NULL,
    country_code            VARCHAR(10),
    business_type           TEXT,
    hs_code                 VARCHAR(10)    NOT NULL,
    unit_price              NUMERIC(18,4),
    available_quantity      NUMERIC(18,3),
    lead_time_days          NUMERIC(10,2),
    certifications          TEXT[]         NOT NULL DEFAULT '{}',
    on_time_delivery_rate   NUMERIC(5,2)
        CHECK (on_time_delivery_rate BETWEEN 0 AND 100),
    defect_rate_pct         NUMERIC(5,2)
        CHECK (defect_rate_pct BETWEEN 0 AND 100),
    verified                BOOLEAN        NOT NULL DEFAULT FALSE,
    source_urls             TEXT[]         NOT NULL DEFAULT '{}',
    collected_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    UNIQUE (company_name, country_code, hs_code)
);

CREATE INDEX IF NOT EXISTS idx_supplier_company_candidates_hs
    ON supplier_company_candidates(hs_code, collected_at DESC);

COMMENT ON TABLE supplier_company_candidates IS
    'Backend-collected supplier facts used by Gemini; not user-entered companies.';
