-- Weekly/monthly events with prizes, score weights, mystery rewards, and
-- database-backed login lockout (works across Cloudflare Worker instances).

-- Score weights + coin amounts, versioned by the date they apply from.
CREATE TABLE IF NOT EXISTS game_rules (
  effective_date TEXT PRIMARY KEY,
  rules          TEXT NOT NULL, -- JSON, see GameRules in src/lib/rules.ts
  set_by         INTEGER REFERENCES members(id)
);
INSERT OR IGNORE INTO game_rules (effective_date, rules, set_by)
  SELECT effective_date, rules, set_by FROM coin_rules;
DROP TABLE coin_rules;

-- How much one routine item counts compared to others of its type (1 = normal).
ALTER TABLE tasks ADD COLUMN weight INTEGER NOT NULL DEFAULT 1;

-- Mystery rewards: members see "Mystery reward" until they buy it.
ALTER TABLE rewards ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

-- Automatic weekly and monthly events. A period is locked in once it's over.
CREATE TABLE IF NOT EXISTS event_periods (
  event        TEXT NOT NULL CHECK (event IN ('week', 'month')),
  period       TEXT NOT NULL, -- first day, 'YYYY-MM-DD'
  finalized_at TEXT NOT NULL,
  notified_at  TEXT, -- when winners were sent their "you won" notification
  PRIMARY KEY (event, period)
);

CREATE TABLE IF NOT EXISTS event_results (
  event        TEXT    NOT NULL CHECK (event IN ('week', 'month')),
  period       TEXT    NOT NULL,
  member_id    INTEGER NOT NULL REFERENCES members(id),
  place        INTEGER NOT NULL,
  score        REAL    NOT NULL,
  prize_coins  INTEGER NOT NULL DEFAULT 0,  -- added to their coins automatically
  prize_text   TEXT    NOT NULL DEFAULT '', -- a real-world prize for an admin to hand over
  delivered_at TEXT,
  delivered_by INTEGER REFERENCES members(id),
  note         TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (event, period, member_id)
);

-- Carry over the monthly gift winners from before.
INSERT OR IGNORE INTO event_periods (event, period, finalized_at, notified_at)
  SELECT 'month', month || '-01', finalized_at, finalized_at FROM gift_months;
INSERT OR IGNORE INTO event_results (event, period, member_id, place, score, prize_text, delivered_at, delivered_by, note)
  SELECT 'month', month || '-01', member_id, place, score, 'Gift package', delivered_at, delivered_by, note FROM gifts;
DROP TABLE gifts;
DROP TABLE gift_months;

CREATE TABLE IF NOT EXISTS login_attempts (
  member_id    INTEGER PRIMARY KEY REFERENCES members(id),
  failures     INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0 -- epoch ms
);
