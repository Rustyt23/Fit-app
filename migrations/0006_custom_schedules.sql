-- Calendar-based schedules beyond weekdays and weekly/monthly quotas.

-- When set, the task repeats every N calendar days starting on start_date.
ALTER TABLE tasks ADD COLUMN repeat_every_days INTEGER;

-- Comma-separated dates of the month, e.g. "1,16". Dates missing from a
-- shorter month are simply skipped.
ALTER TABLE tasks ADD COLUMN month_days TEXT;
