import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useAuth } from "@/contexts/auth"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { VoidLogo } from "@/components/VoidLogo"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  SCOPE_LABELS,
  getOAuthAuthorization,
  processOAuthConsent,
  type OAuthClient,
} from "@/lib/auth"

export function OAuthPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [authorizing, setAuthorizing] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [client, setClient] = useState<OAuthClient | null>(null)
  const [requestedScopes, setRequestedScopes] = useState<string[]>([])
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null)
  const [error, setError] = useState<string>("")
  const [appTheme, setAppTheme] = useState<Record<string, any> | null>(null)

  const clientId = params.get("client_id")
  const redirectUri = params.get("redirect_uri")
  const responseType = params.get("response_type") || "code"
  const scope = params.get("scope") || "profile"
  const state = params.get("state") || ""
  const nonce = params.get("nonce") || ""

  useEffect(() => {
    async function loadAuthorization() {
      if (!user) {
        const returnTo = `/oauth?${params.toString()}`
        void navigate(`/login?redirect=${encodeURIComponent(returnTo)}`)
        return
      }


      if (!clientId || !redirectUri) {
        setError("Missing required parameters (client_id or redirect_uri).")
        setLoading(false)
        return
      }

      const result = await getOAuthAuthorization(
        clientId,
        redirectUri,
        responseType,
        scope,
        state,
        nonce
      )

      if ("error" in result) {
        setError(result.error)
        setLoading(false)
        return
      }

      setClient(result.client)
      setRequestedScopes(result.requestedScopes)
      setVerificationStatus((result as any).client?.verification_status || null)
      setAppTheme(result.client?.app_theme || null)

      // Already authorized — auto-consent and redirect
      if (result.alreadyAuthorized) {
        setRedirecting(true)
        const consentResult = await processOAuthConsent(
          clientId,
          redirectUri,
          scope,
          true,
          state,
          nonce
        )
        if ("error" in consentResult) {
          setError(consentResult.error)
        } else {
          void navigate(
            `/oauth/callback?code=${consentResult.code}&state=${state}&app=${encodeURIComponent(result.client.name)}&redirect_uri=${encodeURIComponent(redirectUri)}`
          )
          return
        }
      }
      
      setLoading(false)
    }

    loadAuthorization()
  }, [user, clientId, redirectUri, responseType, scope, state, nonce, params, navigate])

  async function handleAuthorize() {
    if (!clientId || !redirectUri || !client) return
    
    setAuthorizing(true)
    
    const result = await processOAuthConsent(
      clientId,
      redirectUri,
      scope,
      true,
      state,
      nonce
    )

    if ("error" in result) {
      setError(result.error)
      setAuthorizing(false)
    } else {
      // Redirect to callback page
      void navigate(
        `/oauth/callback?code=${result.code}&state=${state}&app=${encodeURIComponent(client.name)}&redirect_uri=${encodeURIComponent(redirectUri)}`
      )
    }
  }

  function handleCancel() {
    if (!redirectUri || !client) {
      // No redirect URI to return to — just close or show error
      window.history.back()
      return
    }
    void navigate(
      `/oauth/callback?error=access_denied&state=${state}&app=${encodeURIComponent(client.name)}&redirect_uri=${encodeURIComponent(redirectUri)}`
    )
  }

  if (loading || redirecting) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-6 text-center">
          <VoidLogo size="lg" className="justify-center" />
          <p className="text-sm text-muted-foreground">{redirecting ? "Redirecting..." : "Loading..."}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-6 text-center">
          <VoidLogo size="lg" className="justify-center" />
          <div className="space-y-2">
            <h1 className="text-lg font-semibold">Invalid request</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!client || !user) return null

  // Apply app theme if available
  const t = appTheme
  const DM = t?.darkMode || false
  const consentBg = DM ? '#1e293b' : (t?.cardColor || undefined)
  const consentBorder = DM ? '#334155' : (t?.borderColor || undefined)
  const consentText = DM ? '#f1f5f9' : (t?.textColor || undefined)
  const consentMuted = DM ? '#94a3b8' : undefined
  const br = t?.borderRadius != null ? `${t.borderRadius}px` : undefined

  return (
    <div className="flex min-h-svh items-center justify-center p-6" style={t ? { background: DM ? '#0f172a' : (t.backgroundColor || undefined) } : undefined}>
      <div className="w-full max-w-sm space-y-6" style={t ? { fontFamily: t.fontFamily || undefined } : undefined}>
        {/* Top logo */}
        <div className="flex justify-center">
          <VoidLogo />
        </div>

        {/* App identity */}
        <div className="space-y-1.5 text-center">
          <div className="relative inline-flex justify-center">
            {client.logo_url ? (
              <img 
                src={client.logo_url} 
                alt={client.name}
                className="size-14 rounded-2xl border"
                style={{ borderColor: consentBorder || undefined, ...(br ? { borderRadius: br } : {}) }}
              />
            ) : (
              <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-card text-lg font-bold"
                style={br ? { borderRadius: br } : undefined}>
                {client.name.charAt(0)}
              </div>
            )}
            {verificationStatus === 'official' && (
              <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-background bg-primary text-[10px] text-primary-foreground shadow-sm" title="Official App">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </span>
            )}
            {verificationStatus === 'verified' && (
              <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border-2 border-background bg-green-600 text-[10px] text-white shadow-sm" title="Verified">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="M20 6 9 17l-5-5"/></svg>
              </span>
            )}
          </div>
          <h1 className="text-xl font-semibold" style={consentText ? { color: consentText } : undefined}>{client.name}</h1>
          <p className="text-sm" style={consentMuted ? { color: consentMuted } : { color: undefined }}>
            wants to access your Void account
          </p>
          {verificationStatus === 'unverified' && (
            <p className="text-[10px] text-muted-foreground/60 mt-1">Unverified app. Proceed with caution.</p>
          )}
        </div>

        {/* User card */}
        <div className="space-y-2">
          <p className="text-xs font-medium" style={consentMuted ? { color: consentMuted } : { color: undefined }}>
            Authorize as
          </p>
          <div className="flex items-center gap-3 rounded-2xl border p-3" style={{ borderColor: consentBorder || undefined, ...(br ? { borderRadius: br } : {}) }}>
            <Avatar className="size-9">
              <AvatarImage src={user.avatarUrl} alt={user.name} />
              <AvatarFallback className="text-sm">{user.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-0.5">
              <p className="text-sm font-medium" style={consentText ? { color: consentText } : undefined}>{user.name}</p>
              <p className="text-xs" style={consentMuted ? { color: consentMuted } : { color: undefined }}>{user.email}</p>
            </div>
          </div>
        </div>

        <Separator style={consentBorder ? { background: consentBorder } : undefined} />

        {/* Permissions */}
        <div className="space-y-2.5">
          <p className="text-xs font-medium" style={consentMuted ? { color: consentMuted } : { color: undefined }}>
            {client.name} will be able to:
          </p>
          <ul className="space-y-2">
            {requestedScopes.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm" style={consentText ? { color: consentText } : undefined}>
                <span className="mt-0.5" style={{ color: t?.primaryColor || undefined }}>✓</span>
                <span>{SCOPE_LABELS[s] || s}</span>
              </li>
            ))}
          </ul>
        </div>

        {client.description && (
          <p className="text-xs" style={consentMuted ? { color: consentMuted } : { color: undefined }}>
            {client.description}
          </p>
        )}

        <Separator style={consentBorder ? { background: consentBorder } : undefined} />

        {/* Actions */}
        <div className="space-y-2.5">
          <Button
            className="w-full"
            onClick={handleAuthorize}
            disabled={authorizing}
            style={{ ...(t?.primaryColor ? { background: DM ? t.primaryColor : t.primaryColor, color: '#fff' } : {}), ...(br ? { borderRadius: br } : {}) }}
          >
            {authorizing ? "Authorizing..." : "Authorize"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={handleCancel}
            disabled={authorizing}
            style={br ? { borderRadius: br } : undefined}
          >
            Cancel
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          By authorizing, you allow this app to access your information according
          to the{" "}
          <a href="#" className="underline underline-offset-4">
            privacy policy
          </a>
        </p>
      </div>
    </div>
  )
}
