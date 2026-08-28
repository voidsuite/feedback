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
