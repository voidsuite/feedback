import { getCookie } from "hono/cookie"
import type { Context, Next } from "hono"
import { getSession, getCookieName } from "../lib/session.js"

declare module "hono" {
  interface ContextVariableMap {
    voidAuthAccessToken: string
    sessionUser: { id: string; name: string; email: string }
  }
}

export async function sessionAuth(c: Context, next: Next) {
  const sessionId = getCookie(c, getCookieName())
  if (!sessionId) return c.json({ error: "Unauthorized" }, 401)

  const session = getSession(sessionId)
  if (!session) {
    return c.json({ error: "Session expired" }, 401)
  }

  if (!session.accessToken) {
    return c.json({ error: "Not authenticated with VoidAuth" }, 401)
  }

  c.set("voidAuthAccessToken", session.accessToken)
  c.set("sessionUser", session.user)
  await next()
}

export async function optionalSession(c: Context, next: Next) {
  const sessionId = getCookie(c, getCookieName())
  if (sessionId) {
    const session = getSession(sessionId)
    if (session && Date.now() < session.expiresAt) {
      if (session.accessToken) {
        c.set("voidAuthAccessToken", session.accessToken)
        c.set("sessionUser", session.user)
      }
    }
  }
  await next()
}
