import {
  encrypt, decrypt, getOrCreateDeviceKey, hasDeviceKey, clearDeviceKey,
  hashPassphrase, verifyPassphrase, encryptWithDeviceKey, decryptWithDeviceKey,
} from "@/lib/crypto"

const PIN_SALT_KEY = "ava_pin_salt"
const PIN_VERIFIER_KEY = "ava_pin_verifier"
const PIN_ACCOUNTS_KEY = "ava_accounts_enc"
const DEVICE_ACCOUNTS_KEY = "ava_accounts_ed"
const PIN_ATTEMPTS_KEY = "ava_pin_attempts"
const PIN_LOCKED_KEY = "ava_pin_locked_until"
const PLAIN_ACCOUNTS_KEY = "ava_accounts"

const SALT_LENGTH = 16

async function hashPinLegacy(pin: string, salt: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pin))
  const combined = new Uint8Array(salt.length + new Uint8Array(hash).length)
  combined.set(salt, 0)
  combined.set(new Uint8Array(hash), salt.length)
  const finalHash = await crypto.subtle.digest("SHA-256", combined)
  return btoa(String.fromCharCode(...new Uint8Array(finalHash)))
}

// --- Device key ---

export { hasDeviceKey, clearDeviceKey }

// --- PIN ---

export function hasPin(): boolean {
  return !!localStorage.getItem(PIN_VERIFIER_KEY)
}

export function isLockedOut(): boolean {
  const until = localStorage.getItem(PIN_LOCKED_KEY)
  if (!until) return false
  return Date.now() < parseInt(until, 10)
}

export function getLockoutSeconds(): number {
  const until = localStorage.getItem(PIN_LOCKED_KEY)
  if (!until) return 0
  return Math.max(0, Math.ceil((parseInt(until, 10) - Date.now()) / 1000))
}

export async function setPin(pin: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const verifier = await hashPassphrase(pin, salt)
  localStorage.setItem(PIN_SALT_KEY, btoa(String.fromCharCode(...salt)))
  localStorage.setItem(PIN_VERIFIER_KEY, verifier)
  localStorage.removeItem(PIN_ATTEMPTS_KEY)
  localStorage.removeItem(PIN_LOCKED_KEY)
  localStorage.removeItem("ava_pin")
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (isLockedOut()) return false

  const saltB64 = localStorage.getItem(PIN_SALT_KEY)
  const storedVerifier = localStorage.getItem(PIN_VERIFIER_KEY)
  if (!saltB64 || !storedVerifier) return false

  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0))

  const verifier = await hashPassphrase(pin, salt)
  if (verifier === storedVerifier) {
    localStorage.removeItem(PIN_ATTEMPTS_KEY)
    localStorage.removeItem(PIN_LOCKED_KEY)
    return true
  }

  // Try legacy SHA-256 verifier (migration)
  const legacyVerifier = await hashPinLegacy(pin, salt)
  if (legacyVerifier === storedVerifier) {
    localStorage.setItem(PIN_VERIFIER_KEY, verifier)
    localStorage.removeItem(PIN_ATTEMPTS_KEY)
    localStorage.removeItem(PIN_LOCKED_KEY)
    return true
  }

  const attempts = parseInt(localStorage.getItem(PIN_ATTEMPTS_KEY) || "0", 10) + 1
  localStorage.setItem(PIN_ATTEMPTS_KEY, String(attempts))

  const lockout = Math.min(30 * Math.pow(2, attempts - 1), 3600) * 1000
  localStorage.setItem(PIN_LOCKED_KEY, String(Date.now() + lockout))

  return false
}

export async function clearPin(pin: string): Promise<void> {
  if (!await verifyPin(pin)) return
  localStorage.removeItem(PIN_SALT_KEY)
  localStorage.removeItem(PIN_VERIFIER_KEY)
  localStorage.removeItem(PIN_ATTEMPTS_KEY)
  localStorage.removeItem(PIN_LOCKED_KEY)
  localStorage.removeItem(PIN_ACCOUNTS_KEY)
  localStorage.removeItem("ava_locked")
  localStorage.removeItem("ava_pin")
}

// --- PIN-based encrypt/decrypt ---

export async function encryptAccounts(accounts: any[], pin: string): Promise<void> {
  const encrypted = await encrypt(JSON.stringify(accounts), pin)
  localStorage.setItem(PIN_ACCOUNTS_KEY, encrypted)
  localStorage.removeItem(DEVICE_ACCOUNTS_KEY)
  localStorage.removeItem(PLAIN_ACCOUNTS_KEY)
  clearDeviceKey()
}

export async function decryptAccounts(pin: string): Promise<any[] | null> {
  const raw = localStorage.getItem(PIN_ACCOUNTS_KEY)
  if (!raw) return null

  try {
    const decrypted = await decrypt(raw, pin)
    return JSON.parse(decrypted)
  } catch {
    return null
  }
}

// --- Device-key based encrypt/decrypt ---

export async function encryptAccountsDevice(accounts: any[]): Promise<void> {
  const encrypted = await encryptWithDeviceKey(JSON.stringify(accounts))
  localStorage.setItem(DEVICE_ACCOUNTS_KEY, encrypted)
  localStorage.removeItem(PIN_ACCOUNTS_KEY)
  localStorage.removeItem(PLAIN_ACCOUNTS_KEY)
}

export async function decryptAccountsDevice(): Promise<any[] | null> {
  const raw = localStorage.getItem(DEVICE_ACCOUNTS_KEY)
  if (!raw) return null

  try {
    const decrypted = await decryptWithDeviceKey(raw)
    return decrypted ? JSON.parse(decrypted) : null
  } catch {
    return null
  }
}

export function hasEncryptedAccounts(): boolean {
  return !!localStorage.getItem(PIN_ACCOUNTS_KEY)
}

export function hasDeviceEncryptedAccounts(): boolean {
  return !!localStorage.getItem(DEVICE_ACCOUNTS_KEY)
}

// --- Plaintext legacy ---

export function hasPlainAccounts(): boolean {
  return !!localStorage.getItem(PLAIN_ACCOUNTS_KEY)
}

export function loadPlainAccounts(): any[] {
  try {
    return JSON.parse(localStorage.getItem(PLAIN_ACCOUNTS_KEY) || "[]")
  } catch {
    return []
  }
}

// --- General-purpose encrypt/decrypt (passphrase) ---

export async function encryptData(data: string, passphrase: string): Promise<string> {
  return encrypt(data, passphrase)
}

export async function decryptData(encrypted: string, passphrase: string): Promise<string | null> {
  try {
    return await decrypt(encrypted, passphrase)
  } catch {
    return null
  }
}

export function clearEncryptedAccounts(): void {
  localStorage.removeItem(PIN_ACCOUNTS_KEY)
  localStorage.removeItem(DEVICE_ACCOUNTS_KEY)
}
