/**
 * Auth context for Void Feedback.
 *
 * Login is always "Sign in with VoidAuth" — the app is server-authoritative,
 * everything syncs with your account, and there is no local-only mode.
 */

import * as React from "react"
import * as api from "@/lib/api"
import type { User } from "@/lib/api"

// NOTE: AuthProvider is rendered outside the router (providers wrap RouterProvider
// in main.tsx), so it must not call useNavigate at the top level. Navigation after
// sign-out is performed by the calling component.

type AuthStatus = "loading" | "ready"

interface AuthContextValue {
  status: AuthStatus
  user: User | null
  isAdmin: boolean
  signIn: (keepMeLoggedIn?: boolean) => Promise<void>
  signOut: () => Promise<void>
  completeCallback: () => Promise<User>
  refresh: () => Promise<void>
}

const AuthContext = React.createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<AuthStatus>("loading")
  const [user, setUser] = React.useState<User | null>(null)

  React.useEffect(() => {
    if (window.location.pathname.startsWith("/oauth/callback")) {
      setStatus("ready")
      return
    }
    let cancelled = false
    api
      .getMe()
      .then((u) => {
        if (cancelled) return
        if (u) setUser(u)
      })
      .finally(() => {
        if (!cancelled) setStatus("ready")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Silent session keep-alive: re-check on focus / visibility + every 5 min.
  React.useEffect(() => {
    if (!user) return
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
  }, [user])

  const signIn = React.useCallback(async (keepMeLoggedIn = true) => {
    await api.startLogin(keepMeLoggedIn)
  }, [])

  const signOut = React.useCallback(async () => {
    await api.logout()
    setUser(null)
  }, [])

  const completeCallback = React.useCallback(async () => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("code")
    const state = params.get("state")
    const keep = sessionStorage.getItem("voidfeedback_keep_me_logged_in") !== "0"
    sessionStorage.removeItem("voidfeedback_keep_me_logged_in")
    if (!code || !state) throw new Error("Missing authorization code")
    const u = await api.handleCallback(code, state, keep)
    setUser(u)
    return u
  }, [])

  const refresh = React.useCallback(async () => {
    const u = await api.getMe()
    setUser(u)
  }, [])

  const isAdmin = user?.role === "admin"

  const value = React.useMemo(
    () => ({ status, user, isAdmin, signIn, signOut, completeCallback, refresh }),
    [status, user, isAdmin, signIn, signOut, completeCallback, refresh]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within an AuthProvider")
  return context
}
