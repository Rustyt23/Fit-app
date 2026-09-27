-- Default PINs, per-person language and text size, photos in object storage,
-- and themed events.

-- 1 while the member still has the default PIN (0000) the admin hasn't changed yet.
ALTER TABLE members ADD COLUMN default_pin INTEGER NOT NULL DEFAULT 0;
-- 'en' or 'hi'
ALTER TABLE members ADD COLUMN lang TEXT NOT NULL DEFAULT 'en';
-- 'normal' or 'large'
ALTER TABLE members ADD COLUMN text_size TEXT NOT NULL DEFAULT 'normal';
-- Key of the photo in Cloudflare R2. On your own computer photos stay in the photo column.
ALTER TABLE members ADD COLUMN photo_key TEXT;

-- Which theme a finished event was judged on ('all', 'exercise', 'on_time', 'medicine', 'improved').
ALTER TABLE event_periods ADD COLUMN theme TEXT NOT NULL DEFAULT 'all';
