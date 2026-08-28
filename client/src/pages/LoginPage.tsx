import { useState, useRef, useEffect } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { useAuth } from "@/contexts/auth"
import { loginWithPasskey, loginWithMFA, requestMagicLink, verifyAuth } from "@/lib/auth"
import { apiClient, storeUser } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VoidLogo } from "@/components/VoidLogo"
import Dialog from '@/components/ui/dialog'
import { cn, safeRedirect } from "@/lib/utils"
import { getDeviceId, getDeviceName } from "@/lib/api"

type Step = 'email' | 'method' | 'password_entry' | 'confirm_remember' | 'mfa' | 'magic_link_sent'
type Method = 'password' | 'passkey' | 'magic_link'

const methodIcons: Record<Method, { label: string; icon: JSX.Element }> = {
  password: {
    label: 'Password',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
  },
  passkey: {
    label: 'Passkey',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/></svg>,
  },
  magic_link: {
    label: 'Magic link',
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
  },
}

export function LoginPage() {
  const auth = useAuth()
  const { login, refreshUser, maintenanceMode, isAdmin } = auth
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect") ?? "/dashboard"

  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const [mfaToken, setMfaToken] = useState<string | null>(null)
  const [mfaCode, setMfaCode] = useState("")
  const [showBackupModal, setShowBackupModal] = useState(false)
  const [backupInput, setBackupInput] = useState("")

  const [availableMethods, setAvailableMethods] = useState<Method[]>(['magic_link', 'password'])
  const [pendingMethod, setPendingMethod] = useState<Method | null>(null)
  const [keepMeLoggedIn, setKeepMeLoggedIn] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (step === 'password_entry') {
      setTimeout(() => passwordRef.current?.focus(), 350)
    }
  }, [step])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return setError("Enter your email")
    setLoading(true)
    setError("")
    try {
      const result = await apiClient.post<{ exists: boolean; hasPasskey: boolean; hasTwoFactor: boolean; emailConfigured: boolean }>('/auth/check-email', { email: trimmed })
      if (!result.exists) {
        setError("No account found with this email")
        return
      }

      // Priority: magic_link (if email configured), passkey (if registered), then password
      const methods: Method[] = []
      if (result.emailConfigured) methods.push('magic_link')
      if (result.hasPasskey) methods.push('passkey')
      methods.push('password')
      setAvailableMethods(methods)
      setStep('method')
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  function handleMethodSelect(m: Method) {
    setError("")
    if (m === 'passkey') {
      setPendingMethod('passkey')
      setStep('confirm_remember')
    } else if (m === 'magic_link') {
      handleSendMagicLink()
    } else {
      setStep('password_entry')
    }
  }

  async function handleSendMagicLink() {
    setLoading(true)
    setError("")
    try {
      await requestMagicLink(email)
      setStep('magic_link_sent')
    } catch (err: any) {
      setError(err?.error || err?.message || "Failed to send magic link")
    } finally {
      setLoading(false)
    }
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStep('confirm_remember')
  }

  async function handleRememberChoice(remember: boolean) {
    setKeepMeLoggedIn(remember)
    setLoading(true)
    setError("")

    try {
      if (pendingMethod === 'passkey') {
        await doPasskeyLogin(remember)
      } else {
        await doPasswordLogin(remember)
      }
    } catch (err: any) {
      setError(err?.error || err?.message || "Authentication failed")
      setStep('password_entry')
    } finally {
      setLoading(false)
    }
  }

  async function doPasswordLogin(remember: boolean) {
    const result = await login(email, password, remember)
    if (result && 'mfaRequired' in result && result.mfaRequired) {
      setMfaToken(result.mfaToken)
      setStep('mfa')
      return
    }
    if (result.error) {
      setError(result.error)
      setStep('password_entry')
    } else {
      safeRedirect(navigate, redirect)
    }
  }

  async function doPasskeyLogin(remember: boolean) {
    const result = await loginWithPasskey(email, remember)
    if ("error" in result) {
      setError(result.error)
      setStep('method')
    } else if (result && 'mfaRequired' in result && result.mfaRequired) {
      setMfaToken(result.mfaToken)
      setStep('mfa')
    } else {
      refreshUser()
      await new Promise(resolve => setTimeout(resolve, 0))
      safeRedirect(navigate, redirect)
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!mfaToken) return
    setLoading(true)
    setError("")
    try {
      const res = await loginWithMFA(mfaToken, mfaCode, keepMeLoggedIn)
      setLoading(false)
    if ((res as any).error) {
      setError((res as any).error)
    } else {
      await verifyAuth()
      refreshUser()
      await new Promise(resolve => setTimeout(resolve, 0))
      safeRedirect(navigate, redirect)
    }
    } catch (err: any) {
      setLoading(false)
      setError(err.message || "MFA failed")
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-xs overflow-hidden">
        <div className="flex flex-col items-center gap-5 mb-8">
          <VoidLogo size="lg" />
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
            <p className="text-sm text-muted-foreground">Welcome back</p>
          </div>
        </div>

        {maintenanceMode && !isAdmin && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-600/10 px-4 py-3 text-sm text-amber-600 text-center mb-4">
            VoidAuth is under maintenance. Only administrators can sign in.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive mb-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {error}
          </div>
        )}

        {step === 'mfa' ? (
          <form onSubmit={handleMfaSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <button
              type="button"
              onClick={() => { setStep('password_entry'); setMfaCode(""); setError("") }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="m15 18-6-6 6-6"/></svg>
              Back
            </button>
            <div className="space-y-1.5">
              <Label htmlFor="mfa">Enter 2FA code</Label>
              <Input id="mfa" placeholder="123456" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} required autoFocus />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" size="lg" disabled={loading}>{loading ? 'Verifying…' : 'Verify'}</Button>
              <Button type="button" variant="outline" className="flex-1" onClick={() => setShowBackupModal(true)} disabled={loading}>Backup code</Button>
            </div>
          </form>
        ) : (
          <div className="relative">
            {/* Email step */}
            <div className={cn(
              "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              step === 'email' ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 -translate-x-8 pointer-events-none absolute inset-0"
            )}>
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="email" ref={emailRef} />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>Next</Button>
              </form>
            </div>

            {/* Method step — full method buttons, no input fields */}
            <div className={cn(
              "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              step === 'method' ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 translate-x-8 pointer-events-none absolute inset-0"
            )}>
              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => { setStep('email'); setError("") }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="m15 18-6-6 6-6"/></svg>
                  {email}
                </button>

                <div className="space-y-2">
                  {availableMethods.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => handleMethodSelect(m)}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium hover:bg-muted/50 transition-colors text-left"
                    >
                      <span className="shrink-0 text-muted-foreground">{methodIcons[m].icon}</span>
                      <span>{methodIcons[m].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Password entry step */}
            <div className={cn(
              "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              step === 'password_entry' ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 translate-x-8 pointer-events-none absolute inset-0"
            )}>
              <button
                type="button"
                onClick={() => { setStep('method'); setPassword(""); setError("") }}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="m15 18-6-6 6-6"/></svg>
                {email}
              </button>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" ref={passwordRef} />
                </div>
                <Link to={`/forgot-password${redirect !== "/dashboard" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="block text-xs text-muted-foreground hover:text-foreground transition-colors">Forgot password?</Link>
                <Button type="submit" className="w-full" size="lg" disabled={loading}>Sign in</Button>
              </form>
            </div>

            {/* Confirm "Keep me logged in?" step */}
            <div className={cn(
              "transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              step === 'confirm_remember' ? "opacity-100 translate-x-0 pointer-events-auto" : "opacity-0 translate-x-8 pointer-events-none absolute inset-0"
            )}>
              <div className="text-center space-y-6 pt-2">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Keep you logged in?</p>
                  <p className="text-xs text-muted-foreground">Stay signed in for up to 30 days</p>
                </div>
                <div className="flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    size="lg"
                    onClick={() => handleRememberChoice(false)}
                    disabled={loading}
                  >
                    No
                  </Button>
                  <Button
                    type="button"
                    className="flex-1"
                    size="lg"
                    onClick={() => handleRememberChoice(true)}
                    disabled={loading}
                  >
                    Yes
                  </Button>
                </div>
              </div>
            </div>

            {/* Magic link sent screen */}
            {step === 'magic_link_sent' && (
              <div className="space-y-4 animate-in fade-in zoom-in-95 duration-200">
                <button
                  type="button"
                  onClick={() => { setStep('method'); setError("") }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3"><path d="m15 18-6-6 6-6"/></svg>
                  Back
                </button>
                <div className="rounded-xl border border-border bg-card p-4 space-y-3 text-center">
                  <div className="mx-auto size-10 rounded-full bg-green-500/10 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-green-500"><path d="M22 10.5V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12.5"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M18 15.28c.2-.4.5-.73.9-.95a1.5 1.5 0 0 1 1.84.52c.35.53.28 1.22-.17 1.65L18 19l-.57-.5c-.45-.43-.52-1.12-.17-1.65a1.5 1.5 0 0 1 1.84-.52c.4.22.7.55.9.95"/></svg>
                  </div>
                  <p className="text-sm font-medium">Check your email</p>
                  <p className="text-xs text-muted-foreground">We sent a sign-in link to <span className="font-medium text-foreground">{email}</span></p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Backup code modal */}
        {showBackupModal && (
          <Dialog open={showBackupModal} onOpenChange={(v: boolean) => { if (!v) { setShowBackupModal(false); setBackupInput(''); setError('') } }} title="Enter backup code" description="Enter one of the single-use backup codes generated when you enabled 2FA.">
            <div>
              <Input value={backupInput} onChange={(e) => setBackupInput(e.target.value)} placeholder="xxxxxxxx-xxxx" />
              {error && <div className="mt-2 text-xs text-destructive">{error}</div>}
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => { setShowBackupModal(false); setBackupInput(''); setError('') }}>Cancel</Button>
                <Button onClick={async () => {
                  if (!mfaToken) return setError('MFA token missing')
                  if (!backupInput) return setError('Enter a backup code')
                  setLoading(true); setError('')
                  try {
                    const res = await apiClient.post('/auth/login/2fa/backup', { mfa_token: mfaToken, code: backupInput, keepMeLoggedIn, device_id: getDeviceId(), device_name: getDeviceName() })
                    setLoading(false)
                    if (res.user) {
                      storeUser(res.user)
                      refreshUser(); setShowBackupModal(false); setBackupInput('')
                      safeRedirect(navigate, redirect)
                    } else {
                      setError('Backup code redeem failed')
                    }
                  } catch (err: any) {
                    setLoading(false); setError(err.error || err.message || 'Failed to redeem backup code')
                  }
                }} disabled={loading}>{loading ? 'Submitting…' : 'Redeem'}</Button>
              </div>
            </div>
          </Dialog>
        )}

        {step !== 'mfa' && (
          <div className="space-y-2 mt-6">
            <p className="text-center text-sm text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link to={`/register${redirect !== "/dashboard" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="text-foreground underline-offset-4 hover:underline">
                Register
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
