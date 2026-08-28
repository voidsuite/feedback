/**
 * Vault key management — automatic, no user prompts.
 *
 * The Vault Key is a per-user 256-bit key. Its jobs:
 *   - wrap every document key (doc metadata is then readable on any device),
 *   - encrypt the document index at rest.
 *
 * Recovery order:
 *   - signed in: the gateway escrow always wins — it holds the account key
 *     that every device shares (fetched on first use, mirrored into VoidAuth
 *     storage in browser auth mode). The on-device cache is written from it.
 *   - signed out: the localStorage cache, else
 *   - the device key (offline / local-only mode — never leaves the device).
 */

import * as api from "./api"
import { b64UrlToKey, getOrCreateDeviceKey, keyToB64Url } from "./crypto"

const VAULT_CACHE_KEY = "vdocs_vault_key"

export type VaultSource = "escrow" | "device" | "cached"

interface CachedVaultEntry {
  key: CryptoKey
  /** Account the key belongs to (null for legacy caches written pre-tagging). */
  uid: string | null
}

/** Read the cached vault entry, tolerating legacy (untagged) raw-key caches. */
async function readCachedVault(): Promise<CachedVaultEntry | null> {
  const raw = localStorage.getItem(VAULT_CACHE_KEY)
  if (!raw) return null
  // Current format: JSON { uid, key }.
  try {
    const parsed = JSON.parse(raw) as { uid?: unknown; key?: unknown }
    if (typeof parsed.key === "string") {
      try {
        return { key: await b64UrlToKey(parsed.key), uid: typeof parsed.uid === "string" ? parsed.uid : null }
      } catch {
        localStorage.removeItem(VAULT_CACHE_KEY)
        return null
      }
    }
  } catch {
    // Legacy: the raw base64url key with no account association.
    try {
      return { key: await b64UrlToKey(raw), uid: null }
    } catch {
      localStorage.removeItem(VAULT_CACHE_KEY)
    }
  }
  return null
}

export async function getCachedVaultKey(): Promise<CryptoKey | null> {
  return (await readCachedVault())?.key ?? null
}

export function hasCachedVaultKey(): boolean {
  return !!localStorage.getItem(VAULT_CACHE_KEY)
}

export async function cacheVaultKey(key: CryptoKey, userId?: string | null): Promise<void> {
  localStorage.setItem(VAULT_CACHE_KEY, JSON.stringify({ uid: userId ?? null, key: await keyToB64Url(key) }))
}

export function clearVaultCache(): void {
  localStorage.removeItem(VAULT_CACHE_KEY)
}

/**
 * Resolve the vault key.
 *
 * Signed in: always resolve against the gateway escrow — it is the single
 * source of truth for the account's vault key, so every device (PC, phone,
 * …) converges on the same key and can decrypt the shared cloud blob. The
 * local cache is only written, never trusted over the escrow.
 *   - If the escrow was empty and just adopted this device's key, but this
 *     device already has a cached vault key, restore the cached key to the
 *     escrow instead (heals a server-side escrow reset without re-keying).
 *   - On failure (offline / gateway down) fall back to the cached key, then
 *     the device key.
 *
 * Signed out: cached key, else the device key (local-only).
 */
export async function resolveVaultKey(opts?: {
  ignoreCache?: boolean
  signedIn?: boolean
  userId?: string
}): Promise<{
  key: CryptoKey
  source: VaultSource
  /** Real reason the escrow couldn't be reached, when we fell back to a
   *  local key. Lets the UI explain (and the user report) the actual failure
   *  instead of a generic "escrow hasn't resolved". */
  escrowError?: string
} | null> {
  const useEscrow = opts?.signedIn ?? api.authMode !== "offline"
  let escrowError: string | undefined
  if (useEscrow) {
    try {
      // Send the device key along: if the escrow is empty for this user, the
      // gateway adopts it (docs created offline keep working from every new
      // device); if the escrow already has a key, that key comes back and wins.
      const deviceKey = await getOrCreateDeviceKey()
      const { vaultKey: vaultB64, adopted } = await api.unlockVault(await keyToB64Url(deviceKey))
      if (adopted) {
        // The escrow had no key, so this call just seeded it with the device
        // key. If this device already knows a real vault key for this account,
        // restore that instead — otherwise a fresh device could claim the slot
        // and the original device's data would no longer match.
        const cached = await readCachedVault()
        if (cached?.key && (!cached.uid || !opts?.userId || cached.uid === opts.userId)) {
          await api.storeVaultKey(await keyToB64Url(cached.key))
          await cacheVaultKey(cached.key, opts?.userId)
          return { key: cached.key, source: "escrow" }
        }
      }
      const key = await b64UrlToKey(vaultB64)
      await cacheVaultKey(key, opts?.userId)
      return { key, source: "escrow" }
    } catch (err) {
      // Gateway unreachable / session rejected / storage error — fall through
      // to the cache or device key, but remember why so the UI can surface it.
      escrowError = err instanceof Error ? err.message : String(err)
      console.error("[vault] escrow unlock failed, fell back to a local key:", escrowError)
    }
  }

  if (!opts?.ignoreCache) {
    const cached = await getCachedVaultKey()
    if (cached) return { key: cached, source: "cached", escrowError }
  }

  try {
    const deviceKey = await getOrCreateDeviceKey()
    return { key: deviceKey, source: "device", escrowError }
  } catch {
    return null
  }
}

/** Reset the vault, e.g. after signing out. */
export function resetVault(): void {
  clearVaultCache()
}