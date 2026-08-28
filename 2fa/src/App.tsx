import { createBrowserRouter, RouterProvider, Navigate } from "react-router"
import { AuthGuard } from "@/components/AuthGuard"
import { LoginPage } from "@/pages/LoginPage"
import { OAuthCallback } from "@/pages/OAuthCallback"
import { HomePage } from "@/pages/HomePage"
import { AccountDetail } from "@/pages/AccountDetail"
import { SettingsPage } from "@/pages/SettingsPage"

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/oauth/callback", element: <OAuthCallback /> },
  {
    path: "/",
    element: <AuthGuard><HomePage /></AuthGuard>,
  },
  {
    path: "/account/:id",
    element: <AuthGuard><AccountDetail /></AuthGuard>,
  },
  {
    path: "/settings",
    element: <AuthGuard><SettingsPage /></AuthGuard>,
  },
  { path: "*", element: <Navigate to="/" replace /> },
])

export function App() {
  return <RouterProvider router={router} />
}

export default App
