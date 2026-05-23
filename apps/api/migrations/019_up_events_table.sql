CREATE TABLE IF NOT EXISTS events (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT        NOT NULL,
  description       TEXT,
  location_spot_id  UUID        REFERENCES spots(id) ON DELETE SET NULL,
  lat               NUMERIC(9,6),
  lng               NUMERIC(9,6),
  event_start       DATE,
  event_end         DATE,
  source            TEXT        NOT NULL,
  sourced_id        TEXT,
  thumbnail_url     TEXT,
  status            TEXT        NOT NULL DEFAULT 'inactive'
                                CHECK (status IN ('active', 'inactive', 'ended')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_date_range_idx
  ON events (event_start, event_end)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS events_status_active_idx
  ON events (status)
  WHERE status IN ('active', 'ended');
