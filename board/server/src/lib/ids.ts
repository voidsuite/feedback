/**
 * ID + ordering helpers.
 */

import { randomUUID } from "node:crypto"

/** Short random id (12 hex chars via crypto subprocess-free randomUUID). */
export function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 12)}`
}

export function newToken(length = 32): string {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Buffer.from(arr).toString("base64url")
}

export function generateInviteToken(): string {
  return newToken(24)
}

/**
 * Fractional-index-free ordering: pass the integer slot an entity should
 * occupy and the list of existing positions; returns the position to store.
 * We reindex whole parents on move instead (see reindex helpers), so this is
 * just a convenience for appending.
 */
export function nextPosition(existing: number[]): number {
  return existing.length ? Math.max(...existing) + 1 : 0
}