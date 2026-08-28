import { useState, useEffect } from "react"
import { Link } from "react-router"
import { getUserSessions, revokeSession, type SessionInfo } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { VoidLogo } from "@/components/VoidLogo"

function formatUA(ua: string | null) {
  if (!ua) return "Unknown device"
  if (ua.includes("Chrome")) return "Chrome"
  if (ua.includes("Firefox")) return "Firefox"
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari"
  if (ua.includes("Edge")) return "Edge"
  return ua.length > 40 ? ua.slice(0, 40) + "…" : ua
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const s = await getUserSessions()
    setSessions(s)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleRevoke(id: string) {
    setRevoking(id)
    const result = await revokeSession(id)
    setRevoking(null)
    if (result.success) {
      setSessions((prev) => prev.filter((s) => s.id !== id))
      setError(null)
    } else {
      setError(result.error || "Failed to revoke session")
    }
  }

  async function handleRevokeAll() {
    setError(null)
    for (const s of sessions) {
      setRevoking(s.id)
      await revokeSession(s.id)
    }
    setRevoking(null)
    setSessions([])
  }

  return (
    <div className="min-h-svh">
      <nav className="flex items-center justify-between border-b border-border px-6 py-3">
        <VoidLogo />
        <Link to="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">Dashboard</Link>
      </nav>

      <main className="mx-auto max-w-2xl space-y-8 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Active Sessions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage devices and browsers signed into your account.
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-8 w-16 rounded-lg" />
                </div>
              </div>
            ))
          ) : sessions.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto size-8 text-muted-foreground mb-3">
                <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
              </svg>
              <p className="text-sm text-muted-foreground">No active sessions.</p>
              <p className="text-xs text-muted-foreground mt-1">Your session may have expired. Try signing in again.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{sessions.length} active session{sessions.length !== 1 ? "s" : ""}</p>
                {sessions.length > 1 && (
                  <Button variant="ghost" size="xs" className="text-destructive" onClick={handleRevokeAll}>
                    Revoke all
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div key={s.id} className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{formatUA(s.user_agent || null)}</p>
                        <Badge variant="secondary" className="text-[10px]">Active</Badge>
                      </div>
                      {s.ip_address && <p className="text-xs text-muted-foreground font-mono">{s.ip_address}</p>}
                      {s.location && <p className="text-xs text-muted-foreground">{s.location}</p>}
                      <p className="text-[10px] text-muted-foreground">
                        Created {new Date(s.created_at).toLocaleString()} · Expires {new Date(s.expires_at).toLocaleString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-destructive shrink-0"
                      onClick={() => handleRevoke(s.id)}
                      disabled={revoking === s.id}
                    >
                      {revoking === s.id ? "Revoking…" : "Revoke"}
                    </Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <Separator />

        <div className="flex items-center justify-between pb-6">
          <span className="text-xs text-muted-foreground">VoidAuth · Secure by default</span>
        </div>
      </main>
    </div>
  )
}
