import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { VoidLogo } from "@/components/VoidLogo"

function safeDecode(value: string, fallback: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return fallback
  }
}

export function OAuthCallbackPage() {
  const [params] = useSearchParams()

  const code = params.get("code")
  const error = params.get("error")
  const appName = params.get("app") ?? "the application"
  const redirectUri = params.get("redirect_uri")
  const state = params.get("state")

  const [stateError, setStateError] = useState<string | null>(null)

  const isSuccess = !error && !!code

  const decodedAppName = safeDecode(appName, "the application")

  const decodedRedirectUri = useMemo(() => {
    if (!redirectUri) return null
    return safeDecode(redirectUri, "")
  }, [redirectUri])

  const isSafeRedirect = useMemo(() => {
    if (!decodedRedirectUri) return false
    try {
      const url = new URL(decodedRedirectUri)
      return url.protocol === "http:" || url.protocol === "https:"
    } catch {
      return false
    }
  }, [decodedRedirectUri])

  useEffect(() => {
    if (!state) return
    const stored = sessionStorage.getItem("oauth_state")
    if (!stored || stored !== state) {
      setStateError("Invalid or missing state parameter. This may indicate a CSRF attack.")
    }
  }, [state])

  const returnUrl = useMemo(() => {
    if (!isSuccess || !decodedRedirectUri || !code || !isSafeRedirect) return null

    const qs = new URLSearchParams({ code })
    if (state) qs.set("state", state)

    return `${decodedRedirectUri}?${qs.toString()}`
  }, [isSuccess, decodedRedirectUri, code, state, isSafeRedirect])

  useEffect(() => {
    if (!returnUrl) return

    const t = window.setTimeout(() => {
      window.location.assign(returnUrl)
    }, 1500)
    return () => window.clearTimeout(t)
  }, [returnUrl])

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <VoidLogo />
        </div>

        <div className="flex flex-col items-center gap-4 text-center">
          {stateError ? (
            <>
              <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card">
                <svg
                  viewBox="0 0 24 24"
                  className="size-5 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold">Verification failed</h1>
                <p className="text-sm text-muted-foreground">{stateError}</p>
              </div>
            </>
          ) : isSuccess ? (
            <>
              <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card">
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20,6 9,17 4,12" />
                </svg>
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold">Authorization successful</h1>
                <p className="text-sm text-muted-foreground">
                  Redirecting you back to {decodedAppName}...
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card">
                <svg
                  viewBox="0 0 24 24"
                  className="size-5 text-muted-foreground"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <div className="space-y-1">
                <h1 className="text-xl font-semibold">Authorization cancelled</h1>
                <p className="text-sm text-muted-foreground">
                  You declined access for {decodedAppName}.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {isSuccess && redirectUri && isSafeRedirect && !stateError && (
            <Button className="w-full" asChild>
              <a
                href={returnUrl ?? "#"}
              >
                Return to {decodedAppName}
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
