import { useEffect, useRef, useState } from "react"
import { KeyRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { MailLogo } from "@/components/MailLogo"
import { isLockedOut, getLockoutSeconds, verifyPin } from "@/lib/pin-state"

/**
 * App-lock gate — a UI lock (not a crypto layer). Auto-unlocks in the same
 * session; after a reload the PIN must be re-entered.
 */
export function PinGate({ onUnlock }: { onUnlock: () => void }) {
  const [pin, setPin] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [lockout, setLockout] = useState<number>(isLockedOut() ? getLockoutSeconds() : 0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!lockout) return
    const t = setInterval(() => {
      const remaining = getLockoutSeconds()
      if (remaining <= 0) {
        setLockout(0)
        clearInterval(t)
      } else {
        setLockout(remaining)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [lockout])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!pin) return
    const ok = await verifyPin(pin)
    if (ok) {
      onUnlock()
    } else {
      setPin("")
      if (isLockedOut()) {
        setLockout(getLockoutSeconds())
        setError("Too many attempts. Try again later.")
      } else {
        setError("Incorrect PIN")
      }
      inputRef.current?.focus()
    }
  }

  function formatLockout(seconds: number): string {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${String(s).padStart(2, "0")}`
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-xs space-y-6 text-center">
        <div className="space-y-2">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <KeyRound className="size-7 text-primary" aria-hidden="true" />
          </div>
          <MailLogo size="lg" tagline className="justify-center" />
          <p className="text-sm text-muted-foreground">Enter your PIN to unlock m3il</p>
        </div>

        <div className="space-y-3">
          <Input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            placeholder="••••••"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, "").slice(0, 8))
              setError(null)
            }}
            className="h-12 text-center text-lg tracking-[0.5em]"
            aria-label="PIN"
            disabled={lockout > 0}
          />
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          {lockout > 0 ? <p className="text-xs text-muted-foreground">Locked for {formatLockout(lockout)}</p> : null}
          <Button type="submit" className="w-full" size="lg" disabled={!pin || lockout > 0}>
            Unlock
          </Button>
        </div>
      </form>
    </div>
  )
}