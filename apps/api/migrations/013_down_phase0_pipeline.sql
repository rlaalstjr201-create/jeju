-- down
-- ================================================================
-- Migration 013 DOWN
-- ================================================================

DROP TABLE IF EXISTS curation_decisions;

-- §0-A: spots 원복
DROP INDEX IF EXISTS spots_synthetic_id_idx;
ALTER TABLE spots DROP COLUMN IF EXISTS synthetic_id;
ALTER TABLE spots ALTER COLUMN kakao_place_id SET NOT NULL;

-- §0-A: candidates synthetic_id 원복
DROP INDEX IF EXISTS candidates_synthetic_id_idx;
ALTER TABLE curation_candidates DROP COLUMN IF EXISTS synthetic_id;

-- candidates 나머지 컬럼 원복
ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS ai_estimated_at,
  DROP COLUMN IF EXISTS ai_estimated_score;

ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_status_check;
ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS ordinariness_score,
  DROP COLUMN IF EXISTS authenticity_score,
  DROP COLUMN IF EXISTS naver_snippet,
  DROP COLUMN IF EXISTS naver_source_url,
  DROP COLUMN IF EXISTS source_type;

DROP INDEX IF EXISTS candidates_visitjeju_content_id_idx;
ALTER TABLE curation_candidates DROP COLUMN IF EXISTS visitjeju_content_id;

ALTER TABLE curation_candidates
  ALTER COLUMN kakao_place_id SET NOT NULL;

ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_kakao_place_id_key UNIQUE (kakao_place_id);
