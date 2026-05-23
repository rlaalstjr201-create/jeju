-- ================================================================
-- Migration 023 DOWN
-- ================================================================

DROP INDEX IF EXISTS idx_candidates_comment_flag;

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS curator_comment,
  DROP COLUMN IF EXISTS comment_draft,
  DROP COLUMN IF EXISTS comment_verified,
  DROP COLUMN IF EXISTS comment_generated_at,
  DROP COLUMN IF EXISTS comment_warning_flag;
