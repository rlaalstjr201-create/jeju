-- down
UPDATE curation_candidates SET verified_by = 'naver' WHERE verified_by = 'naver_kakao_cross';
ALTER TABLE curation_candidates DROP CONSTRAINT IF EXISTS curation_candidates_verified_by_check;
ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_verified_by_check
  CHECK (verified_by IN ('kakao', 'naver', 'kakao_parent', 'manual'));
