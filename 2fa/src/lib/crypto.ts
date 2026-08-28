const ENC_ALGO = 'AES-GCM'
const KEY_DERIVE_ALGO = 'PBKDF2'
const KEY_LENGTH = 256
const SALT_LENGTH = 16
const IV_LENGTH = 12
const ITERATIONS = 100_000

function getEncoder(): TextEncoder { return new TextEncoder() }
function getDecoder(): TextDecoder { return new TextDecoder() }

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw', getEncoder().encode(passphrase), KEY_DERIVE_ALGO, false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: KEY_DERIVE_ALGO, salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: ENC_ALGO, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encrypt(data: string, passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: ENC_ALGO, iv },
    key,
    getEncoder().encode(data)
  )
  const combined = new Uint8Array(salt.length + iv.length + new Uint8Array(ciphertext).length)
  combined.set(salt, 0)
  combined.set(iv, salt.length)
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decrypt(encrypted: string, passphrase: string): Promise<string> {
  const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
  const salt = combined.slice(0, SALT_LENGTH)
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH)
  const key = await deriveKey(passphrase, salt)
  const plaintext = await crypto.subtle.decrypt(
    { name: ENC_ALGO, iv },
    key,
    ciphertext
  )
  return getDecoder().decode(plaintext)
}

export function generatePassphrase(length = 6): string {
  const words = [
    'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf',
    'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november',
    'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango', 'uniform',
    'victor', 'whiskey', 'xray', 'yankee', 'zulu', 'aurora', 'breeze',
    'cloud', 'dawn', 'ember', 'frost', 'glacier', 'harbor', 'iris',
    'jade', 'knoll', 'lunar', 'meadow', 'nova', 'ocean', 'pearl',
  ]
  const selected: string[] = []
  for (let i = 0; i < length; i++) {
    const idx = crypto.getRandomValues(new Uint32Array(1))[0] % words.length
    selected.push(words[idx])
  }
  return selected.join('-')
}

// --- Device key ---

const DEVICE_KEY_NAME = 'ava_device_key'

export async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  try {
    const raw = localStorage.getItem(DEVICE_KEY_NAME)
    if (raw) {
      const jwk = JSON.parse(raw)
      return await crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
    }
  } catch {}

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
  const jwk = await crypto.subtle.exportKey('jwk', key)
  localStorage.setItem(DEVICE_KEY_NAME, JSON.stringify(jwk))
  return key
}

export function hasDeviceKey(): boolean {
  return !!localStorage.getItem(DEVICE_KEY_NAME)
}

export function clearDeviceKey(): void {
  localStorage.removeItem(DEVICE_KEY_NAME)
}

export async function encryptWithDeviceKey(data: string): Promise<string> {
  const key = await getOrCreateDeviceKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    getEncoder().encode(data)
  )
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return btoa(String.fromCharCode(...combined))
}

export async function decryptWithDeviceKey(encrypted: string): Promise<string | null> {
  try {
    const key = await getOrCreateDeviceKey()
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
    const iv = combined.slice(0, IV_LENGTH)
    const ciphertext = combined.slice(IV_LENGTH)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
    return getDecoder().decode(decrypted)
  } catch {
    return null
  }
}

// --- Passphrase hashing (for PIN verification) ---

export async function hashPassphrase(passphrase: string, salt: Uint8Array): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    'raw', getEncoder().encode(passphrase), KEY_DERIVE_ALGO, false, ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: KEY_DERIVE_ALGO, salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256
  )
  return btoa(String.fromCharCode(...new Uint8Array(bits)))
}

export async function verifyPassphrase(passphrase: string, salt: Uint8Array, hash: string): Promise<boolean> {
  const computed = await hashPassphrase(passphrase, salt)
  return computed === hash
}
