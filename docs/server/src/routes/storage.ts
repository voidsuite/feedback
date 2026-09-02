/**
 * /api/storage/* — proxy to the VoidAuth Storage API using the session's
 * access token as a Bearer credential. The browser never sees the token.
 */

import { Hono } from "hono"
import config from "../config.js"
import { sessionAuth } from "../middleware/auth.js"
import { logger } from "../lib/log.js"

const storage = new Hono()

storage.use("*", sessionAuth)

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

function voidauthPath(path: string): string {
  // Strip the /api/storage prefix → /storage/...
  return `${config.voidauthUrl}/storage${path.replace(/^\/api\/storage/, "")}`
}

storage.get("/usage", async (c) => {
  const token = c.get("voidAuthAccessToken")
  try {
    const res = await fetch(voidauthPath(c.req.path), { headers: authHeaders(token) })
    return c.json(await res.json(), res.status as any)
  } catch (err) {
    return c.json({ error: (err as Error).message || "Proxy error" }, 502)
  }
})

storage.get("/data", async (c) => {
  const token = c.get("voidAuthAccessToken")
  const q = c.req.query()
  const params = new URLSearchParams()
  if (q.key) params.set("key", q.key)
  const url = `${voidauthPath(c.req.path)}${params.toString() ? `?${params}` : ""}`
  try {
    const res = await fetch(url, { headers: authHeaders(token) })
    return c.json(await res.json(), res.status as any)
  } catch (err) {
    return c.json({ error: (err as Error).message || "Proxy error" }, 502)
  }
})

storage.post("/data", async (c) => {
  const token = c.get("voidAuthAccessToken")
  try {
    const body = await c.req.json()
    delete body.client_id
    const res = await fetch(voidauthPath(c.req.path), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(body),
    })
    return c.json(await res.json(), res.status as any)
  } catch (err) {
    return c.json({ error: (err as Error).message || "Proxy error" }, 502)
  }
})

storage.delete("/data", async (c) => {
  const token = c.get("voidAuthAccessToken")
  const q = c.req.query()
  const params = new URLSearchParams()
  if (q.key) params.set("key", q.key)
  const url = `${voidauthPath(c.req.path)}${params.toString() ? `?${params}` : ""}`
  try {
    const res = await fetch(url, { method: "DELETE", headers: authHeaders(token) })
    return c.json(await res.json(), res.status as any)
  } catch (err) {
    return c.json({ error: (err as Error).message || "Proxy error" }, 502)
  }
})

// Attachment blobs — proxy /storage/files (GET list, POST upload, DELETE)
storage.get("/files", async (c) => {
  const token = c.get("voidAuthAccessToken")
  const q = c.req.query()
  const params = new URLSearchParams()
  if (q.page) params.set("page", q.page)
  if (q.limit) params.set("limit", q.limit)
  const url = `${voidauthPath(c.req.path)}${params.toString() ? `?${params}` : ""}`
  try {
    const res = await fetch(url, { headers: authHeaders(token) })
    return c.json(await res.json(), res.status as any)
  } catch (err) {
    return c.json({ error: (err as Error).message || "Proxy error" }, 502)
  }
})

storage.post("/files", async (c) => {
  const token = c.get("voidAuthAccessToken")
  try {
    const form = await c.req.formData()
    form.delete("client_id")
    const res = await fetch(voidauthPath(c.req.path), {
      method: "POST",
      headers: authHeaders(token),
      body: form,
    })
    return c.json(await res.json(), res.status as any)
  } catch (err) {
    logger.warn("storage file upload failed", { error: (err as Error).message })
    return c.json({ error: (err as Error).message || "Proxy error" }, 502)
  }
})

storage.delete("/files/:id", async (c) => {
  const token = c.get("voidAuthAccessToken")
  try {
    const res = await fetch(voidauthPath(c.req.path), { method: "DELETE", headers: authHeaders(token) })
    return c.json(await res.json(), res.status as any)
  } catch (err) {
    return c.json({ error: (err as Error).message || "Proxy error" }, 502)
  }
})

export default storage