import { useState } from "react"
import { Link, useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { VoidLogo } from "@/components/VoidLogo"
import { forgotPassword } from "@/lib/auth"

export function ForgotPasswordPage() {
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get("redirect") ?? "/dashboard"
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")
    const result = await forgotPassword(email)
    setLoading(false)
    if (result.success) {
      setSent(true)
    } else {
      setError(result.error || "Failed to send reset email")
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-8">
          <div className="flex flex-col items-center gap-5">
            <VoidLogo size="lg" />
            <div className="space-y-1 text-center">
              <h1 className="text-xl font-semibold tracking-tight">Check your email</h1>
              <p className="text-sm text-muted-foreground">
                If an account exists for {email}, you'll receive a password reset link shortly.
              </p>
            </div>
          </div>
          <p className="text-center text-sm text-muted-foreground">
            <Link to={`/login${redirect !== "/dashboard" ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="text-foreground underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
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
            <h1 className="text-xl font-semibold tracking-tight">Forgot password</h1>
            <p className="text-sm text-muted-foreground">
              Enter your email and we'll send you a reset link.
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
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              autoComplete="email"
            />
          </div>

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Sending…" : "Send reset link"}
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
