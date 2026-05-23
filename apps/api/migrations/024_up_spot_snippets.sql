-- ================================================================
-- Migration 024 UP: spot_snippets — Phase E.0 snippet 사전 배치
-- Naver 블로그·카페 검색 결과 저장, attribution 출처
-- ================================================================

CREATE TABLE IF NOT EXISTS spot_snippets (
  id           SERIAL PRIMARY KEY,
  spot_id      UUID NOT NULL REFERENCES curation_candidates(id) ON DELETE CASCADE,
  source_type  TEXT NOT NULL CHECK (source_type IN ('blog', 'cafe', 'official')),
  source_url   TEXT NOT NULL,
  title        TEXT,
  description  TEXT,          -- snippet 본문 (한 줄, Naver API description 필드)
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snippets_spot ON spot_snippets (spot_id);
CREATE INDEX IF NOT EXISTS idx_snippets_type  ON spot_snippets (source_type);
