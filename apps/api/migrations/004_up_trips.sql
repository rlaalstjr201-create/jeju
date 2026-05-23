CREATE TABLE IF NOT EXISTS trips (
  id            UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  traveller_id  UUID    NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  start_date    DATE    NOT NULL,
  end_date      DATE    NOT NULL,
  phase         TEXT    NOT NULL DEFAULT 'planning' CHECK (phase IN ('planning','active','completed')),
  date_inferred BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_date_range CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS trips_traveller_idx ON trips(traveller_id);
