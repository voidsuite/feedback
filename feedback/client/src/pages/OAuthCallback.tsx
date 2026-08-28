import * as React from "react"
import { useNavigate } from "react-router"
import { Loader2 } from "lucide-react"
import { VoidFeedbackLogo } from "@/components/VoidFeedbackLogo"
import { useAuth } from "@/contexts/auth"

export function OAuthCallback() {
  const { completeCallback } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    completeCallback()
      .then(() => navigate("/"))
      .catch((e) => setError(e?.message || "Sign-in failed"))
  }, [completeCallback, navigate])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
      <VoidFeedbackLogo size="lg" tagline />
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      )}
    </div>
  )
}
