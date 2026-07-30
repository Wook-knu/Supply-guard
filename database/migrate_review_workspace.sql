-- ============================================================================
-- 조달 검토 워크스페이스 (노션/칸반식) 스키마
--   review_boards : 검토 보드(품목 질의별 조달 검토 공간)
--   review_items  : 보드 카드(추천 국가·기업·자유 메모), 상태·메모·순서
-- 재실행 안전(IF NOT EXISTS).
-- ============================================================================
CREATE TABLE IF NOT EXISTS review_boards (
    board_id    BIGSERIAL PRIMARY KEY,
    user_id     BIGINT REFERENCES users(user_id),
    query_id    BIGINT,                       -- 연결된 품목 질의(선택)
    title       VARCHAR(200) NOT NULL,
    description TEXT,
    created_at  TIMESTAMP DEFAULT now(),
    updated_at  TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_items (
    item_id     BIGSERIAL PRIMARY KEY,
    board_id    BIGINT NOT NULL REFERENCES review_boards(board_id) ON DELETE CASCADE,
    kind        VARCHAR(20) NOT NULL,         -- country | company | note
    ref_code    VARCHAR(20),                  -- country_code(ISO2) 또는 company_id, note면 NULL
    title       VARCHAR(200) NOT NULL,        -- 표시명(국가명·기업명·메모 제목)
    memo        TEXT,
    status      VARCHAR(20) DEFAULT 'candidate', -- candidate | reviewing | selected | rejected
    position    INTEGER DEFAULT 0,            -- 컬럼 내 정렬
    created_at  TIMESTAMP DEFAULT now(),
    updated_at  TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_boards_user ON review_boards(user_id);
CREATE INDEX IF NOT EXISTS idx_review_items_board ON review_items(board_id);
