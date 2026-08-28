import * as React from "react"
import {
  getAuthorizationURL,
  exchangeCode,
  logout as apiLogout,
  refreshAccessToken,
  getAuthUser,
} from "@/lib/api"

const OFFLINE_USER = { id: "offline", name: "Offline", email: "" }

interface OAuthContextType {
  user: { id: string; name: string; email: string } | null
  isAuthenticated: boolean
  isOffline: boolean
  loading: boolean
  login: (keepMeLoggedIn?: boolean) => void
  loginOffline: () => void
  handleCallback: (code: string, state: string, keepMeLoggedIn?: boolean) => Promise<void>
  logout: () => Promise<void>
}

const OAuthContext = React.createContext<OAuthContextType | undefined>(undefined)

export function OAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<{ id: string; name: string; email: string } | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    getAuthUser().then(u => {
      if (u) {
        setUser(u)
        refreshAccessToken()
      }
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  // Cross-app logout: check session on visibility change
  React.useEffect(() => {
    const checkSession = async () => {
      const u = await getAuthUser()
      if (!u && user) {
        setUser(null)
      }
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        checkSession()
      }
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => document.removeEventListener("visibilitychange", onVisibility)
  }, [user])

  // Heartbeat: check session every 60 seconds
  React.useEffect(() => {
    if (!user) return
    const interval = setInterval(async () => {
      const u = await getAuthUser()
      if (!u) {
        setUser(null)
      }
    }, 60_000)
    return () => clearInterval(interval)
  }, [user])

  const login = React.useCallback(async (keepMeLoggedIn?: boolean) => {
    const authUrl = await getAuthorizationURL()
    const separator = authUrl.includes("?") ? "&" : "?"
    window.location.href = `${authUrl}${separator}keep_me_logged_in=${keepMeLoggedIn !== false}`
  }, [])

  const loginOffline = React.useCallback(() => {
    setUser(OFFLINE_USER)
  }, [])

  const handleCallback = React.useCallback(async (code: string, state: string, keepMeLoggedIn?: boolean) => {
    const u = await exchangeCode(code, state, keepMeLoggedIn)
    setUser(u)
  }, [])

  const logout = React.useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  const isOffline = user?.id === "offline"

  const value = React.useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isOffline,
      loading,
      login,
      loginOffline,
      handleCallback,
      logout,
    }),
    [user, loading, isOffline, login, loginOffline, handleCallback, logout]
  )

  return <OAuthContext.Provider value={value}>{children}</OAuthContext.Provider>
}

export function useOAuth(): OAuthContextType {
  const ctx = React.useContext(OAuthContext)
  if (!ctx) throw new Error("useOAuth must be used within OAuthProvider")
  return ctx
}
