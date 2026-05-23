-- ================================================================
-- Migration 020 DOWN: v2 파이프라인 스키마 롤백
-- ================================================================

-- region CHECK 원복 (island 제거)
ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_region_check;
ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_region_check
    CHECK (region IN ('jeju-city','eastern','seogwipo','western','hallasan'));

ALTER TABLE spots
  DROP CONSTRAINT IF EXISTS spots_region_check;
ALTER TABLE spots
  ADD CONSTRAINT spots_region_check
    CHECK (region IN ('jeju-city','eastern','seogwipo','western','hallasan'));

DROP INDEX IF EXISTS idx_candidates_category_score;
DROP INDEX IF EXISTS idx_candidates_trend;
DROP INDEX IF EXISTS idx_spots_category_score;
DROP INDEX IF EXISTS idx_spots_trend;

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS subregion,
  DROP COLUMN IF EXISTS raw_alltag,
  DROP COLUMN IF EXISTS external_buzz_count,
  DROP COLUMN IF EXISTS external_buzz_score,
  DROP COLUMN IF EXISTS final_score,
  DROP COLUMN IF EXISTS trend_category,
  DROP COLUMN IF EXISTS external_links,
  DROP COLUMN IF EXISTS augmented_intro,
  DROP COLUMN IF EXISTS user_added_links;

ALTER TABLE spots
  DROP COLUMN IF EXISTS subregion,
  DROP COLUMN IF EXISTS external_buzz_count,
  DROP COLUMN IF EXISTS external_buzz_score,
  DROP COLUMN IF EXISTS final_score,
  DROP COLUMN IF EXISTS trend_category,
  DROP COLUMN IF EXISTS external_links,
  DROP COLUMN IF EXISTS augmented_intro,
  DROP COLUMN IF EXISTS user_added_links;
