-- Your own item types (besides exercise / supplement / medicine), and "N times a month" items.
--
-- SQLite can't change a CHECK constraint in place, so the tasks table is rebuilt with the same
-- ids. Check-ins point at tasks, so they're set aside in a plain holding table first and put
-- back afterwards: nothing ever points at a missing task, so foreign keys stay on throughout
-- (this also works on Cloudflare D1, where they can't be turned off).

CREATE TABLE checkins_hold AS SELECT task_id, member_id, date, done_at, on_time FROM checkins;
DROP TABLE checkins;

CREATE TABLE tasks_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    INTEGER NOT NULL REFERENCES members(id),
  kind         TEXT    NOT NULL CHECK (kind IN ('exercise', 'supplement', 'medicine', 'other')),
  title        TEXT    NOT NULL,
  details      TEXT    NOT NULL DEFAULT '',
  time         TEXT    NOT NULL,
  days         TEXT    NOT NULL DEFAULT '0123456',
  start_date   TEXT    NOT NULL,
  end_date     TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  weight       INTEGER NOT NULL DEFAULT 1,
  any_time     INTEGER NOT NULL DEFAULT 0,
  per_week     INTEGER,
  coins        INTEGER,
  penalty      INTEGER NOT NULL DEFAULT 0,
  -- When set (1-4): "this many times a month, on any days".
  per_month    INTEGER,
  -- For kind 'other': the family's own type name and emoji, e.g. 'Meditation', '🧘'.
  custom_type  TEXT,
  custom_emoji TEXT
);
INSERT INTO tasks_new (id, member_id, kind, title, details, time, days, start_date, end_date, created_at, weight, any_time, per_week, coins, penalty)
  SELECT id, member_id, kind, title, details, time, days, start_date, end_date, created_at, weight, any_time, per_week, coins, penalty FROM tasks;
DROP TABLE tasks;
ALTER TABLE tasks_new RENAME TO tasks;
CREATE INDEX IF NOT EXISTS tasks_member ON tasks(member_id);

CREATE TABLE checkins (
  task_id   INTEGER NOT NULL REFERENCES tasks(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  date      TEXT    NOT NULL, -- 'YYYY-MM-DD'
  done_at   TEXT    NOT NULL, -- 'HH:MM'
  on_time   INTEGER NOT NULL,
  PRIMARY KEY (task_id, date)
);
INSERT INTO checkins (task_id, member_id, date, done_at, on_time)
  SELECT task_id, member_id, date, done_at, on_time FROM checkins_hold;
DROP TABLE checkins_hold;
CREATE INDEX IF NOT EXISTS checkins_member_date ON checkins(member_id, date);
