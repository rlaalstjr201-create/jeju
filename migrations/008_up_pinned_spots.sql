CREATE TABLE IF NOT EXISTS pinned_spots (
  day_id        UUID     NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  spot_id       UUID     NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  position      SMALLINT NOT NULL,
  is_auto_filled BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (day_id, spot_id)
);
CREATE INDEX IF NOT EXISTS pinned_spots_day_idx ON pinned_spots(day_id);
