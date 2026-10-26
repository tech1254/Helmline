-- Cloud saves. `id` is a SHA-256 hash of the player's save code; the code itself is never stored.
CREATE TABLE IF NOT EXISTS saves (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  game_day REAL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
