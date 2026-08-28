import { useState, useEffect, useCallback } from "react"
import { Navigate } from "react-router"
import { useOAuth } from "@/contexts/oauth"
import { isLocked, PinLock, resetActivityTimer } from "@/components/PinLock"
import { hasPin } from "@/lib/encrypted-storage"
import { setPin as storePin } from "@/lib/pin-state"

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, isOffline } = useOAuth()
  const [locked, setLocked] = useState(false)

  useEffect(() => {
    if (isAuthenticated) {
      setLocked(isLocked())
    }
  }, [isAuthenticated])

  useEffect(() => {
    const handler = () => resetActivityTimer()
    window.addEventListener("keydown", handler)
    window.addEventListener("mousedown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
      window.removeEventListener("mousedown", handler)
    }
  }, [])

  const handleUnlock = useCallback((pin: string) => {
    storePin(pin)
    setLocked(false)
    resetActivityTimer()
  }, [])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (locked && hasPin()) return <PinLock onUnlock={handleUnlock} />
  return <>{children}</>
}
