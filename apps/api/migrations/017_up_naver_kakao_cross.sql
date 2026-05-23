-- up
-- Migration 017: verified_by에 'naver_kakao_cross' 추가
DO $$
DECLARE
  v_conname TEXT;
BEGIN
  SELECT con.conname
    INTO v_conname
    FROM pg_constraint con
    JOIN pg_class cls ON con.conrelid = cls.oid
    JOIN pg_attribute att ON att.attrelid = cls.oid AND att.attnum = ANY(con.conkey)
   WHERE cls.relname = 'curation_candidates'
     AND con.contype = 'c'
     AND att.attname = 'verified_by'
   LIMIT 1;
  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE curation_candidates DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;
ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_verified_by_check
  CHECK (verified_by IN ('kakao', 'naver', 'kakao_parent', 'manual', 'naver_kakao_cross'));
