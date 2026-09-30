-- Migration 029 DOWN

ALTER TABLE curation_candidates
  DROP COLUMN IF EXISTS needs_fix_memo;

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
           'rejected'
         ));
