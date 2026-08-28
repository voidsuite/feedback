/**
 * App — route shell for Void Docs.
 *
 * Gate: while auth is loading show a splash; until the user has entered the
 * app show the VoidAuth-style login page. The OAuth callback route always
 * renders so it can complete the code exchange regardless of gate state.
 */

import { Navigate, Route, Routes } from "react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth"
import { LoginPage } from "@/components/login-page"
import { OAuthCallback } from "@/components/oauth-callback"
import { HomePage } from "@/components/home/home-page"
import { EditorPage } from "@/components/editor/editor-page"
import { DocsLogo } from "@/components/DocsLogo"

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
      <DocsLogo size="lg" tagline />
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

function Gates() {
  const { status, entered } = useAuth()
  if (status === "loading") return <Splash />
  if (!entered) return <LoginPage />
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/d/:docId" element={<EditorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/oauth/callback" element={<OAuthCallback />} />
      <Route path="*" element={<Gates />} />
    </Routes>
  )
}