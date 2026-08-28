import { useState } from "react"
import { ChevronLeft, Columns3, RefreshCcw, ShieldCheck, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VoidBoardLogo } from "@/components/VoidBoardLogo"
import { useAuth } from "@/contexts/auth"

/**
 * Login — the only way in is "Sign in with VoidAuth". VoidBoard is
 * server-authoritative: your boards live on the account and sync to any
 * device automatically — no passphrase, nothing to enter.
 */
export function LoginPage() {
  const { signIn } = useAuth()
  const [step, setStep] = useState<"landing" | "confirm_remember">("landing")

  if (step === "confirm_remember") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4">
        <div className="w-full max-w-xs space-y-6 text-center">
          <div className="flex justify-center">
            <VoidBoardLogo size="lg" tagline />
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
            <Columns3 className="size-7 text-primary" aria-hidden="true" />
          </div>
          <VoidBoardLogo size="lg" tagline className="justify-center" />
          <p className="text-sm text-muted-foreground">Kanban project boards for the VoidSuite family</p>
        </div>

        <div className="space-y-3 rounded-xl border border-border bg-card/50 p-5 text-left">
          <div className="flex items-center gap-2.5">
            <Users className="size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Boards, projects and member assignments</p>
          </div>
          <div className="flex items-center gap-2.5">
            <RefreshCcw className="size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Syncs automatically with your account — like a chat app</p>
          </div>
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Sign in once; everything is there on any device</p>
          </div>
        </div>

        <Button size="lg" className="w-full gap-2" onClick={() => setStep("confirm_remember")}>
          Sign in with VoidAuth
        </Button>

        <p className="text-xs text-muted-foreground">
          Part of the <span className="font-medium text-foreground">VoidSuite</span> — voiddraw, docs, m3il, authiov
        </p>
        <a
          href={`${import.meta.env.VITE_FEEDBACK_URL || "https://feedback.stwupid.tech"}?source=board`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Have feedback? Tell us →
        </a>
      </div>
    </div>
  )
}