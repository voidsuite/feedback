/* eslint-disable react-refresh/only-export-components */
import * as React from "react"
import {
  type User,
  getCurrentUser,
  login as authLogin,
  logout as authLogout,
  register as authRegister,
  verifyAuth,
} from "@/lib/auth"


interface AuthContextType {
  user: User | null
  loading: boolean
  maintenanceMode: boolean
  login: (email: string, password: string, keepMeLoggedIn?: boolean) => Promise<{ error?: string } | { mfaRequired: true; mfaToken: string }>
  logout: () => Promise<void>
  register: (
    name: string,
    email: string,
    password: string,
  ) => Promise<{ error?: string }>
  refreshUser: () => void
  isAdmin: boolean
}

const AuthContext = React.createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(() => getCurrentUser())
  const [loading, setLoading] = React.useState(true)
  const [maintenanceMode, setMaintenanceMode] = React.useState(false)

  // Verify authentication on mount
  React.useEffect(() => {
    const checkAuth = async () => {
      const currentUser = getCurrentUser()
      if (currentUser) {
        // Session cookie is sent automatically — just verify with the server
        const verifiedUser = await verifyAuth()
        setUser(verifiedUser)
      }
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/health`)
        const health = await res.json()
        setMaintenanceMode(!!health.maintenance)
      } catch {}
      setLoading(false)
    }
    checkAuth()
  }, [])

  const refreshUser = React.useCallback(() => {
    setUser(getCurrentUser())
  }, [])

  const login = React.useCallback(
    async (email: string, password: string, keepMeLoggedIn?: boolean): Promise<any> => {
      const result = await authLogin(email, password, keepMeLoggedIn)
      // If server requires MFA step, return the MFA response to the caller so the UI can handle it
      if ('mfaRequired' in result && result.mfaRequired) return result
      if ("error" in result) return { error: result.error }
      // The login response already contains full user data — no need to call
      // verifyAuth() here. Doing so hit GET /auth/me which could return 401 if
      // the session cookie wasn't fully propagated yet, triggering the apiClient's
      // hard-redirect 401 handler and bouncing the user back to /login.
      setUser(result.user)
      // Yield to let React flush the state update before any navigation
      await new Promise(resolve => setTimeout(resolve, 0))
      // Re-check maintenance mode after login (the health endpoint is now available)
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || ''}/health`)
        const health = await res.json()
        if (health.maintenance) setMaintenanceMode(true)
      } catch {}
      return {}
    },
    [],
  )

  const logout = React.useCallback(async () => {
    await authLogout()
    setUser(null)
  }, [])

  const register = React.useCallback(
    async (
      name: string,
      email: string,
      password: string,
    ): Promise<{ error?: string }> => {
      const result = await authRegister(name, email, password)
      if ("error" in result) return { error: result.error }
      setUser(result.user)
      return {}
    },
    [],
  )

  const isAdmin = user?.role === 'admin'

  const value = React.useMemo(
    () => ({ user, loading, maintenanceMode, login, logout, register, refreshUser, isAdmin }),
    [user, loading, maintenanceMode, login, logout, register, refreshUser, isAdmin],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextType {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
