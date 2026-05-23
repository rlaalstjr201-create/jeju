-- down
ALTER TABLE curation_candidates DROP COLUMN IF EXISTS verified_by;
