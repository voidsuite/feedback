import { useEffect, useMemo } from "react"
import { useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { VoidLogo } from "@/components/VoidLogo"

export function OAuthCallbackPage() {
  const [params] = useSearchParams()

  const code = params.get("code")
  const error = params.get("error")
  const appName = params.get("app") ?? "the application"
  const redirectUri = params.get("redirect_uri")
  const state = params.get("state")

  const isSuccess = !error && !!code

  const returnUrl = useMemo(() => {
    if (!isSuccess || !redirectUri || !code) return null

    const decodedRedirectUri = decodeURIComponent(redirectUri)
    const qs = new URLSearchParams({ code })
    if (state) qs.set("state", state)

    return `${decodedRedirectUri}?${qs.toString()}`
  }, [isSuccess, redirectUri, code, state])

  useEffect(() => {
    if (!returnUrl) return

    // Auto-return to the integrating app (standard OAuth UX).
    const t = window.setTimeout(() => {
      window.location.assign(returnUrl)
    }, 1500)
    return () => window.clearTimeout(t)
  }, [returnUrl])

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex justify-center">
          <VoidLogo />
        </div>

        {/* Status */}
        <div className="flex flex-col items-center gap-4 text-center">
          {isSuccess ? (
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
                  Redirecting you back to {decodeURIComponent(appName)}...
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
                  You declined access for {decodeURIComponent(appName)}.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {isSuccess && redirectUri && (
            <Button className="w-full" asChild>
              <a
                href={returnUrl ?? `${decodeURIComponent(redirectUri)}?code=${code}`}
              >
                Return to {decodeURIComponent(appName)}
              </a>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
