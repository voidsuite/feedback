/**
 * Vault-key escrow — the "secure factor" that makes cross-device key sync
 * fully automatic.
 *
 * On the first /api/vdocs/unlock for a user the gateway mints a random
 * 256-bit Vault Key, escrows it, and returns it to that one authenticated
 * session. Every later sign-in on any device fetches the same key — no
 * passphrase, no prompts.
 *
 * Honest tradeoff (documented in the README): the gateway operator can
 * unwrap the escrow. It never sees document content — relay frames and
 * cloud snapshots are encrypted with per-document keys that only travel in
 * share-link fragments. This is the price of zero-friction key sync.
 *
 * At rest the escrow is AES-GCM encrypted with a server secret (from
 * SESSION_SECRET, or a stable secret generated on first boot and stored in
 * the same database), derived per user so a leaked .db row is not enough.
 */

import { Database } from "bun:sqlite"
import { existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import config from "../config.js"
import { logger } from "./log.js"

const VAULT_KEY_BYTES = 32

let db: Database | null = null

function getDb(): Database {
  if (db) return db
  const dir = path.resolve(config.dataDir)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  db = new Database(path.join(dir, "vdocs.db"))
  db.run(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)`)
  db.run(
    `CREATE TABLE IF NOT EXISTS escrow (
       user_id   TEXT PRIMARY KEY,
       vault_key BLOB NOT NULL,
       created_at INTEGER NOT NULL
     )`
  )
  return db
}

/** Stable server secret for at-rest encryption (SESSION_SECRET or generated). */
function serverSecret(): string {
  if (config.sessionSecret) return config.sessionSecret
  const d = getDb()
  const row = d.query("SELECT v FROM meta WHERE k = 'secret'").get() as { v: string } | null
  if (row) return row.v
  const secret = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")
  d.query("INSERT OR REPLACE INTO meta (k, v) VALUES ('secret', ?)").run(secret)
  return secret
}

async function deriveWrapKey(userId: string): Promise<CryptoKey> {
  const material = `${serverSecret()}::${userId}`
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material))
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
}

async function wrap(raw: Uint8Array<ArrayBuffer>, userId: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await deriveWrapKey(userId)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, raw))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv, 0)
  out.set(ct, iv.length)
  return out
}

async function unwrap(wrapped: Uint8Array<ArrayBuffer>, userId: string): Promise<Uint8Array<ArrayBuffer>> {
  const key = await deriveWrapKey(userId)
  const iv = wrapped.slice(0, 12)
  const ct = wrapped.slice(12)
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct))
}

/** Returns the user's existing vault key, or null. */
export async function getVaultKey(userId: string): Promise<Uint8Array<ArrayBuffer> | null> {
  const row = getDb()
    .query("SELECT vault_key FROM escrow WHERE user_id = ?")
    .get(userId) as { vault_key: Uint8Array } | null
  if (!row) return null
  try {
    return await unwrap(row.vault_key as Uint8Array<ArrayBuffer>, userId)
  } catch {
    return null
  }
}

/** Mints a fresh vault key for the user and persists it (returns it). */
export async function mintVaultKey(userId: string): Promise<Uint8Array<ArrayBuffer>> {
  const existing = await getVaultKey(userId)
  if (existing) return existing
  const raw = crypto.getRandomValues(new Uint8Array(VAULT_KEY_BYTES))
  const wrapped = await wrap(raw, userId)
  getDb().query("INSERT OR REPLACE INTO escrow (user_id, vault_key, created_at) VALUES (?, ?, ?)").run(
    userId,
    wrapped,
    Date.now()
  )
  logger.info("minted vault key", { userId })
  return raw
}

/** Reverse: store a vault key that was generated client-side (offline upgrade). */
export async function storeVaultKey(userId: string, raw: Uint8Array<ArrayBuffer>): Promise<void> {
  const wrapped = await wrap(raw, userId)
  getDb().query("INSERT OR REPLACE INTO escrow (user_id, vault_key, created_at) VALUES (?, ?, ?)").run(
    userId,
    wrapped,
    Date.now()
  )
}

export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url")
}

export function fromBase64Url(b64: string): Uint8Array<ArrayBuffer> {
  const buf = Buffer.from(b64, "base64url")
  return new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
}
