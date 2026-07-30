-- ============================================================================
-- 구독(요금제) 스키마 — Basic / Pro / Enterprise (수익모델 반영)
-- users.plan = 현재 요금제, subscriptions = 구독 변경 이력
-- 데모 mock 결제: 실결제 없이 플랜 전환. 재실행 안전(IF NOT EXISTS).
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) NOT NULL DEFAULT 'basic';

CREATE TABLE IF NOT EXISTS subscriptions (
    subscription_id BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES users(user_id),
    plan            VARCHAR(20) NOT NULL,        -- basic / pro / enterprise
    price_krw       INTEGER,                     -- 월정액(원). enterprise=별도견적 시 NULL 가능
    status          VARCHAR(20) DEFAULT 'active',-- active / canceled
    started_at      TIMESTAMP DEFAULT now(),
    note            VARCHAR(200)                 -- 예: "mock 결제"
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
