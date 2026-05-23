CREATE TABLE IF NOT EXISTS shortlist_spots (
  traveller_id   UUID    NOT NULL REFERENCES travellers(id) ON DELETE CASCADE,
  spot_id        UUID    NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  is_auto_filled BOOLEAN NOT NULL DEFAULT false,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (traveller_id, spot_id)
);
