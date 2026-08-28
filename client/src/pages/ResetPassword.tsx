import { useState, useEffect } from "react"
import { Link, useSearchParams, useNavigate } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VoidLogo } from "@/components/VoidLogo"
import { checkPasswordStrength, checkPasswordBreach, resetPassword } from "@/lib/auth"

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get("token") || ""
  const email = searchParams.get("email") || ""
  const redirect = searchParams.get("redirect") ?? "/dashboard"

  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const [strengthScore, setStrengthScore] = useState(-1)
  const [strengthWarning, setStrengthWarning] = useState("")
  const [isBreached, setIsBreached] = useState(false)
  const [checkingStrength, setCheckingStrength] = useState(false)

  useEffect(() => {
    if (!password || password.length < 3) {
      setStrengthScore(-1); setStrengthWarning(""); setIsBreached(false)
      return
    }
    const timeout = setTimeout(async () => {
      setCheckingStrength(true)
      try { const s = await checkPasswordStrength(password); setStrengthScore(s.score); setStrengthWarning(s.warning || "") } catch { setStrengthScore(-1) }
      try { const b = await checkPasswordBreach(password); setIsBreached(b.breached) } catch { setIsBreached(false) }
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
    const result = await resetPassword(email, token, password)
    setLoading(false)
    if (result.success) {
      setSuccess(true)
    } else {
      setError(result.error || "Failed to reset password")
    }
  }

  if (!token || !email) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-8">
          <div className="flex flex-col items-center gap-5">
            <VoidLogo size="lg" />
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold tracking-tight">Invalid reset link</h1>
              <p className="text-sm text-muted-foreground">
                This password reset link is invalid or has expired.
              </p>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            <Link to={`/forgot-password${redirect !== "/dashboard" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="text-foreground underline-offset-4 hover:underline">
              Request a new reset link
            </Link>
          </p>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-8">
          <div className="flex flex-col items-center gap-5">
            <VoidLogo size="lg" />
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold tracking-tight">Password reset</h1>
              <p className="text-sm text-muted-foreground">
                Your password has been reset successfully.
              </p>
            </div>
          </div>
          <Button className="w-full" size="lg" onClick={() => navigate(`/login${redirect !== "/dashboard" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`)}>
            Sign in with new password
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-xs space-y-8">
        <div className="flex flex-col items-center gap-5">
          <VoidLogo size="lg" />
          <div className="space-y-1 text-center">
            <h1 className="text-xl font-semibold tracking-tight">Set new password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your new password for {email}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              autoComplete="new-password"
            />
            {strengthScore >= 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-200 ${checkingStrength ? "bg-muted animate-pulse" : i <= strengthScore ? strengthScore <= 1 ? "bg-destructive" : strengthScore <= 2 ? "bg-amber-500" : "bg-green-500" : "bg-muted"}`} />
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {strengthScore <= 1 ? "Weak" : strengthScore <= 2 ? "Fair" : strengthScore <= 3 ? "Good" : "Strong"}
                  {strengthWarning ? ` — ${strengthWarning}` : ""}
                </p>
              </div>
            )}
            {isBreached && (
              <p className="text-[10px] text-destructive mt-1">This password has appeared in a data breach. Please choose a different password.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm">Confirm new password</Label>
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
            {loading ? "Resetting…" : "Reset password"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          <Link
            to={`/login${redirect !== "/dashboard" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
            className="text-foreground underline-offset-4 hover:underline"
          >
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
