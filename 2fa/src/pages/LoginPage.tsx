import { useNavigate } from "react-router"
import { VoidLogo } from "@/components/VoidLogo"
import { Button } from "@/components/ui/button"
import { useOAuth } from "@/contexts/oauth"
import { HugeiconsIcon } from "@hugeicons/react"
import { Shield02Icon, CloudIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons"
import { useState } from "react"

export function LoginPage() {
  const { login, loginOffline, isAuthenticated } = useOAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState<"landing" | "confirm_remember">("landing")

  if (isAuthenticated) {
    navigate("/", { replace: true })
    return null
  }

  if (step === "confirm_remember") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-xs text-center space-y-6">
          <div className="space-y-2">
            <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <HugeiconsIcon icon={Shield02Icon} className="size-7 text-primary" />
            </div>
            <VoidLogo size="lg" className="justify-center" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Keep you signed in?</p>
            <p className="text-xs text-muted-foreground">Stay signed in for up to 30 days</p>
          </div>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              size="lg"
              onClick={() => { login(false); setStep("landing") }}
            >
              No
            </Button>
            <Button
              type="button"
              className="flex-1"
              size="lg"
              onClick={() => { login(true); setStep("landing") }}
            >
              Yes
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <HugeiconsIcon icon={Shield02Icon} className="size-7 text-primary" />
          </div>
          <VoidLogo size="lg" className="justify-center" />
          <p className="text-sm text-muted-foreground">
            2FA TOTP Authenticator with encrypted cloud sync
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-5">
          <div className="flex items-center gap-2.5 text-left">
            <HugeiconsIcon icon={SmartPhone01Icon} className="size-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Generate secure 2FA codes on any device
            </p>
          </div>
          <div className="flex items-center gap-2.5 text-left">
            <HugeiconsIcon icon={CloudIcon} className="size-4 flex-shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">
              Encrypted cloud backup via your VoidAuth account
            </p>
          </div>
        </div>

        <Button size="lg" className="w-full gap-2" onClick={() => setStep("confirm_remember")}>
          Sign in with VoidAuth
        </Button>

        <p className="text-xs text-muted-foreground">
          <button
            className="underline underline-offset-2 hover:text-foreground transition-colors"
            onClick={() => { loginOffline(); navigate("/") }}
          >
            Continue without account
          </button>
          <span className="mx-1">-</span>
          <span className="opacity-50">local only, no cloud sync</span>
        </p>
      </div>
    </div>
  )
}
