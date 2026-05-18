-- up
-- ================================================================
-- Migration 013 UP: Phase 0 Pipeline
-- 1. curation_candidates 확장 (visitjeju-first, LLM 점수 필드 추가)
-- 2. curation_decisions 신규 생성
-- 3. Addendum (§0-A): synthetic_id, spots.kakao_place_id nullable
-- ================================================================

-- ── Part 1: curation_candidates 확장 ───────────────────────────

-- visitjeju가 1차 소스 (ADR-0023). kakao_place_id → Stage 4 검증 후 채움
ALTER TABLE curation_candidates
  ALTER COLUMN kakao_place_id DROP NOT NULL;

ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_kakao_place_id_key;

-- visitjeju 콘텐츠 ID
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS visitjeju_content_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_visitjeju_content_id_idx
  ON curation_candidates(visitjeju_content_id)
  WHERE visitjeju_content_id IS NOT NULL;

-- 소스 구분
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'visitjeju'
    CHECK (source_type IN ('visitjeju', 'naver'));

-- 네이버 발굴 원본
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS naver_source_url TEXT;

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS naver_snippet TEXT;

-- Stage 3 LLM 추출 결과
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS authenticity_score FLOAT4
    CHECK (authenticity_score BETWEEN 0 AND 1);

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS ordinariness_score FLOAT4
    CHECK (ordinariness_score BETWEEN 0 AND 1);

-- status 확장 (kakao_unverified 추가)
ALTER TABLE curation_candidates
  DROP CONSTRAINT IF EXISTS curation_candidates_status_check;

ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_status_check
    CHECK (status IN ('pending', 'kakao_unverified', 'approved', 'rejected'));

-- LLM 종합 사전 점수 (v1: null, v2+ 활성)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS ai_estimated_score SMALLINT
    CHECK (ai_estimated_score BETWEEN 1 AND 10);

ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS ai_estimated_at TIMESTAMPTZ;

-- §0-A: synthetic_id (ApproveCandidateUseCase 실행 시 채움)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS synthetic_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS candidates_synthetic_id_idx
  ON curation_candidates(synthetic_id)
  WHERE synthetic_id IS NOT NULL;

-- ── Part 2: curation_decisions 신규 생성 ───────────────────────
-- (ADR-0027 스키마, ADR-0030 거절 사유 컬럼 포함)

CREATE TABLE IF NOT EXISTS curation_decisions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          UUID        NOT NULL REFERENCES curation_candidates(id),
  decided_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by            TEXT        NOT NULL,
  decision              TEXT        NOT NULL
                                    CHECK (decision IN ('approve', 'reject', 'hold')),
  curation_score        SMALLINT
                                    CHECK (curation_score BETWEEN 1 AND 10),
  rejection_reason_enum TEXT
                                    CHECK (rejection_reason_enum IN
                                      ('ad', 'ordinary', 'low_quality', 'duplicate', 'other')),
  rejection_reason_text TEXT,
  ai_estimated_score    SMALLINT,
  ai_estimated_at       TIMESTAMPTZ,
  curator_override      BOOLEAN,
  free_memo             TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decisions_candidate_idx
  ON curation_decisions(candidate_id);

CREATE INDEX IF NOT EXISTS decisions_decided_at_idx
  ON curation_decisions(decided_at DESC);

-- ── Part 3: spots 테이블 변경 (§0-A) ──────────────────────────
-- kakao_place_id nullable — 미검증 Spot은 synthetic_id로 식별

ALTER TABLE spots
  ALTER COLUMN kakao_place_id DROP NOT NULL;

ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS synthetic_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS spots_synthetic_id_idx
  ON spots(synthetic_id)
  WHERE synthetic_id IS NOT NULL;

-- ── Dead columns 메모 ──────────────────────────────────────────
-- spots.trend_score      → v1 zero 유지 (ADR-0026)
-- spots.popularity_score → v1 zero 유지 (ADR-0026)
-- curation_decisions.ai_estimated_* → v1 null (ADR-0027)
-- curation_candidates.ai_estimated_* → v1 null (ADR-0028)
