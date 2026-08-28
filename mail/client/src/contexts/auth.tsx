/**
 * Auth context — three modes via lib/api.ts:
 *  - backend:  OAuth PKCE proxied through the m3il gateway (httpOnly cookie).
 *  - browser:  @voidauth/client browser SDK (tokens in sessionStorage).
 *  - offline:  no accounts; the app is fully usable, sync disabled.
 *
 * The app is functional without any account; signing in only unlocks the
 * encrypted cloud sync features.
 */

import * as React from "react"
import * as api from "@/lib/api"
import type { SessionUser } from "@/lib/api"

const ENTERED_KEY = "m3il_entered"

type AuthStatus = "loading" | "ready"

interface AuthContextValue {
  status: AuthStatus
  user: SessionUser | null
  mode: api.AuthMode
  entered: boolean
  /** Redirect to the VoidAuth OAuth flow. */
  signIn: (keepMeLoggedIn?: boolean) => Promise<void>
  /** Drop the cloud identity but stay in the app (local-only). */
  continueLocal: () => void
  signOut: () => Promise<void>
  /** Called by the OAuth callback route. */
  completeCallback: () => Promise<SessionUser>
  refresh: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const mode = api.authMode
  const [status, setStatus] = React.useState<AuthStatus>("loading")
  const [user, setUser] = React.useState<SessionUser | null>(null)
  const [entered, setEntered] = React.useState<boolean>(() => localStorage.getItem(ENTERED_KEY) === "1")

  const markEntered = React.useCallback(() => {
    localStorage.setItem(ENTERED_KEY, "1")
    setEntered(true)
  }, [])

  // Restore an existing session on load.
  React.useEffect(() => {
    let cancelled = false
    api
      .getMe()
      .then((u) => {
        if (cancelled) return
        if (u) {
          setUser(u)
          markEntered()
        }
      })
      .finally(() => {
        if (!cancelled) setStatus("ready")
      })
    return () => {
      cancelled = true
    }
  }, [markEntered])

  // Silent session keep-alive: re-check on focus / visibility + every 5 min.
  React.useEffect(() => {
    if (mode === "offline" || !user) return
    let interval: ReturnType<typeof setInterval>
    const check = () => {
      api.getMe().then((u) => setUser(u)).catch(() => {})
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") check()
    }
    window.addEventListener("focus", check)
    document.addEventListener("visibilitychange", onVisible)
    interval = setInterval(check, 5 * 60 * 1000)
    return () => {
      window.removeEventListener("focus", check)
      document.removeEventListener("visibilitychange", onVisible)
      clearInterval(interval)
    }
  }, [mode, user])

  const signIn = React.useCallback(async (keepMeLoggedIn = true) => {
    await api.startLogin(keepMeLoggedIn)
  }, [])

  const continueLocal = React.useCallback(() => {
    markEntered()
  }, [markEntered])

  const signOut = React.useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const completeCallback = React.useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const state = params.get("state")
    const keep = sessionStorage.getItem("m3il_keep_me_logged_in") !== "0"
    sessionStorage.removeItem("m3il_keep_me_logged_in")
    if (!code || !state) throw new Error("Missing authorization code")
    const u = await api.handleCallback(code, state, keep)
    setUser(u)
    markEntered()
    return u
  }, [markEntered])

  const refresh = React.useCallback(async () => {
    const u = await api.getMe()
    setUser(u)
  }, [])

  const value = React.useMemo(
    () => ({ status, user, mode, entered, signIn, continueLocal, signOut, completeCallback, refresh }),
    [status, user, mode, entered, signIn, continueLocal, signOut, completeCallback, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}