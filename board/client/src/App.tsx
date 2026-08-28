/**
 * App — route shell for VoidBoard.
 *
 * Gate: while auth is loading show a splash; until the user is signed in show
 * the VoidAuth login page. The OAuth callback route always renders so it can
 * complete the code exchange regardless of gate state.
 */

import { Navigate, Route, Routes } from "react-router"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth"
import { LoginPage } from "@/components/login-page"
import { OAuthCallback } from "@/components/oauth-callback"
import { HomePage } from "@/pages/HomePage"
import { BoardPage } from "@/pages/BoardPage"
import { WorkspacePage } from "@/pages/WorkspacePage"
import { JoinPage } from "@/pages/JoinPage"
import { VoidBoardLogo } from "@/components/VoidBoardLogo"

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background">
      <VoidBoardLogo size="lg" tagline />
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
    </div>
  )
}

function Gates() {
  const { status, user } = useAuth()
  if (status === "loading") return <Splash />
  if (!user) return <LoginPage />
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/w/:workspaceId" element={<WorkspacePage />} />
      <Route path="/b/:boardId" element={<BoardPage />} />
      <Route path="/join/:token" element={<JoinPage />} />
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