-- up
CREATE TABLE IF NOT EXISTS curation_candidates (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kakao_place_id   TEXT        UNIQUE NOT NULL,
  name             TEXT        NOT NULL,
  region           TEXT        NOT NULL CHECK (region IN ('jeju-city','eastern','seogwipo','western','hallasan')),
  category         TEXT        NOT NULL,
  llm_summary      TEXT,
  llm_tags         TEXT[]      NOT NULL DEFAULT '{}',
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','approved','rejected')),
  discovered_at    DATE        NOT NULL,
  sourced_from     TEXT        NOT NULL,
  -- enrichment fields (CM-2 -- ApproveCandidateUseCase 승인 전 필수)
  lat              FLOAT8,
  lng              FLOAT8,
  thumbnail_url    TEXT,
  price_range      TEXT,
  enriched_at      DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS candidates_status_idx ON curation_candidates(status);
CREATE INDEX IF NOT EXISTS candidates_created_idx ON curation_candidates(created_at DESC);
