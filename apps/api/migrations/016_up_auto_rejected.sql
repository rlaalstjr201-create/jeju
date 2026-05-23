-- up
-- Migration 016: auto_rejected status 추가 + Stage 4 실패 naver 후보 일괄 처리
--
-- 기존 CHECK 제약에 'auto_rejected' 추가.
-- 기존 naver·kakao_unverified·좌표 없음 레코드 → auto_rejected 일괄 변환.

-- ── Part 1: CHECK 제약 갱신 ──────────────────────────────────────
-- PostgreSQL은 컬럼 CHECK를 이름으로 특정해야 DROP 가능.
-- 기존 제약 이름을 pg_constraint에서 확인 후 DROP → 재추가.
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
     AND att.attname = 'status'
   LIMIT 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE curation_candidates DROP CONSTRAINT %I', v_conname);
  END IF;
END $$;

ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_status_check
  CHECK (status IN ('pending', 'kakao_unverified', 'approved', 'rejected', 'auto_rejected'));

-- ── Part 2: 기존 Stage 4 실패 후보 일괄 auto_rejected 처리 ──────
-- 대상: source_type='naver' AND status='kakao_unverified' AND lat IS NULL
-- (visitjeju kakao_unverified는 좌표 있으므로 제외)
UPDATE curation_candidates
   SET status = 'auto_rejected',
       llm_summary = COALESCE(llm_summary, 'Stage 4 모든 검증 실패 (kakao·naver·parent 모두 미등록)')
 WHERE source_type = 'naver'
   AND status = 'kakao_unverified'
   AND lat IS NULL;
