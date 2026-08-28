import { useEffect, useRef, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DocsLogo } from "@/components/DocsLogo"
import { useAuth } from "@/contexts/auth"
import { useToast } from "@/contexts/toast"

/**
 * Rendered at /oauth/callback — swaps the code for a session, then cleans
 * the URL and lets the app take over.
 */
export function OAuthCallback() {
  const { completeCallback, continueLocal, signIn } = useAuth()
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  // React StrictMode runs effects twice in dev; without this guard the code
  // would be exchanged twice and the second attempt would consume the (now
  // deleted) PKCE verifier, surfacing as "Invalid or expired state".
  const started = useRef(false)
  // The gateway keeps PKCE verifiers in memory, so a server restart between
  // /api/auth/login and /api/auth/exchange leaves a stale state. Restart the
  // OAuth flow once so the sign-in can self-heal instead of dead-ending.
  // Persisted in sessionStorage (survives the redirect round-trip) and reset
  // by startLogin() so every manual sign-in gets one free retry.
  const retried = useRef(sessionStorage.getItem("vdocs_oauth_state_retry") === "1")

  useEffect(() => {
    if (done || started.current) return
    started.current = true
    completeCallback()
      .then(() => {
        setDone(true)
        sessionStorage.removeItem("vdocs_oauth_state_retry")
        window.history.replaceState({}, "", "/")
        toast({ title: "Signed in", description: "Cloud sync is now available.", variant: "success" })
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Sign-in failed"
        if (!retried.current && /state/i.test(message)) {
          retried.current = true
          sessionStorage.setItem("vdocs_oauth_state_retry", "1")
          const keep = sessionStorage.getItem("vdocs_keep_me_logged_in") !== "0"
          void signIn(keep)
          return
        }
        setError(message)
      })
  }, [completeCallback, done, signIn, toast])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-6 text-center">
        <DocsLogo size="lg" tagline className="justify-center" />
        {error ? (
          <div className="space-y-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="size-6 text-destructive" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Couldn't sign in</p>
              <p className="break-words text-xs text-muted-foreground">{error}</p>
            </div>
            <Button className="w-full" variant="outline" onClick={continueLocal}>
              Continue without account
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">Completing sign-in…</p>
          </div>
        )}
      </div>
    </div>
  )
}
