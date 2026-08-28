/**
 * Sync passphrase — held in memory only, never persisted.
 * After a reload the user re-enters it to decrypt cloud data.
 */

let currentPassphrase: string | null = null

const HAS_KEY = "m3il_passphrase_set"

export function hasPassphraseSet(): boolean {
  return localStorage.getItem(HAS_KEY) === "1"
}

export function isPassphraseReady(): boolean {
  return currentPassphrase !== null
}

export function getPassphrase(): string | null {
  return currentPassphrase
}

export function setPassphraseNextTrial(passphrase: string, commit = false): void {
  currentPassphrase = passphrase
  if (commit) localStorage.setItem(HAS_KEY, "1")
}

export function rememberPassphraseSet(): void {
  localStorage.setItem(HAS_KEY, "1")
}

export function clearPassphrase(): void {
  currentPassphrase = null
  localStorage.removeItem(HAS_KEY)
}