import { Hono } from "hono"
import config from "../config.js"
import { sessionAuth } from "../middleware/auth.js"

const storage = new Hono()

storage.use("*", sessionAuth)

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

storage.get("/usage", async (c) => {
  const token = c.get("voidAuthAccessToken") as string

  try {
    const res = await fetch(`${config.voidauthUrl}/storage/usage`, {
      headers: authHeaders(token),
    })
    const data = await res.json()
    return c.json(data, res.status as any)
  } catch (e: any) {
    return c.json({ error: e.message || "Proxy error" }, 502)
  }
})

storage.get("/data", async (c) => {
  const token = c.get("voidAuthAccessToken") as string

  try {
    const clientId = c.req.query("client_id") || ""
    const key = c.req.query("key") || ""
    const params = new URLSearchParams()
    if (clientId) params.set("client_id", clientId)
    if (key) params.set("key", key)
    const url = `${config.voidauthUrl}/storage/data?${params}`
    const res = await fetch(url, {
      headers: authHeaders(token),
    })
    const data = await res.json()
    return c.json(data, res.status as any)
  } catch (e: any) {
    return c.json({ error: e.message || "Proxy error" }, 502)
  }
})

storage.post("/data", async (c) => {
  const token = c.get("voidAuthAccessToken") as string

  try {
    const body = await c.req.json()
    const res = await fetch(`${config.voidauthUrl}/storage/data`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(token),
      },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    return c.json(data, res.status as any)
  } catch (e: any) {
    return c.json({ error: e.message || "Proxy error" }, 502)
  }
})

export default storage
