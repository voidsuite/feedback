import { useState, useEffect } from "react"
import { Link } from "react-router"
import { getAdminDashboard } from "@/lib/auth"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

function formatBytes(b: number) {
  const n = Number(b) || 0
  if (n === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function AdminDashboard() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAdminDashboard().then((d) => { setData(d); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="space-y-1">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="grid grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="space-y-1.5 rounded-2xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-12 mt-1" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map(s => (
            <div key={s} className="space-y-3">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="rounded-2xl border border-border bg-card divide-y divide-border">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between px-4 py-3">
                    <div className="space-y-1">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                    <Skeleton className="h-5 w-14 rounded-md" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data) return <p className="text-sm text-muted-foreground">Failed to load dashboard data.</p>

  const { stats, recentUsers, appsByStatus, recentTokens, storageLeaders } = data

  const statCards = [
    { label: "Total Users", value: stats.totalUsers },
    { label: "Active Users", value: stats.activeUsers },
    { label: "2FA Enabled", value: stats.twoFactorEnabled },
    { label: "Passkeys", value: stats.passkeyCount },
    { label: "Applications", value: stats.totalApps },
    { label: "Active Sessions", value: stats.activeSessions },
    { label: "Active Tokens", value: stats.totalTokens },
    { label: "Tokens Today", value: stats.tokensToday },
    { label: "Storage Used", value: formatBytes(stats.totalStorage) },
    { label: "Files Stored", value: stats.totalFiles },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview of your VoidAuth instance.</p>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className="space-y-1.5 rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-2xl font-semibold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Recent Users */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent Users</h2>
            <Link to="/admin/users" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {recentUsers.map((u: any) => (
              <Link key={u.id} to={`/admin/users/${u.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                <div>
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-xs text-muted-foreground">{u.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Apps by Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Apps by Status</h2>
            <Link to="/admin/apps" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {appsByStatus.map((a: any) => (
              <div key={a.verification_status} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm capitalize">{a.verification_status}</span>
                <Badge variant={a.verification_status === 'official' ? 'default' : a.verification_status === 'verified' ? 'secondary' : 'outline'}>
                  {a.count}
                </Badge>
              </div>
            ))}
            {appsByStatus.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">No apps registered yet.</p>
            )}
          </div>
        </div>

        {/* Recent Tokens */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent Tokens</h2>
            <Link to="/admin/tokens" className="text-xs text-muted-foreground hover:text-foreground">View all</Link>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {recentTokens.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No tokens issued yet.</p>
            ) : recentTokens.map((t: any) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium truncate">{t.client_name}</p>
                  <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{t.user_email}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Storage Leaders */}
      {storageLeaders.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Top Storage Users</h2>
            <Link to="/admin/storage" className="text-xs text-muted-foreground hover:text-foreground">View details</Link>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {storageLeaders.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <Link to={`/admin/users/${u.id}`} className="text-sm font-medium hover:underline">{u.name}</Link>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{formatBytes(u.total_bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
