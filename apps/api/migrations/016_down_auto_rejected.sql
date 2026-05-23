-- down
-- Migration 016 롤백: auto_rejected → kakao_unverified 복원, CHECK 제약 복원

UPDATE curation_candidates
   SET status = 'kakao_unverified'
 WHERE status = 'auto_rejected';

ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_status_check;

ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_status_check
  CHECK (status IN ('pending', 'kakao_unverified', 'approved', 'rejected'));
