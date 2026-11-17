-- KOPIS 공연 상세 (ADR-0129 Amendment 1): one copy for every edge, so the day's list is finished over a few asks wherever they
-- land (the edge cache kept them per edge: asks from different edges each started over). Public data only. Kept 7 days
-- (`until`, ms); the function deletes those past it.
CREATE TABLE IF NOT EXISTS kopis_shows (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS kopis_shows_until ON kopis_shows (until);
