import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { MailLogo } from "@/components/MailLogo"
import { LoginPage } from "@/components/login-page"
import { MailPage } from "@/components/mail/mail-page"
import { OAuthCallback } from "@/components/oauth-callback"
import { PinGate } from "@/components/pin-gate"
import { useAuth } from "@/contexts/auth"
import { hasPin } from "@/lib/pin-state"

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 text-center">
        <MailLogo size="lg" tagline />
        <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    </div>
  )
}

export default function App() {
  const { status, entered } = useAuth()
  const [locked, setLocked] = useState(() => hasPin())

  // Settings → "Lock now" asks us to re-show the PIN gate.
  useEffect(() => {
    const handler = () => setLocked(true)
    window.addEventListener("m3il:lock-app", handler)
    return () => window.removeEventListener("m3il:lock-app", handler)
  }, [])

  if (window.location.pathname === "/oauth/callback") {
    return <OAuthCallback />
  }
  if (status === "loading") return <Splash />
  if (!entered) return <LoginPage />
  if (locked) return <PinGate onUnlock={() => setLocked(false)} />
  return <MailPage />
}