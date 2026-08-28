import { useState, useEffect } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { useAuth } from "@/contexts/auth"
import { verifyMagicLink, verifyAuth } from "@/lib/auth"
import { apiClient, storeUser } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { VoidLogo } from "@/components/VoidLogo"
import { Link } from "react-router"
import { safeRedirect } from "@/lib/utils"

export function MagicLinkConfirm() {
  const { refreshUser } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const email = searchParams.get("email")
  const redirect = searchParams.get("redirect") ?? "/dashboard"

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState("")

  useEffect(() => {
    if (!token || !email) {
      setStatus('error')
      setErrorMsg("Invalid magic link")
      return
    }
    if (status === 'loading') {
      verifyMagicLink(email, token).then((result: any) => {
        if (result.error) {
          setStatus('error')
          setErrorMsg(result.error)
        } else {
          storeUser(result.user)
          verifyAuth().then(() => refreshUser())
          setStatus('success')
          setTimeout(() => safeRedirect(navigate, redirect), 1500)
        }
      }).catch((err: any) => {
        setStatus('error')
        setErrorMsg(err.message || "Failed to verify magic link")
      })
    }
  }, [token, email])

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-8 text-center">
        <VoidLogo size="lg" />

        {status === 'loading' && (
          <div className="space-y-4">
            <div className="mx-auto size-10 rounded-full border-[3px] border-border border-t-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Verifying your magic link...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
            <div className="mx-auto size-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-green-500"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <p className="text-sm font-medium">Signed in successfully</p>
            <p className="text-xs text-muted-foreground">Redirecting to your dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="mx-auto size-10 rounded-full bg-destructive/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-destructive"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
            </div>
            <p className="text-sm font-medium">Verification failed</p>
            <p className="text-xs text-muted-foreground">{errorMsg || "The link may have expired or already been used."}</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/login">Back to login</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
