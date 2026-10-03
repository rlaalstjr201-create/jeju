-- Anonymous usage counters (ADR-0061, ADR-0078): day × place × event. No IP, user agent, cookie or time of day.
-- `id` is a place id, or `mood:<mood>` for a mood tap.
CREATE TABLE IF NOT EXISTS counters (
  day TEXT NOT NULL,
  id TEXT NOT NULL,
  event TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, id, event)
) WITHOUT ROWID;
