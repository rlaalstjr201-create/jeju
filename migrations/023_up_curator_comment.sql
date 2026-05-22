-- ================================================================
-- Migration 023 UP: Phase E 큐레이터 코멘트 컬럼
-- hook + supporting 2문장 + sources JSONB attribution
-- ================================================================

ALTER TABLE curation_candidates
  -- 최종 합성 코멘트 (hook + supporting 합친 1줄, 큐레이터 편집 후 확정)
  ADD COLUMN IF NOT EXISTS curator_comment       TEXT,
  -- Stage 1 구조화 초안 {hook, supporting, sources}
  ADD COLUMN IF NOT EXISTS comment_draft         JSONB,
  -- Stage 2 검증 결과 [{claim, supported, reason}]
  ADD COLUMN IF NOT EXISTS comment_verified      JSONB,
  ADD COLUMN IF NOT EXISTS comment_generated_at  TIMESTAMPTZ,
  -- 'declining' | 'snippet_poor' | 'regex_hit'
  ADD COLUMN IF NOT EXISTS comment_warning_flag  TEXT
    CHECK (comment_warning_flag IS NULL
        OR comment_warning_flag IN ('declining', 'snippet_poor', 'regex_hit'));

CREATE INDEX IF NOT EXISTS idx_candidates_comment_flag
  ON curation_candidates (comment_warning_flag)
  WHERE comment_warning_flag IS NOT NULL;
