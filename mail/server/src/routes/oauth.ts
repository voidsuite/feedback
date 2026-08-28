/**
 * /api/auth/* — VoidAuth OAuth proxy with PKCE.
 * The client_secret lives only on the server; the browser gets an httpOnly
 * session cookie and never touches tokens.
 */

import { Hono } from "hono"
import { setCookie, deleteCookie, getCookie } from "hono/cookie"
import config from "../config.js"
import { createSession, getSession, deleteSession, updateSessionTokens, getCookieName, getSessionCookieOptions } from "../lib/session.js"
import {
  buildAuthorizeParams,
  authorizeUrl,
  exchangeCode,
  refreshTokens,
  revokeToken,
  getUserInfo,
} from "../lib/oauth.js"
import { logger } from "../lib/log.js"

const PKCE_VERIFIERS = new Map<string, string>()
const PKCE_STATE_COOKIE = "m3il_pkce_state"

function pkceStateCookieOptions(): Record<string, string | boolean | number> {
  return {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.appUrl.startsWith("https://"),
    path: "/",
    maxAge: 10 * 60,
  }
}

const auth = new Hono()

// GET /api/auth/login → { authUrl } (starts PKCE, binds state to this browser)
auth.get("/login", async (c) => {
  const { params, verifier, state } = buildAuthorizeParams()
  PKCE_VERIFIERS.set(state, verifier)
  setCookie(c, PKCE_STATE_COOKIE, state, pkceStateCookieOptions())
  return c.json({ authUrl: authorizeUrl(params) })
})

// POST /api/auth/exchange — swap the code, create a session cookie
auth.post("/exchange", async (c) => {
  const body = await c.req.json().catch(() => null)
  const code = body?.code as string | undefined
  const state = body?.state as string | undefined
  const keepMeLoggedIn = body?.keepMeLoggedIn

  if (!code || !state) return c.json({ error: "Missing code or state" }, 400)

  // CSRF: the state must belong to this browser.
  const stateCookie = getCookie(c, PKCE_STATE_COOKIE)
  if (!stateCookie || stateCookie !== state) {
    return c.json({ error: "Invalid OAuth state" }, 400)
  }
  const verifier = PKCE_VERIFIERS.get(state)
  if (!verifier) return c.json({ error: "Invalid or expired state" }, 400)
  PKCE_VERIFIERS.delete(state)
  deleteCookie(c, PKCE_STATE_COOKIE)

  try {
    const tokens = await exchangeCode(code, verifier)
    const user = tokens.user || (await getUserInfo(tokens.accessToken))

    const kmli = keepMeLoggedIn !== false
    const sessionId = createSession({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken || "" }, kmli)
    const cookieMaxAge = kmli ? 30 * 24 * 60 * 60 : undefined
    setCookie(c, getCookieName(), sessionId, getSessionCookieOptions(cookieMaxAge))

    return c.json({ user })
  } catch (err) {
    logger.warn("exchange failed", { error: (err as Error).message })
    return c.json({ error: (err as Error).message }, 400)
  }
})

// POST /api/auth/refresh — refresh VoidAuth access token
auth.post("/refresh", async (c) => {
  const sessionId = getCookie(c, getCookieName())
  if (!sessionId) return c.json({ error: "No session" }, 401)

  const session = getSession(sessionId)
  if (!session || !session.refreshToken) {
    if (sessionId) deleteCookie(c, getCookieName())
    return c.json({ error: "Session expired" }, 401)
  }

  try {
    const tokens = await refreshTokens(session.refreshToken)
    updateSessionTokens(sessionId, tokens.accessToken, tokens.refreshToken || session.refreshToken)
    const cookieMaxAge = session.keepMeLoggedIn ? 30 * 24 * 60 * 60 : undefined
    setCookie(c, getCookieName(), sessionId, getSessionCookieOptions(cookieMaxAge))
    return c.json({ ok: true, user: session.user })
  } catch (err) {
    deleteSession(sessionId)
    deleteCookie(c, getCookieName())
    logger.warn("refresh failed", { error: (err as Error).message })
    return c.json({ error: "Session expired" }, 401)
  }
})

// GET /api/auth/me — current user (validates token, refreshes if expired)
auth.get("/me", async (c) => {
  const sessionId = getCookie(c, getCookieName())
  if (!sessionId) return c.json({ error: "Not authenticated" }, 401)

  const session = getSession(sessionId)
  if (!session) {
    deleteCookie(c, getCookieName())
    return c.json({ error: "Session expired" }, 401)
  }

  try {
    await getUserInfo(session.accessToken)
  } catch {
    try {
      const tokens = await refreshTokens(session.refreshToken)
      updateSessionTokens(sessionId, tokens.accessToken, tokens.refreshToken || session.refreshToken)
    } catch {
      deleteSession(sessionId)
      deleteCookie(c, getCookieName())
      return c.json({ error: "Session revoked" }, 401)
    }
  }

  return c.json({ user: session.user })
})

// POST /api/auth/logout — revoke token + clear session
auth.post("/logout", async (c) => {
  const sessionId = getCookie(c, getCookieName())
  if (sessionId) {
    const session = getSession(sessionId)
    if (session?.accessToken) {
      await revokeToken(session.accessToken)
    }
    deleteSession(sessionId)
    deleteCookie(c, getCookieName())
  }
  return c.json({ ok: true })
})

export default auth