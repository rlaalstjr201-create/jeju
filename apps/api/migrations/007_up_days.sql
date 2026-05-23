CREATE TABLE IF NOT EXISTS days (
  id          UUID     PRIMARY KEY DEFAULT uuid_generate_v4(),
  day_plan_id UUID     NOT NULL REFERENCES day_plans(id) ON DELETE CASCADE,
  day_index   SMALLINT NOT NULL,
  date        DATE     NOT NULL,
  UNIQUE (day_plan_id, day_index)
);
