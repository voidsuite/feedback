import { useState } from "react"
import { ChevronLeft, Cloud, Lock, Mail, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MailLogo } from "@/components/MailLogo"
import { useAuth } from "@/contexts/auth"

/**
 * Login — VoidAuth-style landing. Two steps: landing → confirm remember.
 * Offline builds (VITE_AUTH_MODE=offline) skip OAuth entirely.
 */
export function LoginPage() {
  const { signIn, continueLocal, mode } = useAuth()
  const [step, setStep] = useState<"landing" | "confirm_remember">("landing")

  if (step === "confirm_remember" && mode !== "offline") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-xs space-y-6 text-center">
          <div className="flex justify-center">
            <MailLogo size="lg" tagline />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Keep you signed in?</p>
            <p className="text-xs text-muted-foreground">Stay signed in for up to 30 days</p>
          </div>
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" size="lg" onClick={() => signIn(false)}>
              No
            </Button>
            <Button type="button" className="flex-1" size="lg" onClick={() => signIn(true)}>
              Yes
            </Button>
          </div>
          <button
            className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setStep("landing")}
          >
            <ChevronLeft className="size-3" />
            Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <Mail className="size-7 text-primary" aria-hidden="true" />
          </div>
          <MailLogo size="lg" tagline className="justify-center" />
          <p className="text-sm text-muted-foreground">
            Encrypted, local-first mail for any provider
          </p>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-5 text-left">
          <div className="flex items-center gap-2.5">
            <Cloud className="size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">SMTP + POP3 — works with any provider</p>
          </div>
          <div className="flex items-center gap-2.5">
            <Lock className="size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">End-to-end encrypted cloud sync via VoidAuth</p>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Encrypted at rest on your device</p>
          </div>
        </div>

        {mode === "offline" ? (
          <Button size="lg" className="w-full gap-2" onClick={continueLocal}>
            Enter m3il
          </Button>
        ) : (
          <Button size="lg" className="w-full gap-2" onClick={() => setStep("confirm_remember")}>
            Sign in with VoidAuth
          </Button>
        )}

        <p className="text-xs text-muted-foreground">
          <button
            className="underline underline-offset-2 transition-colors hover:text-foreground"
            onClick={continueLocal}
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