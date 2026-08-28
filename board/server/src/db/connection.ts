/**
 * SQLite connection (bun:sqlite). The database lives at DATA_DIR/voidboard.db
 * so data persists across restarts — boards are always there after a reboot.
 *
 * The schema is applied synchronously at module load so every module that
 * imports `db` can prepare statements immediately (import order is safe).
 */

import { Database } from "bun:sqlite"
import { mkdirSync, readFileSync } from "node:fs"
import path from "node:path"
import config from "../config.js"

mkdirSync(config.dataDir, { recursive: true })

export const db = new Database(path.join(config.dataDir, "voidboard.db"))
db.exec("PRAGMA journal_mode = WAL;")
db.exec("PRAGMA foreign_keys = ON;")

// Apply schema.sql — idempotent (all statements use IF NOT EXISTS).
const schema = readFileSync(path.join(import.meta.dir, "schema.sql"), "utf8")
db.exec(schema)

// One-off column migrations for databases created before a column existed.
// `CREATE TABLE IF NOT EXISTS` won't add columns, so patch them here.
const commentCols = db.query("PRAGMA table_info(comments)").all() as { name: string }[]
if (!commentCols.some((c) => c.name === "parent_id")) {
  db.exec("ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE;")
}
db.exec("CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);")

// Avatar columns for workspaces and boards (same pattern — CREATE TABLE IF
// NOT EXISTS won't add columns to databases created before they existed).
const workspaceCols = db.query("PRAGMA table_info(workspaces)").all() as { name: string }[]
if (!workspaceCols.some((c) => c.name === "avatar_file_id")) {
  db.exec("ALTER TABLE workspaces ADD COLUMN avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL;")
}
const boardCols = db.query("PRAGMA table_info(boards)").all() as { name: string }[]
if (!boardCols.some((c) => c.name === "avatar_file_id")) {
  db.exec("ALTER TABLE boards ADD COLUMN avatar_file_id TEXT REFERENCES files(id) ON DELETE SET NULL;")
}

db.exec("PRAGMA optimize;")

export function now(): number {
  return Date.now()
}