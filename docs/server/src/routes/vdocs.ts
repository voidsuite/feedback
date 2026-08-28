/**
 * /api/vdocs/* — docs-specific gateway endpoints.
 *
 * POST /api/vdocs/unlock — returns the caller's Vault Key. Session-authenticated;
 * the key is delivered only over an authenticated call and cached client-side.
 *
 * Key reconciliation across devices:
 *   - If the escrow already has a key for this user, that key is returned
 *     (whatever the device sent), so every device converges on one key.
 *   - Otherwise the device's own key is adopted and escrowed — this is the
 *     "offline upgrade": docs first created with a local device key become
 *     portable to other devices without re-encrypting (the vault and device
 *     keys are identical, so old blobs keep decrypting).
 *   - If no key is provided at all, a fresh random one is minted (fallback).
 *   - `adopted: true` in the response means the escrow was empty just now and
 *     this call seeded it — the client can restore a previously cached key
 *     via /store instead of letting a fresh device claim the slot.
 *
 * POST /api/vdocs/store — overwrites this user's escrow key. Used to restore a
 * known-good cached key after a server-side escrow reset.
 */

import { Hono } from "hono"
import { sessionAuth, rateLimit } from "../middleware/auth.js"
import { fromBase64Url, getVaultKey, mintVaultKey, storeVaultKey, toBase64Url } from "../lib/escrow.js"
import { logger } from "../lib/log.js"

const vdocs = new Hono()

vdocs.use("*", rateLimit)
vdocs.use("*", sessionAuth)

vdocs.post("/unlock", async (c) => {
  const user = c.get("sessionUser")
  try {
    const existing = await getVaultKey(user.id)
    if (existing) {
      // The escrow already knows this user's vault key — always return it,
      // so every device converges on the same key (whatever the device sent).
      return c.json({ vaultKey: toBase64Url(existing), adopted: false })
    }
    const body = await c.req.json().catch(() => null)
    const vaultKey = typeof body?.vaultKey === "string" ? body.vaultKey : null
    if (vaultKey) {
      // Adopt the device's vault key so its existing encrypted data stays
      // readable from every future device.
      const key = fromBase64Url(vaultKey)
      await storeVaultKey(user.id, key)
      logger.info("adopted device vault key", { userId: user.id })
      return c.json({ vaultKey: toBase64Url(key), adopted: true })
    }
    const key = await mintVaultKey(user.id)
    return c.json({ vaultKey: toBase64Url(key), adopted: true })
  } catch (err) {
    logger.error("vault unlock failed", { error: (err as Error).message })
    return c.json({ error: "Could not unlock vault" }, 500)
  }
})

// Restore a specific vault key to the escrow. Used when the escrow was reset
// server-side but a device still holds the correct cached key — re-seeding it
// keeps the account key stable instead of re-keying the vault.
vdocs.post("/store", async (c) => {
  const user = c.get("sessionUser")
  try {
    const body = await c.req.json().catch(() => null)
    const vaultKey = typeof body?.vaultKey === "string" ? body.vaultKey : null
    if (!vaultKey) return c.json({ error: "vaultKey is required" }, 400)
    const key = fromBase64Url(vaultKey)
    await storeVaultKey(user.id, key)
    logger.info("vault key restored to escrow", { userId: user.id })
    return c.json({ ok: true })
  } catch (err) {
    logger.error("vault store failed", { error: (err as Error).message })
    return c.json({ error: "Could not store vault key" }, 500)
  }
})

export default vdocs
