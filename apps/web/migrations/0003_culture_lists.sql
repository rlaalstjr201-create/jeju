-- 오늘 근처에서 하는 것 (ADR-0129): the day's whole culture list (/api/culture?city=seoul), once it came complete, so every
-- edge answers from it at once instead of building it again (the first ask at an edge took 15–30 s). Public data only:
-- the city's and KOPIS's events. One row a list a day (`key` = the edge cache's), kept 7 days (the function deletes older).
CREATE TABLE IF NOT EXISTS culture_lists (
  key TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  body TEXT NOT NULL,
  until INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS culture_lists_day ON culture_lists (day);
