-- ================================================================
-- Migration 022 DOWN
-- ================================================================

DROP INDEX IF EXISTS idx_candidates_selected_tier;
DROP INDEX IF EXISTS idx_candidates_final_score_cat;

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS buzz_outlier,
  DROP COLUMN IF EXISTS selected_tier;
