-- down
ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS review_excluded;
