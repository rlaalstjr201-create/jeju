-- up
ALTER TABLE spots
  ADD COLUMN IF NOT EXISTS trend_score SMALLINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS spots_popularity_score_idx ON spots(popularity_score DESC);
CREATE INDEX IF NOT EXISTS spots_trend_score_idx      ON spots(trend_score DESC);
