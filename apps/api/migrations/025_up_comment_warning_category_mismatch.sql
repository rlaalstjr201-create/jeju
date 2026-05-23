-- ================================================================
-- Migration 025 UP: comment_warning_flag에 'category_mismatch' 추가
-- category-snippet 불일치 진단(category-snippet-audit.ts)에서
-- 카테고리 오분류 spot을 마킹하기 위해 CHECK constraint 확장.
-- ================================================================

DO $$
DECLARE
  v_conname TEXT;
BEGIN
  -- 기존 comment_warning_flag CHECK constraint 이름 조회
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
           'category_mismatch'
         ));
