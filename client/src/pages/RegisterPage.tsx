import { useState, useEffect } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { useAuth } from "@/contexts/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { VoidLogo } from "@/components/VoidLogo"
import { getAuthSettings, contactAdmin, checkPasswordStrength, checkPasswordBreach } from "@/lib/auth"
import { safeRedirect } from "@/lib/utils"

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect") ?? "/dashboard"

  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  // Password strength
  const [strengthScore, setStrengthScore] = useState(-1)
  const [strengthWarning, setStrengthWarning] = useState("")
  const [isBreached, setIsBreached] = useState(false)
  const [checkingStrength, setCheckingStrength] = useState(false)

  // Email verification
  const [requireEmailVerify, setRequireEmailVerify] = useState(false)
  const [registrationDone, setRegistrationDone] = useState(false)

  // Contact form state
  const [allowSignups, setAllowSignups] = useState<boolean | null>(null)
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactMessage, setContactMessage] = useState("")
  const [contactSent, setContactSent] = useState(false)
  const [contactError, setContactError] = useState("")
  const [contactLoading, setContactLoading] = useState(false)

  useEffect(() => {
    getAuthSettings().then(s => {
      setAllowSignups(s.allow_signups)
      if ((s as any).require_email_verification) {
        setRequireEmailVerify(true)
      }
    })
  }, [])

  // Check password strength on change
  useEffect(() => {
    if (!password || password.length < 3) {
      setStrengthScore(-1)
      setStrengthWarning("")
      setIsBreached(false)
      return
    }
    const timeout = setTimeout(async () => {
      setCheckingStrength(true)
      try {
        const s = await checkPasswordStrength(password)
        setStrengthScore(s.score)
        setStrengthWarning(s.warning || "")
      } catch {
        setStrengthScore(-1)
      }
      try {
        const b = await checkPasswordBreach(password)
        setIsBreached(b.breached)
      } catch {
        setIsBreached(false)
      }
      setCheckingStrength(false)
    }, 300)
    return () => clearTimeout(timeout)
  }, [password])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError("Passwords do not match.")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.")
      return
    }
    setLoading(true)
    setError("")
    const result = await register(name, email, password)
    setLoading(false)
    if (result.error) {
      setError(result.error)
    } else if (requireEmailVerify) {
      setRegistrationDone(true)
    } else {
      safeRedirect(navigate, redirect)
    }
  }

  async function handleContact(e: React.FormEvent) {
    e.preventDefault()
    setContactLoading(true)
    setContactError("")
    const result = await contactAdmin(contactName, contactEmail, contactMessage)
    setContactLoading(false)
    if (result.success) {
      setContactSent(true)
    } else {
      setContactError(result.error || "Failed to send message")
    }
  }

  if (allowSignups === null) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    )
  }

  if (!allowSignups) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-8">
          <div className="flex flex-col items-center gap-5">
            <VoidLogo size="lg" />
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold tracking-tight">Registration closed</h1>
              <p className="text-sm text-muted-foreground">
                New user registration is currently disabled. Contact the administrator to request access.
              </p>
            </div>
          </div>

          {contactSent ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 text-center">
                Your message has been sent. The administrator will get back to you.
              </div>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          ) : (
            <>
              <form onSubmit={handleContact} className="space-y-4">
                {contactError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    {contactError}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="contact-name">Your name</Label>
                  <Input id="contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} required autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-email">Your email</Label>
                  <Input id="contact-email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact-message">Message</Label>
                  <Textarea id="contact-message" value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} placeholder="Tell the admin why you need access…" rows={4} required />
                </div>
                <Button type="submit" className="w-full" size="lg" disabled={contactLoading}>
                  {contactLoading ? "Sending…" : "Send request"}
                </Button>
              </form>
              <p className="text-center text-sm text-muted-foreground">
                <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
                  Back to sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-5">
          <VoidLogo size="lg" />
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold tracking-tight">
              Create account
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign up to get started with Void
            </p>
          </div>
        </div>

        {/* Form */}
        {registrationDone ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-600 text-center">
              Account created! Please check your email to verify your account before signing in.
            </div>
            <Button className="w-full" variant="outline" onClick={() => navigate(`/login${redirect !== "/dashboard" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`)}>
              Go to sign in
            </Button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              autoComplete="name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            {strengthScore >= 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors duration-200 ${
                        checkingStrength
                          ? "bg-muted animate-pulse"
                          : i <= strengthScore
                          ? strengthScore <= 1
                            ? "bg-destructive"
                            : strengthScore <= 2
                            ? "bg-amber-500"
                            : "bg-green-500"
                          : "bg-muted"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {strengthScore <= 1 ? "Weak" : strengthScore <= 2 ? "Fair" : strengthScore <= 3 ? "Good" : "Strong"}
                  {strengthWarning ? ` — ${strengthWarning}` : ""}
                </p>
              </div>
            )}
            {isBreached && (
              <p className="text-[10px] text-destructive mt-1">
                This password has appeared in a data breach. Please choose a different password.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </Button>
        </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to={`/login${redirect !== "/dashboard" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or</span>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            to="/forgot-password"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  )
}
