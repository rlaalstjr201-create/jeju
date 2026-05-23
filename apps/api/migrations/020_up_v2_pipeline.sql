-- ================================================================
-- Migration 020 UP: v2 파이프라인 스키마 확장
-- subregion, raw_alltag, buzz score, trend, 보강 필드 추가
-- (ADR-0051 buzz score, ADR-0049 trend, specs/visitjeju-curation-pipeline-v2.md)
-- ================================================================

-- ── Part 1: curation_candidates 확장 (9개 컬럼) ──────────────────

-- Phase A: VisitJeju v2 seed 원본 필드
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS subregion  TEXT,   -- region2cd label ("애월", "중문" 등)
  ADD COLUMN IF NOT EXISTS raw_alltag TEXT;   -- alltag 원문 (분류 합류는 검증 후 결정)

-- Phase B~C: buzz score / trend / 보강
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS external_buzz_count  INTEGER,
  ADD COLUMN IF NOT EXISTS external_buzz_score  DECIMAL(4, 2),
  ADD COLUMN IF NOT EXISTS final_score          DECIMAL(4, 2),
  ADD COLUMN IF NOT EXISTS trend_category       TEXT
    CHECK (trend_category IN ('steady', 'rising', 'declining', 'seasonal', 'new')),
  ADD COLUMN IF NOT EXISTS external_links       JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS augmented_intro      TEXT,
  ADD COLUMN IF NOT EXISTS user_added_links     JSONB NOT NULL DEFAULT '{}';

-- ── Part 2: spots 확장 (8개 컬럼) ───────────────────────────────

-- subregion: candidate→spot 승격 시 손실 방지 + 알파 UI 세부 지역 필터
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS subregion            TEXT;

-- buzz score / trend / 보강 (candidate 승격 후 유지)
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS external_buzz_count  INTEGER,
  ADD COLUMN IF NOT EXISTS external_buzz_score  DECIMAL(4, 2),
  ADD COLUMN IF NOT EXISTS final_score          DECIMAL(4, 2),
  ADD COLUMN IF NOT EXISTS trend_category       TEXT
    CHECK (trend_category IN ('steady', 'rising', 'declining', 'seasonal', 'new')),
  ADD COLUMN IF NOT EXISTS external_links       JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS augmented_intro      TEXT,
  ADD COLUMN IF NOT EXISTS user_added_links     JSONB NOT NULL DEFAULT '{}';

-- ── Part 3: region CHECK 확장 ('island' 추가) ────────────────────

ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_region_check;
ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_region_check
    CHECK (region IN ('jeju-city','seogwipo','island','eastern','western','hallasan'));

ALTER TABLE spots
  DROP CONSTRAINT IF EXISTS spots_region_check;
ALTER TABLE spots
  ADD CONSTRAINT spots_region_check
    CHECK (region IN ('jeju-city','seogwipo','island','eastern','western','hallasan'));

-- ── Part 4: 인덱스 ───────────────────────────────────────────────

-- 카테고리별 점수 내림차순 (Phase C 쿼터 선별)
CREATE INDEX IF NOT EXISTS idx_candidates_category_score
  ON curation_candidates (category, final_score DESC);

-- 트렌드 필터링
CREATE INDEX IF NOT EXISTS idx_candidates_trend
  ON curation_candidates (trend_category)
  WHERE trend_category IS NOT NULL;

-- spots 동일
CREATE INDEX IF NOT EXISTS idx_spots_category_score
  ON spots (category, final_score DESC);

CREATE INDEX IF NOT EXISTS idx_spots_trend
  ON spots (trend_category)
  WHERE trend_category IS NOT NULL;
