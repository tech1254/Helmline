-- Usage: who plays, from where, for how long. One row per browser per day; no personal details
-- (a random id kept in the browser, where the game was opened from, phone or not).
CREATE TABLE IF NOT EXISTS usage (
  day TEXT NOT NULL,            -- UTC date, YYYY-MM-DD
  device TEXT NOT NULL,         -- the random id the game keeps in this browser
  source TEXT NOT NULL,         -- 'itch' | 'direct' | 'other'
  ref TEXT,                     -- the site that sent them, by host name
  mobile INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  minutes INTEGER NOT NULL DEFAULT 0,
  first_ts INTEGER NOT NULL,
  last_ts INTEGER NOT NULL,
  PRIMARY KEY (day, device)
);
CREATE INDEX IF NOT EXISTS usage_day ON usage (day);
CREATE TABLE IF NOT EXISTS devices (
  device TEXT PRIMARY KEY,
  first_day TEXT NOT NULL,
  source TEXT NOT NULL,
  ref TEXT
);
CREATE INDEX IF NOT EXISTS devices_first ON devices (first_day);
