-- ================================================================
-- Migration 026 UP: operating_status 컬럼 신설
-- spots 테이블 (프로덕션 앱) + curation_candidates (알파 셋 Phase E)
-- ADR-0056: operating_status 정책
-- ================================================================

-- ── spots 테이블 ───────────────────────────────────────────────────

ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS operating_status TEXT;

ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS operating_status_source TEXT
    DEFAULT 'visitjeju'
    CHECK (operating_status_source IN ('visitjeju', 'manual', 'snippet'));

ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS operating_status_updated_at TIMESTAMPTZ;

-- ── curation_candidates 테이블 ────────────────────────────────────
-- Phase E 알파 셋 작업용 (만장굴 등 괄호 운영 상태 분리)

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS operating_status TEXT;

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS operating_status_source TEXT
    DEFAULT 'visitjeju'
    CHECK (operating_status_source IN ('visitjeju', 'manual', 'snippet'));

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS operating_status_updated_at TIMESTAMPTZ;
