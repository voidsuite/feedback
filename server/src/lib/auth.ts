/**
 * Resolve the current user from a request — session cookie first, then a
 * VoidAuth bearer token (used by the browser-SDK path and WebSocket auth).
 */

import type { Context } from "hono"
import { getCookieName, getSession, type SessionUser } from "../db/sessions.js"
import { validateBearerToken } from "./oauth.js"

export async function getSessionUser(c: Context): Promise<SessionUser | null> {
  const cookie = getCookie(c, getCookieName())
  if (cookie) {
    const session = getSession(cookie)
    if (session) return session.user
  }
  const auth = c.req.header("authorization") || ""
  const match = /^Bearer\s+(.+)$/i.exec(auth)
  if (match) {
    try {
      const u = await validateBearerToken(match[1])
      if (u.id) return { id: u.id, name: u.name, email: u.email, picture: u.picture, role: u.role || "user" }
    } catch {
      /* unauthorized */
    }
  }
  return null
}

function getCookie(c: Context, name: string): string | undefined {
  const header = c.req.header("cookie") || ""
  const found = header
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name}=`))
  return found?.slice(name.length + 1)
}

export function isAdmin(user: SessionUser | null): boolean {
  return !!user && user.role === "admin"
}
