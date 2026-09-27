-- Initial schema (Phase 1 + 2).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  pin_hash      TEXT    NOT NULL,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  photo         BLOB,
  photo_version INTEGER NOT NULL DEFAULT 0,
  color         TEXT    NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- A routine item assigned to one member. Never hard-deleted once used:
-- end_date is set instead so past scores stay correct.
CREATE TABLE IF NOT EXISTS tasks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  kind       TEXT    NOT NULL CHECK (kind IN ('exercise', 'supplement', 'medicine')),
  title      TEXT    NOT NULL,
  details    TEXT    NOT NULL DEFAULT '',
  time       TEXT    NOT NULL,                   -- 'HH:MM'
  days       TEXT    NOT NULL DEFAULT '0123456', -- weekdays it repeats on, 0 = Sunday
  start_date TEXT    NOT NULL,                   -- 'YYYY-MM-DD', first day it counts
  end_date   TEXT,                               -- first day it no longer counts
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS tasks_member ON tasks(member_id);

CREATE TABLE IF NOT EXISTS checkins (
  task_id   INTEGER NOT NULL REFERENCES tasks(id),
  member_id INTEGER NOT NULL REFERENCES members(id),
  date      TEXT    NOT NULL, -- 'YYYY-MM-DD'
  done_at   TEXT    NOT NULL, -- 'HH:MM'
  on_time   INTEGER NOT NULL,
  PRIMARY KEY (task_id, date)
);
CREATE INDEX IF NOT EXISTS checkins_member_date ON checkins(member_id, date);

CREATE TABLE IF NOT EXISTS audit_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES members(id),
  action   TEXT NOT NULL,
  at       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Sick / travel breaks: these days don't count for scores or streaks.
CREATE TABLE IF NOT EXISTS away_periods (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  start_date TEXT    NOT NULL,
  end_date   TEXT    NOT NULL, -- inclusive
  reason     TEXT    NOT NULL CHECK (reason IN ('sick', 'travel')),
  created_by INTEGER REFERENCES members(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX IF NOT EXISTS away_member ON away_periods(member_id);

-- Coin shop
CREATE TABLE IF NOT EXISTS rewards (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  emoji      TEXT    NOT NULL,
  title      TEXT    NOT NULL,
  cost       INTEGER NOT NULL CHECK (cost > 0),
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS redemptions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id    INTEGER NOT NULL REFERENCES members(id),
  reward_id    INTEGER NOT NULL REFERENCES rewards(id),
  emoji        TEXT    NOT NULL, -- copied from the reward at the time of asking
  title        TEXT    NOT NULL,
  cost         INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'given', 'declined')),
  requested_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  resolved_at  TEXT,
  resolved_by  INTEGER REFERENCES members(id)
);

-- Monthly gift winners, locked in once a month is over.
CREATE TABLE IF NOT EXISTS gift_months (
  month        TEXT PRIMARY KEY, -- 'YYYY-MM'
  finalized_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS gifts (
  month        TEXT    NOT NULL,
  member_id    INTEGER NOT NULL REFERENCES members(id),
  place        INTEGER NOT NULL,
  score        REAL    NOT NULL,
  delivered_at TEXT,
  delivered_by INTEGER REFERENCES members(id),
  note         TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (month, member_id)
);

-- Coin earning rules set by admins. Each row applies from its date onward,
-- so changing the rules never alters coins already earned.
CREATE TABLE IF NOT EXISTS coin_rules (
  effective_date TEXT PRIMARY KEY, -- 'YYYY-MM-DD'
  rules          TEXT NOT NULL,    -- JSON, see CoinRules in stats.ts
  set_by         INTEGER REFERENCES members(id)
);

-- Web push reminders
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT    PRIMARY KEY,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  p256dh     TEXT    NOT NULL,
  auth       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS reminders_sent (
  task_id INTEGER NOT NULL,
  date    TEXT    NOT NULL,
  type    TEXT    NOT NULL, -- 'due' | 'missed'
  PRIMARY KEY (task_id, date, type)
);
