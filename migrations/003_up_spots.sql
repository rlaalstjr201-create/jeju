CREATE TABLE IF NOT EXISTS spots (
  id               UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  kakao_place_id   TEXT      UNIQUE NOT NULL,
  name             TEXT      NOT NULL,
  region           TEXT      NOT NULL CHECK (region IN ('jeju-city','eastern','seogwipo','western','hallasan')),
  category         TEXT      NOT NULL,
  price_range      TEXT      NOT NULL CHECK (price_range IN ('free','budget','mid','premium')),
  curation_score   SMALLINT  NOT NULL,
  popularity_score SMALLINT  NOT NULL,
  curation_comment TEXT,
  lat              FLOAT8    NOT NULL,
  lng              FLOAT8    NOT NULL,
  thumbnail_url    TEXT,
  embedding        VECTOR(1024),
  is_active        BOOLEAN   NOT NULL DEFAULT true,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spots_region_idx ON spots(region);
CREATE INDEX IF NOT EXISTS spots_curation_score_idx ON spots(curation_score DESC);
CREATE INDEX IF NOT EXISTS spots_active_idx ON spots(is_active) WHERE is_active = true;
