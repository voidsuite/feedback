import { getPin } from "@/lib/pin-state"
import { hasPin, encryptData, decryptData } from "@/lib/encrypted-storage"

const PASS_KEY_NAME = "ava_ep"
const PASS_VAL_NAME = "ava_ev"

async function getOrCreateKey(): Promise<CryptoKey> {
  try {
    const raw = localStorage.getItem(PASS_KEY_NAME)
    if (raw) {
      const jwk = JSON.parse(raw)
      return await crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
    }
  } catch {}

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
  const jwk = await crypto.subtle.exportKey("jwk", key)
  localStorage.setItem(PASS_KEY_NAME, JSON.stringify(jwk))
  return key
}

export async function setPassphrase(p: string): Promise<void> {
  const pin = getPin()
  if (pin && hasPin()) {
    const encrypted = await encryptData(p, pin)
    localStorage.setItem(PASS_VAL_NAME, encrypted)
    localStorage.removeItem(PASS_KEY_NAME)
  } else {
    const key = await getOrCreateKey()
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encoded = new TextEncoder().encode(p)
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded)
    const stored = btoa(String.fromCharCode(...new Uint8Array(ciphertext))) + ":" + btoa(String.fromCharCode(...iv))
    localStorage.setItem(PASS_VAL_NAME, stored)
  }
}

export async function getPassphrase(): Promise<string | null> {
  const stored = localStorage.getItem(PASS_VAL_NAME)
  if (!stored) return null

  const pin = getPin()
  if (pin && hasPin()) {
    return decryptData(stored, pin)
  }

  try {
    const [ct, ivStr] = stored.split(":")
    if (!ct || !ivStr) {
      return null
    }
    const ciphertext = new Uint8Array(atob(ct).split("").map(c => c.charCodeAt(0)))
    const iv = new Uint8Array(atob(ivStr).split("").map(c => c.charCodeAt(0)))
    const key = await getOrCreateKey()
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext)
    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

export async function clearPassphrase(): Promise<void> {
  localStorage.removeItem(PASS_VAL_NAME)
  localStorage.removeItem(PASS_KEY_NAME)
}
