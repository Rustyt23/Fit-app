-- Fair play (reports), helping each other (help requests), manual coin changes,
-- and a per-person tracking start (used when an admin resets one person).

-- Days before this don't count for this person (scores, coins, streaks, badges).
ALTER TABLE members ADD COLUMN tracking_start TEXT;

-- Coins an admin gives or takes outside the rules: report outcomes, help awards.
CREATE TABLE coin_adjustments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id  INTEGER NOT NULL REFERENCES members(id),
  amount     INTEGER NOT NULL, -- positive: given, negative: taken away
  reason     TEXT    NOT NULL,
  date       TEXT    NOT NULL, -- 'YYYY-MM-DD'
  created_by INTEGER REFERENCES members(id),
  created_at TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
);
CREATE INDEX coin_adjustments_member ON coin_adjustments(member_id);

-- "They ticked it but didn't really do it." An admin upholds or dismisses it.
CREATE TABLE reports (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL REFERENCES members(id),
  member_id   INTEGER NOT NULL REFERENCES members(id),
  task_id     INTEGER NOT NULL REFERENCES tasks(id),
  date        TEXT    NOT NULL, -- the day of the tick
  title       TEXT    NOT NULL, -- copied from the item at the time
  reason      TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'dismissed')),
  penalty     INTEGER NOT NULL DEFAULT 0, -- coins taken from the member
  reward      INTEGER NOT NULL DEFAULT 0, -- coins given to the reporter
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES members(id),
  UNIQUE (reporter_id, task_id, date)
);

-- "I helped Mom with her walk": asks an admin for a coin award.
CREATE TABLE help_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id   INTEGER NOT NULL REFERENCES members(id), -- the helper, who asks
  helped_id   INTEGER NOT NULL REFERENCES members(id),
  note        TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'declined')),
  coins       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
  resolved_at TEXT,
  resolved_by INTEGER REFERENCES members(id)
);
