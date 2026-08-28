import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { hasPin, setPin as storePin, verifyPin, isLockedOut, getLockoutSeconds } from "@/lib/encrypted-storage"

const LOCKED_KEY = "ava_locked"
const LOCK_TIMEOUT = 5 * 60 * 1000

let lastActivity = Date.now()
export function resetActivityTimer() { lastActivity = Date.now() }

export function isLocked(): boolean {
  if (!hasPin()) return false
  const lockedAt = localStorage.getItem(LOCKED_KEY)
  if (!lockedAt) return false
  if (Date.now() - lastActivity > LOCK_TIMEOUT) {
    localStorage.setItem(LOCKED_KEY, Date.now().toString())
    return true
  }
  return lockedAt === "1"
}

function lock() {
  localStorage.setItem(LOCKED_KEY, "1")
}

function unlock() {
  localStorage.setItem(LOCKED_KEY, "0")
}

interface PinLockProps {
  onUnlock: (pin: string) => void
}

export function PinLock({ onUnlock }: PinLockProps) {
  const [pin, setPin] = useState("")
  const [error, setError] = useState("")
  const [settingPin, setSettingPin] = useState(!hasPin())
  const [lockoutSeconds, setLockoutSeconds] = useState(isLockedOut() ? getLockoutSeconds() : 0)

  useEffect(() => {
    const onActivity = () => (lastActivity = Date.now())
    window.addEventListener("mousedown", onActivity)
    window.addEventListener("keydown", onActivity)
    return () => {
      window.removeEventListener("mousedown", onActivity)
      window.removeEventListener("keydown", onActivity)
    }
  }, [])

  useEffect(() => {
    if (hasPin() && isLocked()) {
      const t = setInterval(() => {
        if (Date.now() - lastActivity > LOCK_TIMEOUT) lock()
      }, 30000)
      return () => clearInterval(t)
    }
  }, [])

  useEffect(() => {
    if (!lockoutSeconds) return
    const t = setInterval(() => {
      const remaining = getLockoutSeconds()
      if (remaining <= 0) {
        setLockoutSeconds(0)
        clearInterval(t)
      } else {
        setLockoutSeconds(remaining)
      }
    }, 1000)
    return () => clearInterval(t)
  }, [lockoutSeconds])

  const handleSubmit = useCallback(async () => {
    if (pin.length < 4) { setError("Min 4 digits"); return }

    if (settingPin) {
      await storePin(pin)
      unlock()
      setSettingPin(false)
      onUnlock(pin)
      return
    }

    const valid = await verifyPin(pin)
    if (valid) {
      setError("")
      unlock()
      onUnlock(pin)
    } else {
      if (isLockedOut()) {
        setLockoutSeconds(getLockoutSeconds())
        setError("Too many attempts. Try again later.")
      } else {
        setError("Wrong PIN")
      }
      setPin("")
    }
  }, [pin, settingPin, onUnlock])

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-xs space-y-4 text-center">
        <h2 className="text-lg font-semibold">
          {settingPin ? "Set Lock PIN" : "Enter PIN"}
        </h2>
        <Input
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder="Enter PIN"
          className="text-center text-2xl tracking-[0.5em]"
          value={pin}
          onChange={(e) => { setError(""); setPin(e.target.value.replace(/\D/g, "")) }}
          onKeyDown={(e) => { if (e.key === "Enter") handleSubmit() }}
          disabled={lockoutSeconds > 0}
          autoFocus
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        {lockoutSeconds > 0 && (
          <p className="text-xs text-muted-foreground">
            Locked for {lockoutSeconds}s
          </p>
        )}
        <Button className="w-full" onClick={handleSubmit} disabled={lockoutSeconds > 0}>
          {settingPin ? "Set PIN" : "Unlock"}
        </Button>
        {settingPin && (
          <p className="text-xs text-muted-foreground">
            PIN is stored locally. There is no recovery if you forget it.
          </p>
        )}
      </div>
    </div>
  )
}
