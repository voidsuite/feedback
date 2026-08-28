/**
 * In-memory session store. Session ids are random and carried in an httpOnly
 * cookie; the store holds the VoidAuth access/refresh tokens server-side so
 * they never reach the browser.
 */

import config from "../config.js"

export interface SessionUser {
  id: string
  name: string
  email: string
}

export interface SessionData {
  user: SessionUser
  accessToken: string
  refreshToken: string
  createdAt: number
  expiresAt: number
  keepMeLoggedIn: boolean
}

const SESSION_DURATION_KMLI = 30 * 24 * 60 * 60 * 1000
const SESSION_DURATION_DEFAULT = 7 * 24 * 60 * 60 * 1000

const sessions = new Map<string, SessionData>()

function generateId(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Buffer.from(arr).toString("base64url")
}

export function getCookieName(): string {
  return "m3il_sid"
}

export function createSession(
  data: { user: SessionUser; accessToken: string; refreshToken: string },
  keepMeLoggedIn?: boolean
): string {
  const id = generateId()
  const kmli = keepMeLoggedIn !== false
  const duration = kmli ? SESSION_DURATION_KMLI : SESSION_DURATION_DEFAULT
  sessions.set(id, {
    ...data,
    createdAt: Date.now(),
    expiresAt: Date.now() + duration,
    keepMeLoggedIn: kmli,
  })
  return id
}

export function getSession(id: string): SessionData | null {
  const session = sessions.get(id)
  if (!session) return null
  if (Date.now() > session.expiresAt) {
    sessions.delete(id)
    return null
  }
  return session
}

export function updateSessionTokens(id: string, accessToken: string, refreshToken: string): void {
  const session = sessions.get(id)
  if (session) {
    session.accessToken = accessToken
    session.refreshToken = refreshToken
  }
}

export function deleteSession(id: string): void {
  sessions.delete(id)
}

export function getSessionCookieOptions(maxAge?: number): Record<string, string | boolean | number> {
  const isSecure = config.appUrl.startsWith("https://")
  const options: Record<string, string | boolean | number> = {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    secure: isSecure,
  }
  if (maxAge !== undefined) options.maxAge = maxAge
  return options
}

// Periodically sweep expired sessions.
setInterval(() => {
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now > session.expiresAt) sessions.delete(id)
  }
}, 5 * 60 * 1000).unref?.()