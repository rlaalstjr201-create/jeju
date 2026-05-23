-- ================================================================
-- Migration 022 UP: buzz_outlier 플래그 + 선별 결과 컬럼
-- Phase C 점수 산정 지원
-- ================================================================

-- buzz_outlier: 동명이인/일반어로 buzz count 신뢰 불가 플래그
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS buzz_outlier BOOLEAN NOT NULL DEFAULT FALSE;

-- selected_tier: Phase C 쿼터 선별 결과
-- 'reference' = 선별, NULL = 미선별
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS selected_tier TEXT
    CHECK (selected_tier IS NULL OR selected_tier = 'reference');

CREATE INDEX IF NOT EXISTS idx_candidates_selected_tier
  ON curation_candidates (selected_tier)
  WHERE selected_tier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_candidates_final_score_cat
  ON curation_candidates (category, final_score DESC NULLS LAST);
