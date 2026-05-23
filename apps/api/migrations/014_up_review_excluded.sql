-- up
-- Migration 014: review_excluded 컬럼 추가 (ADR-0032)
-- visitjeju 후보를 v1 큐레이션 검토 대상에서 제외하기 위한 플래그.
-- review_excluded=true → 큐레이터 검토 큐에서 숨김 (dedup base로는 유지).

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS review_excluded BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS candidates_review_excluded_idx
  ON curation_candidates(review_excluded)
  WHERE review_excluded = FALSE;

-- visitjeju 후보 전체 제외 처리 (ADR-0032)
UPDATE curation_candidates
SET review_excluded = TRUE
WHERE source_type = 'visitjeju';
