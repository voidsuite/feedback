/**
 * Middleware: session guard for proxied APIs, optional session, and a simple
 * in-memory rate limiter for mail-relay endpoints.
 */

import type { Context, Next } from "hono"
import { getCookie } from "hono/cookie"
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
  if (!session) return c.json({ error: "Session expired" }, 401)

  if (!session.accessToken) return c.json({ error: "Not authenticated with VoidAuth" }, 401)

  c.set("voidAuthAccessToken", session.accessToken)
  c.set("sessionUser", session.user)
  await next()
}

export async function optionalSession(c: Context, next: Next) {
  const sessionId = getCookie(c, getCookieName())
  if (sessionId) {
    const session = getSession(sessionId)
    if (session && session.accessToken) {
      c.set("voidAuthAccessToken", session.accessToken)
      c.set("sessionUser", session.user)
    }
  }
  await next()
}

// --- Rate limiting (in-memory sliding window, per IP + route) ---

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 120

const hits = new Map<string, { count: number; resetAt: number }>()

export async function rateLimit(c: Context, next: Next): Promise<Response | void> {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("cf-connecting-ip") || "local"
  const key = `${ip}:${c.req.path}`
  const now = Date.now()
  const entry = hits.get(key)

  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS })
    return await next()
  }

  entry.count += 1
  if (entry.count > RATE_LIMIT_MAX) {
    return c.json({ error: "Too many requests. Slow down." }, 429)
  }
  return await next()
}

// Periodically clear stale rate-limit entries.
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) hits.delete(key)
  }
}, 60_000).unref?.()