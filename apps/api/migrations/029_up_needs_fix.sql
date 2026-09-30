-- ================================================================
-- Migration 029 UP: comment_warning_flag에 'needs_fix' 추가
--                   + needs_fix_memo TEXT 컬럼 신설
-- 'needs_fix': 명칭·위치 정정 후 재검토 대상
-- ================================================================

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT conname INTO v_conname
  FROM pg_constraint
  WHERE conrelid = 'curation_candidates'::regclass
    AND contype   = 'c'
    AND pg_get_constraintdef(oid) LIKE '%comment_warning_flag%'
  LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE curation_candidates DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_comment_warning_flag_check
  CHECK (comment_warning_flag IS NULL
      OR comment_warning_flag IN (
           'declining',
           'snippet_poor',
           'regex_hit',
           'category_mismatch',
           'approved',
           'rejected',
           'needs_fix'
         ));

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS needs_fix_memo TEXT;
