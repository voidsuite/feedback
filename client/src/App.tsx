import * as React from "react"
import {
  createBrowserRouter,
  RouterProvider,
  Navigate,
} from "react-router"
import { useAuth } from "@/contexts/auth"
import { LoginPage } from "@/pages/LoginPage"
import { RegisterPage } from "@/pages/RegisterPage"
import { ForgotPasswordPage } from "@/pages/ForgotPassword"
import { ResetPasswordPage } from "@/pages/ResetPassword"
import { OAuthPage } from "@/pages/OAuthPage"
import { OAuthCallbackPage } from "@/pages/OAuthCallbackPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { AdminLayout } from "@/pages/AdminLayout"
import { AdminDashboard } from "@/pages/AdminDashboard"
import { AdminUsers } from "@/pages/AdminUsers"
import { AdminUserDetail } from "@/pages/AdminUserDetail"
import { AdminApps } from "@/pages/AdminApps"
import { AdminAppDetail } from "@/pages/AdminAppDetail"
import { AdminEmail } from "@/pages/AdminEmail"
import { AdminTokens } from "@/pages/AdminTokens"
import { AdminStorage } from "@/pages/AdminStorage"
import { AdminHealth } from "@/pages/AdminHealth"
import { AdminAuditLog } from "@/pages/AdminAuditLog"
import { AdminFeatureFlags } from "@/pages/AdminFeatureFlags"
import { AdminMaintenance } from "@/pages/AdminMaintenance"
import { MagicLinkConfirm } from "@/pages/MagicLinkConfirm"
import { VerifyEmailPage } from "@/pages/VerifyEmailPage"
import { MaintenanceBanner } from "@/components/MaintenanceBanner"
import { AccountRecovery } from "@/pages/AccountRecovery"
import { NotificationSettings } from "@/pages/NotificationSettings"
import { SessionsPage } from "@/pages/SessionsPage"
import { ErrorPage } from "@/pages/ErrorPage"
import { PlaygroundPage } from "@/pages/PlaygroundPage"


function LoadingSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <svg className="size-6 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, maintenanceMode, isAdmin, refreshUser } = useAuth()
  // Force-fresh user data from localStorage before children render.
  // This avoids the timing gap where setUser() hasn't flushed before
  // the destination page mounts after login/register.
  React.useLayoutEffect(() => { refreshUser() }, [])
  if (loading) return <LoadingSpinner />
  if (maintenanceMode && !isAdmin) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-4 text-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto size-12 text-amber-500">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <h1 className="text-xl font-semibold">Under Maintenance</h1>
          <p className="text-sm text-muted-foreground">
            VoidAuth is currently undergoing maintenance. Please check back soon.
          </p>
        </div>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return <LoadingSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <ErrorPage code={403} />
  return <>{children}</>
}

const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  { path: "/oauth", element: <OAuthPage /> },
  { path: "/oauth/callback", element: <OAuthCallbackPage /> },
  { path: "/magic-link", element: <MagicLinkConfirm /> },
  { path: "/verify-email", element: <VerifyEmailPage /> },
  { path: "/settings/recovery", element: <ProtectedRoute><AccountRecovery /></ProtectedRoute> },
  { path: "/settings/notifications", element: <ProtectedRoute><NotificationSettings /></ProtectedRoute> },
  { path: "/settings/sessions", element: <ProtectedRoute><SessionsPage /></ProtectedRoute> },
  {
    path: "/playground",
    element: (
      <ProtectedRoute>
        <PlaygroundPage />
      </ProtectedRoute>
    ),
  },
  { path: "*", element: <ErrorPage code={404} /> },
  {
    path: "/dashboard",
    element: (
      <ProtectedRoute>
        <DashboardPage />
      </ProtectedRoute>
    ),
  },
  {
    path: "/admin",
    element: (
      <AdminRoute>
        <AdminLayout />
      </AdminRoute>
    ),
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: "users", element: <AdminUsers /> },
      { path: "users/:id", element: <AdminUserDetail /> },
      { path: "apps", element: <AdminApps /> },
      { path: "apps/:id", element: <AdminAppDetail /> },
      { path: "email", element: <AdminEmail /> },
      { path: "tokens", element: <AdminTokens /> },
      { path: "storage", element: <AdminStorage /> },
      { path: "health", element: <AdminHealth /> },
      { path: "audit-log", element: <AdminAuditLog /> },
      { path: "feature-flags", element: <AdminFeatureFlags /> },
      { path: "maintenance", element: <AdminMaintenance /> },
    ],
  },
])

export function App() {
  return (
    <>
      <MaintenanceBanner />
      <RouterProvider router={router} />
    </>
  )
}

export default App
