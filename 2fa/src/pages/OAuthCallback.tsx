import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useOAuth } from "@/contexts/oauth"

export function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { handleCallback } = useOAuth()
  const [error, setError] = useState("")

  useEffect(() => {
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    if (!code || !state) {
      setError("Missing authorization code or state")
      return
    }
    const urlKeepMeLoggedIn = searchParams.get("keep_me_logged_in")
    const sessionPref = sessionStorage.getItem("ava_keep_signed_in")
    const keepMeLoggedIn = urlKeepMeLoggedIn !== null
      ? urlKeepMeLoggedIn === "true"
      : sessionPref !== "false"
    handleCallback(code, state, keepMeLoggedIn)
      .then(() => navigate("/", { replace: true }))
      .catch((e) => setError(e?.error_description || e?.message || "Authentication failed"))
  }, [])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-destructive">{error}</p>
        <a href="/login" className="text-xs text-muted-foreground underline">Back to login</a>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}
