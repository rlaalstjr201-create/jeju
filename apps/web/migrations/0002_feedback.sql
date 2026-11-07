-- 의견 보내기 (ADR-0081, specs/survey.md): one row per answer. Jeju day (no time of day), the answers and the app
-- version only. No IP, user agent, cookie, position, place id or device id. `pains` is a JSON array of known values.
-- At most 200 rows a day: the insert checks it (functions/_lib/events/feedback.ts FEEDBACK_DAILY_CAP).
CREATE TABLE IF NOT EXISTS feedback (
  day TEXT NOT NULL,
  went TEXT,
  pains TEXT,
  pain TEXT,
  wish TEXT,
  v TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_day ON feedback (day);
