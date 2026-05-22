-- ================================================================
-- Migration 018 UP: spots 스키마 확장
-- tier, awards, curator_comment 메타 필드 추가 (ADR-0042·0043·0044)
-- cultural_space category enum 신규 추가 (specs/visitjeju-reference-top1000.md §8.2)
-- ================================================================

-- ── Part 1: spots 테이블 확장 ─────────────────────────────────────

-- tier: Two-Tier 큐레이션 모델 (ADR-0042)
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS tier TEXT
    NOT NULL DEFAULT 'hidden'
    CHECK (tier IN ('reference', 'hidden'));

-- awards: 외부 수상 이력 JSONB 배열 (ADR-0044)
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS awards JSONB
    NOT NULL DEFAULT '[]';

-- curator_comment: Gemma 생성 코멘트 + 큐레이터 수정본 (ADR-0043)
-- OQ-S1 해소: curation_comment 활발히 사용 중 → 병존. v1.5에 통합.
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS curator_comment TEXT;

-- curator_comment_source: 코멘트 출처 추적
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS curator_comment_source TEXT
    CHECK (curator_comment_source IN ('gemma', 'claude_fallback', 'curator_edit'));

-- curator_comment_retry_count: 다시뽑기 이력
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS curator_comment_retry_count SMALLINT
    NOT NULL DEFAULT 0
    CHECK (curator_comment_retry_count >= 0);

-- ── Part 2: spots.category CHECK 신규 추가 ───────────────────────
-- CASE 2: 기존 CHECK 없음 (003_up_spots.sql 확인). NOT VALID로 기존 데이터 영향 최소화.
ALTER TABLE spots
  ADD CONSTRAINT spots_category_check
    CHECK (category IN (
      'sightseeing','restaurant','cafe','experience',
      'cultural_space','accommodation','shopping','other'
    ))
    NOT VALID;

-- ── Part 3: 인덱스 ────────────────────────────────────────────────

-- tier 단독 (큐레이션 다양성 보장 집계용)
CREATE INDEX IF NOT EXISTS spots_tier_idx
  ON spots(tier);

-- (tier, curation_score DESC) 복합 (추천 알고리즘 tier별 정렬용)
CREATE INDEX IF NOT EXISTS spots_tier_score_idx
  ON spots(tier, curation_score DESC);

-- awards 검색용 GIN (배열 내 특정 award 존재 여부 조회)
CREATE INDEX IF NOT EXISTS spots_awards_gin_idx
  ON spots USING gin(awards);

-- ── Part 4: curation_candidates 확장 ─────────────────────────────

-- tier: 자동 판정 결과 임시 저장 (ADR-0042)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS tier TEXT
    DEFAULT 'hidden'
    CHECK (tier IN ('reference', 'hidden'));

-- awards_hint: 패턴 매칭 결과 임시 저장 (ADR-0044)
ALTER TABLE curation_candidates
  ADD COLUMN IF NOT EXISTS awards_hint TEXT[]
    DEFAULT '{}';

-- ── Part 5: curation_candidates.category CHECK 신규 추가 ──────────
-- CASE 2: 기존 CHECK 없음. NOT VALID로 기존 데이터 영향 최소화.
ALTER TABLE curation_candidates
  ADD CONSTRAINT curation_candidates_category_check
    CHECK (category IN (
      'sightseeing','restaurant','cafe','experience',
      'cultural_space','accommodation','shopping','other'
    ))
    NOT VALID;
