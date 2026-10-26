-- Players' bug reports and ideas, sent from the Feedback form in the game.
-- Reviewed nightly into the design doc's backlog; status moves new -> backlog | dismissed -> done.
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('bug', 'idea')),
  message TEXT NOT NULL,
  contact TEXT,                         -- optional name or email the player chose to give
  context TEXT,                         -- JSON: game date, port, ships, recent notices, screen, browser
  sender TEXT,                          -- hash of the sender's address, only for rate limiting
  status TEXT NOT NULL DEFAULT 'new',   -- new | backlog | dismissed | done
  note TEXT,                            -- our triage note
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER
);
CREATE INDEX IF NOT EXISTS feedback_status ON feedback (status, created_at);
CREATE INDEX IF NOT EXISTS feedback_sender ON feedback (sender, created_at);
