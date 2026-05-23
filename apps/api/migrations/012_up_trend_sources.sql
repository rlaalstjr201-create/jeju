-- up
CREATE TABLE IF NOT EXISTS trend_sources (
  id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name     TEXT        UNIQUE NOT NULL,
  last_fetched_at TIMESTAMPTZ,
  last_status     TEXT        NOT NULL DEFAULT 'never'
                              CHECK (last_status IN ('never','success','failure')),
  consecutive_failures INT   NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO trend_sources (source_name) VALUES
  ('datalab-visitkorea'),
  ('jeju-tourism-bigdata'),
  ('kakao-map-rating')
ON CONFLICT (source_name) DO NOTHING;
