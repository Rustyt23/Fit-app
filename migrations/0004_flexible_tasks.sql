-- Flexible routine items and per-item coins.

-- 1 = can be done any time of the day (no set time, never "late").
ALTER TABLE tasks ADD COLUMN any_time INTEGER NOT NULL DEFAULT 0;
-- When set (1-6): "this many times a week, on any days" instead of fixed weekdays.
ALTER TABLE tasks ADD COLUMN per_week INTEGER;
-- Coins for doing this item (NULL = use the admin's coin rules for its type). Late ticks get half.
ALTER TABLE tasks ADD COLUMN coins INTEGER;
-- Coins taken away when it's missed (0 = no penalty).
ALTER TABLE tasks ADD COLUMN penalty INTEGER NOT NULL DEFAULT 0;
