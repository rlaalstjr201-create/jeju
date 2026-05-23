-- down
DROP INDEX IF EXISTS spots_trend_score_idx;
DROP INDEX IF EXISTS spots_popularity_score_idx;
ALTER TABLE spots DROP COLUMN IF EXISTS trend_score;
