import { useEffect, useState } from "react"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MailLogo } from "@/components/MailLogo"
import { useAuth } from "@/contexts/auth"
import { useToast } from "@/contexts/toast"

/**
 * Rendered at /oauth/callback — swaps the code for a session, then cleans
 * the URL and lets the app take over.
 */
export function OAuthCallback() {
  const { completeCallback, continueLocal } = useAuth()
  const { toast } = useToast()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (done) return
    completeCallback()
      .then(() => {
        setDone(true)
        window.history.replaceState({}, "", "/")
        toast({ title: "Signed in", description: "Cloud sync is now available.", variant: "success" })
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Sign-in failed")
      })
  }, [completeCallback, done, toast])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-6 text-center">
        <MailLogo size="lg" tagline className="justify-center" />
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