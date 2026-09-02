-- Void Feedback schema (SQLite).
-- ids are random hex/base62 strings, timestamps are epoch milliseconds.

CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,            -- VoidAuth subject id
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  picture      TEXT,
  role         TEXT NOT NULL DEFAULT 'user', -- mirrored from VoidAuth (user | admin)
  last_seen_at INTEGER DEFAULT 0,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id               TEXT PRIMARY KEY,          -- random session id (httpOnly cookie)
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token     TEXT NOT NULL,             -- VoidAuth tokens, server-side only
  refresh_token    TEXT NOT NULL DEFAULT '',
  expires_at       INTEGER NOT NULL,
  keep_me_logged_in INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL
);

-- In-flight OAuth login attempts (PKCE verifiers). Persisted instead of kept
-- in memory so a gateway restart mid-login doesn't invalidate the flow.
CREATE TABLE IF NOT EXISTS pkce_states (
  state      TEXT PRIMARY KEY,             -- the OAuth state bound to the browser cookie
  verifier   TEXT NOT NULL,                -- PKCE code_verifier (consumed once)
  expires_at INTEGER NOT NULL,             -- epoch ms
  created_at INTEGER NOT NULL
);

-- Feedback submissions. type ∈ question | feature | bug | support.
-- status ∈ open | in_review | planned | in_progress | answered | shipped | closed.
CREATE TABLE IF NOT EXISTS feedback_threads (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL DEFAULT 'question',
  source_app   TEXT,                         -- the ?source=<app> slug, or NULL
  author_id    TEXT NOT NULL REFERENCES users(id),
  title        TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'open',
  priority     TEXT NOT NULL DEFAULT 'medium', -- low | medium | high | urgent
  assignee_id  TEXT REFERENCES users(id) ON DELETE SET NULL,
  is_public    INTEGER NOT NULL DEFAULT 0,     -- visible on the public roadmap
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS feedback_messages (
  id           TEXT PRIMARY KEY,
  thread_id    TEXT NOT NULL REFERENCES feedback_threads(id) ON DELETE CASCADE,
  author_id    TEXT NOT NULL REFERENCES users(id),
  author_role  TEXT NOT NULL DEFAULT 'user', -- user | admin | system
  body_markdown TEXT NOT NULL,
  is_internal  INTEGER NOT NULL DEFAULT 0,   -- admin-only note, hidden from users
  created_at   INTEGER NOT NULL
);

-- Upvotes (feature requests / questions). One per user per thread.
CREATE TABLE IF NOT EXISTS feedback_votes (
  thread_id TEXT NOT NULL REFERENCES feedback_threads(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (thread_id, user_id)
);

-- Admin-configured notification sinks.
CREATE TABLE IF NOT EXISTS notification_targets (
  id        TEXT PRIMARY KEY,
  type      TEXT NOT NULL,                  -- discord | slack | telegram | email | webhook
  name      TEXT NOT NULL,
  config    TEXT NOT NULL DEFAULT '{}',      -- JSON: webhook url / token+chat / email / etc
  enabled   INTEGER NOT NULL DEFAULT 1,
  events    TEXT NOT NULL DEFAULT '["new_feedback","new_reply","status_change","assigned"]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_log (
  id         TEXT PRIMARY KEY,
  target_id  TEXT REFERENCES notification_targets(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,
  thread_id  TEXT,
  ok         INTEGER NOT NULL DEFAULT 1,
  error      TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pkce_expiry ON pkce_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_threads_type ON feedback_threads(type, status);
CREATE INDEX IF NOT EXISTS idx_threads_source ON feedback_threads(source_app);
CREATE INDEX IF NOT EXISTS idx_threads_author ON feedback_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_threads_assignee ON feedback_threads(assignee_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON feedback_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_thread ON feedback_votes(thread_id);
CREATE INDEX IF NOT EXISTS idx_targets_type ON notification_targets(type);

-- Image attachments on threads and messages.
CREATE TABLE IF NOT EXISTS feedback_attachments (
  id           TEXT PRIMARY KEY,             -- attachment id
  thread_id    TEXT REFERENCES feedback_threads(id) ON DELETE CASCADE,
  message_id   TEXT REFERENCES feedback_messages(id) ON DELETE CASCADE,
  filename     TEXT NOT NULL,                -- original filename
  content_type TEXT NOT NULL,               -- mime type
  size_bytes   INTEGER NOT NULL,            -- file size
  thumb_url    TEXT,                         -- thumbnail (for images)
  url          TEXT NOT NULL,                -- relative url to serve the file
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_thread ON feedback_attachments(thread_id);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON feedback_attachments(message_id);
