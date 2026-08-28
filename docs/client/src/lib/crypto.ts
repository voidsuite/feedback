/**
 * Browser crypto for docs — AES-GCM-256 with CryptoKey material.
 *
 * Nothing sensitive leaves the device in plaintext:
 *  - each document has its own random doc key (wrapped under the Vault Key),
 *  - Yjs updates + version snapshots are encrypted with the doc key,
 *  - the Vault Key itself is cached locally and escrowed server-side
 *    (automatic, no passphrases).
 */

const IV_LENGTH = 12
const ENC_ALGO = "AES-GCM"

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToB64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function b64UrlToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/")
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4))
  return base64ToBytes(normalized + pad)
}

// --- Key material helpers ---

/** Generate a random 256-bit AES-GCM key (the per-document / Vault keys). */
export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: ENC_ALGO, length: 256 }, true, ["encrypt", "decrypt"])
}

export async function keyToB64Url(key: CryptoKey): Promise<string> {
  const raw = await crypto.subtle.exportKey("raw", key)
  return bytesToB64Url(new Uint8Array(raw))
}

export async function b64UrlToKey(b64: string): Promise<CryptoKey> {
  const raw = b64UrlToBytes(b64)
  // Extractable: the vault key is re-exported to cache/escrow it. The raw
  // bytes already live in localStorage (vault cache / escrow fetch), so
  // extractability adds no exposure — it only allows re-export in-memory.
  return crypto.subtle.importKey("raw", raw, { name: ENC_ALGO }, true, ["encrypt", "decrypt"])
}

/** Wrapper around a raw 32-byte doc key, delivered via share-link fragments. */
export function randomKeyB64(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32))
  return bytesToB64Url(raw)
}

// --- Encrypt / decrypt with an existing CryptoKey ---

export async function encryptBytesWithKey(
  data: Uint8Array<ArrayBufferLike>,
  key: CryptoKey
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: ENC_ALGO, iv }, key, data as BufferSource))
  const out = new Uint8Array(iv.length + ct.length)
  out.set(iv, 0)
  out.set(ct, iv.length)
  return out
}

export async function decryptBytesWithKey(
  payload: Uint8Array<ArrayBufferLike>,
  key: CryptoKey
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = payload.slice(0, IV_LENGTH)
  const ct = payload.slice(IV_LENGTH)
  const plain = await crypto.subtle.decrypt({ name: ENC_ALGO, iv }, key, ct as BufferSource)
  return new Uint8Array(plain)
}

export async function encryptStringWithKey(data: string, key: CryptoKey): Promise<string> {
  const bytes = new TextEncoder().encode(data)
  const enc = await encryptBytesWithKey(bytes, key)
  return bytesToBase64(enc)
}

export async function decryptStringWithKey(payload: string, key: CryptoKey): Promise<string> {
  const enc = base64ToBytes(payload)
  const plain = await decryptBytesWithKey(enc, key)
  return new TextDecoder().decode(plain)
}

// --- Share links: doc keys travel in the URL fragment (never to a server) ---

export function buildShareFragment(docKey: string): string {
  return `#k=${docKey}`
}

/** Extract the doc key from a share link fragment. Returns null when absent. */
export function readShareFragment(hash: string): string | null {
  if (!hash.startsWith("#k=")) return null
  const value = hash.slice(3)
  return value.length >= 16 ? value : null
}

// --- Device key (local-only encryption, never synced; offline Vault) ---

const DEVICE_KEY_NAME = "vdocs_device_key"

export async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  try {
    const raw = localStorage.getItem(DEVICE_KEY_NAME)
    if (raw) {
      const jwk = JSON.parse(raw)
      // Extractable: the device key is sent to the vault escrow on sign-in
      // (keyToB64Url). The JWK with the same raw bytes is already stored in
      // localStorage, so extractability only permits the needed re-export.
      return await crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, ["encrypt", "decrypt"])
    }
  } catch {
    /* regenerate */
  }
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
  const jwk = await crypto.subtle.exportKey("jwk", key)
  localStorage.setItem(DEVICE_KEY_NAME, JSON.stringify(jwk))
  return key
}

export function hasDeviceKey(): boolean {
  return !!localStorage.getItem(DEVICE_KEY_NAME)
}

// --- Misc ---

export function randomId(): string {
  const arr = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("")
}

/** Base64 encode arbitrary text (safe for URL query encoding). */
export function encodeTextToB64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value))
}

export function decodeB64ToText(value: string): string {
  return new TextDecoder().decode(base64ToBytes(value))
}