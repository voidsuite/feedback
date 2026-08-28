-- VoidBoard schema (SQLite).
-- Comment conventions: ids are random hex/base62 strings, timestamps are
-- epoch milliseconds, positions are integers within their parent.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,            -- VoidAuth subject id
  email       TEXT NOT NULL,
  name        TEXT NOT NULL,
  picture     TEXT,
  last_seen_at INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,          -- random session id (httpOnly cookie)
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token  TEXT NOT NULL,             -- VoidAuth tokens, server-side only
  refresh_token TEXT NOT NULL DEFAULT '',
  expires_at    INTEGER NOT NULL,
  keep_me_logged_in INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL
);

-- In-flight OAuth login attempts (PKCE verifiers). Persisted instead of kept
-- in memory so a gateway restart mid-login doesn't invalidate the flow.
CREATE TABLE IF NOT EXISTS pkce_states (
  state      TEXT PRIMARY KEY,             -- the OAuth state bound to the browser cookie
  verifier   TEXT NOT NULL,                -- PKCE code_verifier (consumed once)
  expires_at INTEGER NOT NULL,             -- epoch ms
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  owner_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  invite_token  TEXT,
  invite_enabled INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member',  -- owner | admin | member
  joined_at    INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  color        TEXT NOT NULL DEFAULT '#a8a29e',
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id   TEXT REFERENCES projects(id) ON DELETE SET NULL,
  avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  name         TEXT NOT NULL,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS columns (
  id        TEXT PRIMARY KEY,
  board_id  TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  position  INTEGER NOT NULL DEFAULT 0,
  wip_limit INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id           TEXT PRIMARY KEY,
  board_id     TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  column_id    TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  priority     TEXT NOT NULL DEFAULT 'none',  -- none | low | medium | high | urgent
  due_date     INTEGER,
  position     INTEGER NOT NULL DEFAULT 0,
  cover_file_id TEXT REFERENCES files(id) ON DELETE SET NULL,
  created_by   TEXT NOT NULL REFERENCES users(id),
  updated_by   TEXT NOT NULL REFERENCES users(id),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS labels (
  id        TEXT PRIMARY KEY,
  board_id  TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  color     TEXT NOT NULL DEFAULT '#a8a29e',
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS item_labels (
  item_id  TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, label_id)
);

CREATE TABLE IF NOT EXISTS item_assignees (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, user_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  parent_id  TEXT REFERENCES comments(id) ON DELETE CASCADE,  -- NULL = top-level, else a reply
  body       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS checklist_items (
  id        TEXT PRIMARY KEY,
  item_id   TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  text      TEXT NOT NULL,
  done      INTEGER NOT NULL DEFAULT 0,
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS files (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_id     TEXT NOT NULL REFERENCES users(id),
  name         TEXT NOT NULL,
  mime         TEXT NOT NULL,
  size         INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS item_activity (
  id         TEXT PRIMARY KEY,
  item_id    TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  actor_id   TEXT NOT NULL REFERENCES users(id),
  action     TEXT NOT NULL,
  data_json  TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_pkce_expiry ON pkce_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_boards_workspace ON boards(workspace_id, position);
CREATE INDEX IF NOT EXISTS idx_items_board ON items(board_id, position);
CREATE INDEX IF NOT EXISTS idx_columns_board ON columns(board_id, position);
CREATE INDEX IF NOT EXISTS idx_comments_item ON comments(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activity_item ON item_activity(item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_files_workspace ON files(workspace_id);