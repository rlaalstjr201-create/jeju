-- up
CREATE TABLE IF NOT EXISTS calibration_profiles (
  trip_id           UUID    PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
  curated_ratio     FLOAT8  NOT NULL DEFAULT 0.5
                            CHECK (curated_ratio BETWEEN 0.0 AND 1.0),
  is_user_adjusted  BOOLEAN NOT NULL DEFAULT false,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
