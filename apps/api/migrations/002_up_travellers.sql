CREATE TABLE IF NOT EXISTS travellers (
  id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  kakao_id   TEXT        UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
