import * as React from "react"
import { useNavigate } from "react-router"
import { Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VoidFeedbackLogo } from "@/components/VoidFeedbackLogo"
import { useAuth } from "@/contexts/auth"

export function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (user) navigate("/")
  }, [user, navigate])

  async function go() {
    setBusy(true)
    try {
      await signIn()
    } catch {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <VoidFeedbackLogo size="lg" tagline />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Feedback &amp; support</h1>
          <p className="text-sm text-muted-foreground">
            Ask questions, suggest features, report bugs, and chat live with the team — all in one hub.
          </p>
        </div>
        <Button onClick={go} disabled={busy} size="lg" className="w-full gap-2">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
          Continue with VoidAuth
        </Button>
        <p className="text-xs text-muted-foreground">Secured by VoidAuth — your single Void suite sign-in.</p>
      </div>
    </div>
  )
}
