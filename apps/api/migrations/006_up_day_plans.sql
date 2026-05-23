CREATE TABLE IF NOT EXISTS day_plans (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id    UUID UNIQUE NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
