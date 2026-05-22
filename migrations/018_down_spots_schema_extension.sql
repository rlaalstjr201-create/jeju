-- ================================================================
-- Migration 018 DOWN
-- ================================================================

ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_category_check;

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS awards_hint,
  DROP COLUMN IF EXISTS tier;

DROP INDEX IF EXISTS spots_awards_gin_idx;
DROP INDEX IF EXISTS spots_tier_score_idx;
DROP INDEX IF EXISTS spots_tier_idx;

ALTER TABLE spots
  DROP CONSTRAINT IF EXISTS spots_category_check;

ALTER TABLE spots
  DROP COLUMN IF EXISTS curator_comment_retry_count,
  DROP COLUMN IF EXISTS curator_comment_source,
  DROP COLUMN IF EXISTS curator_comment,
  DROP COLUMN IF EXISTS awards,
  DROP COLUMN IF EXISTS tier;
