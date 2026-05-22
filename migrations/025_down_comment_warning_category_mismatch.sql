-- Migration 025 DOWN
ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_comment_warning_flag_check;

ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_comment_warning_flag_check
  CHECK (comment_warning_flag IS NULL
      OR comment_warning_flag IN ('declining', 'snippet_poor', 'regex_hit'));
