-- up
-- Migration 015: verified_by 컬럼 추가 (ADR-0033)
-- 좌표 검증 소스 추적: 'kakao' | 'naver' | 'kakao_parent' | null
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS verified_by TEXT
    CHECK (verified_by IN ('kakao', 'naver', 'kakao_parent', 'manual'));
