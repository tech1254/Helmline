-- The play log: what players do, for testing and tuning (switched off in More, Play log).
-- One row per batch the game sends: up to a few hundred events as JSON. `run` identifies one
-- game (a save) from its first day; `device` is a random id kept by the browser; `account` is
-- the account name when signed in.
CREATE TABLE IF NOT EXISTS playlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device TEXT NOT NULL,
  account TEXT,
  run TEXT NOT NULL,
  first_day REAL,
  last_day REAL,
  n INTEGER NOT NULL,
  events TEXT NOT NULL,                 -- JSON: [{ t, day, kind, ... }]
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS playlog_run ON playlog (run, created_at);
CREATE INDEX IF NOT EXISTS playlog_device ON playlog (device, created_at);
CREATE INDEX IF NOT EXISTS playlog_account ON playlog (account, created_at);
