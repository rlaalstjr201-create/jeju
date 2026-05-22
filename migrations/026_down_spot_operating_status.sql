-- Migration 026 DOWN
ALTER TABLE spots
  DROP COLUMN IF EXISTS operating_status,
  DROP COLUMN IF EXISTS operating_status_source,
  DROP COLUMN IF EXISTS operating_status_updated_at;

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS operating_status,
  DROP COLUMN IF EXISTS operating_status_source,
  DROP COLUMN IF EXISTS operating_status_updated_at;
