import * as React from "react"
import { createBrowserRouter, RouterProvider, Navigate } from "react-router"
import { useAuth } from "@/contexts/auth"
import { LoginPage } from "@/pages/LoginPage"
import { OAuthCallback } from "@/pages/OAuthCallback"
import { HomePage } from "@/pages/HomePage"
import { ThreadPage } from "@/pages/ThreadPage"
import { SupportPage } from "@/pages/SupportPage"
import { RoadmapPage } from "@/pages/RoadmapPage"
import { SettingsPage } from "@/pages/SettingsPage"
import { AdminLayout } from "@/pages/admin/AdminLayout"
import { AdminDashboard } from "@/pages/admin/AdminDashboard"
import { AdminInbox } from "@/pages/admin/AdminInbox"
import { AdminThread } from "@/pages/admin/AdminThread"
import { AdminNotifications } from "@/pages/admin/AdminNotifications"
import { AdminSources } from "@/pages/admin/AdminSources"

function Loading() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth()
  if (status === "loading") return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, status } = useAuth()
  if (status === "loading") return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/oauth/callback", element: <OAuthCallback /> },
  { path: "/roadmap", element: <RoadmapPage /> },
  {
    path: "/",
    element: <ProtectedRoute><HomePage /></ProtectedRoute>,
  },
  {
    path: "/thread/:id",
    element: <ProtectedRoute><ThreadPage /></ProtectedRoute>,
  },
  {
    path: "/support",
    element: <ProtectedRoute><SupportPage /></ProtectedRoute>,
  },
  {
    path: "/settings",
    element: <ProtectedRoute><SettingsPage /></ProtectedRoute>,
  },
  {
    path: "/admin",
    element: <AdminRoute><AdminLayout /></AdminRoute>,
    children: [
      { index: true, element: <AdminDashboard /> },
      { path: "inbox", element: <AdminInbox /> },
      { path: "thread/:id", element: <AdminThread /> },
      { path: "notifications", element: <AdminNotifications /> },
      { path: "sources", element: <AdminSources /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}

export default App
