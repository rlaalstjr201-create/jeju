-- ================================================================
-- Migration 021 UP: official_awards 테이블
-- T2-v2 공식 어워드 룩업 (블루리본, 향후 미쉐린 등 확장 가능)
-- ================================================================

CREATE TABLE IF NOT EXISTS official_awards (
  id             SERIAL PRIMARY KEY,
  award_type     TEXT    NOT NULL,    -- 'blue_ribbon_listed'|'blue_ribbon'|'blue_ribbon_star'|'blue_ribbon_top'|'red_ribbon_coca'
  award_tier     INTEGER,             -- 리본 수 0/1/2/3 (red_ribbon_coca는 NULL)
  award_label    TEXT,                -- 원문 라벨 ('전국 2026 선정' / '레드리본 선정' / null)
  spot_name      TEXT    NOT NULL,
  spot_address   TEXT,
  spot_lat       DECIMAL(10, 7),     -- 카카오 주소검색 변환 결과
  spot_lng       DECIMAL(10, 7),
  foodtype       TEXT[],
  description    TEXT,
  source         TEXT    NOT NULL,   -- 'bluerribbon'
  source_id      TEXT,               -- href (예: /restaurants/53664)
  collected_at   TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (source, source_id, award_type)
);

CREATE INDEX IF NOT EXISTS idx_official_awards_type   ON official_awards (award_type);
CREATE INDEX IF NOT EXISTS idx_official_awards_name   ON official_awards (spot_name);
CREATE INDEX IF NOT EXISTS idx_official_awards_source ON official_awards (source, source_id);
