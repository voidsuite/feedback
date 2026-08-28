/**
 * App-lock PIN — a UI gate with a PBKDF2 verifier and escalating lockout.
 * It locks the app after inactivity; it does not add a crypto layer.
 */

import { hashPassphrase } from "./crypto"

const PIN_SALT_KEY = "m3il_pin_salt"
const PIN_VERIFIER_KEY = "m3il_pin_verifier"
const PIN_ATTEMPTS_KEY = "m3il_pin_attempts"
const PIN_LOCKED_KEY = "m3il_pin_locked_until"

const SALT_LENGTH = 16

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
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (isLockedOut()) return false

  const saltB64 = localStorage.getItem(PIN_SALT_KEY)
  const storedVerifier = localStorage.getItem(PIN_VERIFIER_KEY)
  if (!saltB64 || !storedVerifier) return false

  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
  const verifier = await hashPassphrase(pin, salt)

  if (verifier === storedVerifier) {
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
  if (!(await verifyPin(pin))) return
  localStorage.removeItem(PIN_SALT_KEY)
  localStorage.removeItem(PIN_VERIFIER_KEY)
  localStorage.removeItem(PIN_ATTEMPTS_KEY)
  localStorage.removeItem(PIN_LOCKED_KEY)
}