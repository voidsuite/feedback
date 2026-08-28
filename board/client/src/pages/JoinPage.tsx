/**
 * JoinPage — /join/:token. Applies the invite and lands on the workspace.
 * Already a member? Joining again is a no-op that still returns the workspace.
 */

import * as React from "react"
import { Link, useNavigate, useParams } from "react-router"
import { Loader2, PartyPopper } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useToast } from "@/contexts/toast"
import { VoidBoardLogo } from "@/components/VoidBoardLogo"
import * as api from "@/lib/api"

export function JoinPage() {
  const { token = "" } = useParams()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [state, setState] = React.useState<"loading" | "joined" | "error">("loading")
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    api
      .joinByToken(token)
      .then((ws) => {
        if (cancelled) return
        setState("joined")
        toast({ title: "Joined workspace", description: ws.name, variant: "success" })
        setTimeout(() => navigate(`/w/${ws.id}`, { replace: true }), 900)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setState("error")
        setError(e instanceof Error ? e.message : "This invite doesn't work")
      })
    return () => {
      cancelled = true
    }
  }, [token, navigate, toast])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 px-4">
      <VoidBoardLogo size="lg" tagline />
      {state === "loading" ? (
        <>
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Joining…" />
          <p className="text-sm text-muted-foreground">Joining workspace…</p>
        </>
      ) : state === "joined" ? (
        <>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10">
            <PartyPopper className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <p className="text-sm font-medium">You're in!</p>
          <p className="text-xs text-muted-foreground">Taking you to your boards…</p>
        </>
      ) : (
        <>
          <p className="font-medium">{error}</p>
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            The invite link may have been disabled or rotated. Ask an admin for a fresh one.
          </p>
          <Link to="/">
            <Button variant="outline" size="sm">Back to my workspaces</Button>
          </Link>
        </>
      )}
    </div>
  )
}