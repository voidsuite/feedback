import { Hono } from "hono"
import { setCookie, deleteCookie, getCookie } from "hono/cookie"
import config from "../config.js"
import { createSession, getSession, deleteSession, updateSessionTokens, getCookieName, getSessionCookieOptions } from "../lib/session.js"

const PKCE_VERIFIERS = new Map<string, string>()
const PKCE_STATE_COOKIE = "authiov_pkce_state"

async function refreshAccessToken(sessionId: string, session: { refreshToken?: string; keepMeLoggedIn: boolean }): Promise<boolean> {
  if (!session.refreshToken) return false
  try {
    const tokenRes = await fetch(`${config.voidauthUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    })
    const data = await tokenRes.json()
    if (!tokenRes.ok || !data.access_token) return false
    updateSessionTokens(sessionId, data.access_token, data.refresh_token || session.refreshToken)
    return true
  } catch {
    return false
  }
}

function generateRandomString(length: number): string {
  const arr = new Uint8Array(length)
  crypto.getRandomValues(arr)
  return Buffer.from(arr).toString("base64url")
}

function sha256(input: string): string {
  const hasher = new Bun.CryptoHasher("sha256")
  hasher.update(input)
  return Buffer.from(hasher.digest("hex"), "hex").toString("base64url")
}

function pkceStateCookieOptions(): Record<string, string | boolean | number> {
  const isSecure = config.appUrl.startsWith("https://")
  return {
    httpOnly: true,
    sameSite: "Lax",
    secure: isSecure,
    path: "/",
    maxAge: 10 * 60,
  }
}

const auth = new Hono()

auth.get("/login", async (c) => {
  const verifier = generateRandomString(32)
  const challenge = sha256(verifier)
  const state = generateRandomString(16)

  PKCE_VERIFIERS.set(state, verifier)
  // Bind the state to this browser: /exchange will only succeed if the
  // same browser presents the cookie that was set when /login was called.
  setCookie(c, PKCE_STATE_COOKIE, state, pkceStateCookieOptions())

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: `${config.appUrl}/oauth/callback`,
    response_type: "code",
    scope: "profile email",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  })

  const authUrl = `${config.voidauthUrl}/oauth/authorize?${params}`
  return c.json({ authUrl })
})

auth.post("/exchange", async (c) => {
  const body = await c.req.json()
  const { code, state, keepMeLoggedIn } = body

  if (!code || !state) {
    return c.json({ error: "Missing code or state" }, 400)
  }

  // Login CSRF protection: the state must belong to THIS browser. The
  // httpOnly cookie set during /login must carry the same state value, so an
  // attacker cannot inject their own session into the victim's browser.
  const stateCookie = getCookie(c, PKCE_STATE_COOKIE)
  if (!stateCookie || stateCookie !== state) {
    return c.json({ error: "Invalid OAuth state" }, 400)
  }

  const verifier = PKCE_VERIFIERS.get(state)
  if (!verifier) {
    return c.json({ error: "Invalid or expired state" }, 400)
  }
  PKCE_VERIFIERS.delete(state)
  deleteCookie(c, PKCE_STATE_COOKIE)

  const tokenRes = await fetch(`${config.voidauthUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${config.appUrl}/oauth/callback`,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: verifier,
    }),
  })

  const data = await tokenRes.json()
  if (!tokenRes.ok) {
    return c.json(data, tokenRes.status as any)
  }

  const kmli = keepMeLoggedIn !== false
  const sessionId = createSession({
    user: data.user,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
  }, kmli)

  const cookieMaxAge = kmli ? 30 * 24 * 60 * 60 : undefined
  setCookie(c, getCookieName(), sessionId, getSessionCookieOptions(cookieMaxAge))

  return c.json({ user: data.user })
})

auth.post("/refresh", async (c) => {
  const sessionId = getCookie(c, getCookieName())
  if (!sessionId) return c.json({ error: "No session" }, 401)

  // Refresh the VoidAuth OAuth access token using our stored refresh token
  const session = getSession(sessionId)
  if (!session) {
    deleteCookie(c, getCookieName())
    return c.json({ error: "Session expired" }, 401)
  }

  if (!session.refreshToken) {
    return c.json({ error: "No refresh token available" }, 401)
  }

  try {
    const tokenRes = await fetch(`${config.voidauthUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: session.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }),
    })

    const data = await tokenRes.json()
    if (!tokenRes.ok || !data.access_token) {
      // Refresh token invalid/expired: drop the local session.
      deleteSession(sessionId)
      deleteCookie(c, getCookieName())
      return c.json({ error: "Session expired" }, 401)
    }

    updateSessionTokens(sessionId, data.access_token, data.refresh_token || session.refreshToken)

    const cookieMaxAge = session.keepMeLoggedIn ? 30 * 24 * 60 * 60 : undefined
    setCookie(c, getCookieName(), sessionId, getSessionCookieOptions(cookieMaxAge))

    return c.json({ ok: true, user: session.user })
  } catch {
    return c.json({ error: "Failed to refresh session" }, 502)
  }
})

auth.post("/logout", async (c) => {
  const sessionId = getCookie(c, getCookieName())
  if (sessionId) {
    const session = getSession(sessionId)
    if (session && session.accessToken && config.clientSecret) {
      // Best-effort revoke the OAuth access token at VoidAuth.
      fetch(`${config.voidauthUrl}/oauth/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: session.accessToken,
          client_id: config.clientId,
          client_secret: config.clientSecret,
        }),
      }).catch(() => {})
    }
    deleteSession(sessionId)
    deleteCookie(c, getCookieName())
  }
  return c.json({ ok: true })
})

/**
 * POST /api/auth/global-logout
 * Webhook called by VoidAuth frontend when user logs out there.
 */
auth.post("/global-logout", async (c) => {
  // With cookie-based sessions, global logout is handled by VoidAuth clearing the cookie
  // This endpoint is kept for backwards compatibility but is a no-op
  return c.json({ ok: true, deleted: 0 })
})

auth.get("/me", async (c) => {
  const sessionId = getCookie(c, getCookieName())
  if (!sessionId) return c.json({ error: "Not authenticated" }, 401)

  const session = getSession(sessionId)
  if (!session) {
    deleteCookie(c, getCookieName())
    return c.json({ error: "Session expired" }, 401)
  }

  try {
    const res = await fetch(`${config.voidauthUrl}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${session.accessToken}` },
    })
    if (!res.ok) throw new Error("Token invalid")
  } catch {
    const refreshed = await refreshAccessToken(sessionId, session)
    if (!refreshed) {
      deleteSession(sessionId)
      deleteCookie(c, getCookieName())
      return c.json({ error: "Session revoked" }, 401)
    }
  }

  return c.json({ user: session.user })
})

export default auth
