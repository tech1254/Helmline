-- Accounts: a name and a password (PBKDF2, salted; the password itself is never stored), and
-- settings switched on per account (`flags`, JSON: for example {"timeScale": 4}).
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  flags TEXT NOT NULL DEFAULT '{}',
  failed INTEGER NOT NULL DEFAULT 0,      -- wrong passwords in a row, to slow down guessing
  failed_at INTEGER,
  created_at INTEGER NOT NULL
);
-- Signed-in devices. `id` is a SHA-256 hash of the session token the device keeps.
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_account ON sessions (account_id);
-- An account's saves are rows of `saves` too (with a random id, not a code), named by the player.
ALTER TABLE saves ADD COLUMN account_id INTEGER;
ALTER TABLE saves ADD COLUMN name TEXT;
CREATE INDEX IF NOT EXISTS saves_account ON saves (account_id, updated_at);
