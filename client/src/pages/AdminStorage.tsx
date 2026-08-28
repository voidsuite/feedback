import { useState, useEffect } from "react"
import { Link } from "react-router"
import { getAdminStorage } from "@/lib/auth"
import { Skeleton } from "@/components/ui/skeleton"

function formatBytes(b: number) {
  const n = Number(b) || 0
  if (n === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function AdminStorage() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    getAdminStorage().then(setData)
  }, [])

  if (!data) return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-3 w-full rounded-full" />
      <div className="grid grid-cols-2 gap-6">
        {[1, 2].map(s => (
          <div key={s} className="space-y-3">
            <Skeleton className="h-4 w-36" />
            <div className="rounded-2xl border border-border bg-card divide-y divide-border">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                  <Skeleton className="h-3.5 w-20" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  const { summary, topUsers, topApps, mimeBreakdown } = data

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Storage Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">View storage usage across all users and applications.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Storage Used</p>
          <p className="text-2xl font-semibold mt-1">{formatBytes(summary.totalBytes)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Files</p>
          <p className="text-2xl font-semibold mt-1">{summary.totalFiles}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total Quota</p>
          <p className="text-2xl font-semibold mt-1">{formatBytes(summary.totalQuota)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Quota Used</p>
          <p className="text-2xl font-semibold mt-1">{summary.usedPercent}%</p>
        </div>
      </div>

      {/* Quota bar */}
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(summary.usedPercent, 100)}%` }} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Top Users */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Top Storage Users</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {topUsers.map((u: any) => (
              <div key={u.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <Link to={`/admin/users/${u.id}`} className="text-sm font-medium hover:underline">{u.name}</Link>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-mono">{formatBytes(u.used_bytes)}</p>
                  <p className="text-[10px] text-muted-foreground">{u.file_count} file{u.file_count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Apps */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Top Apps by Storage</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {topApps.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">No app storage data yet.</p>
            ) : topApps.map((a: any) => (
              <div key={a.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{a.client_id}</p>
                </div>
                <div className="text-right shrink-0 ml-4">
                  <p className="text-sm font-mono">{formatBytes(a.used_bytes)}</p>
                  <p className="text-[10px] text-muted-foreground">{a.file_count} file{a.file_count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MIME Type Breakdown */}
      {mimeBreakdown.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">Storage by File Type</h2>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card">
            {mimeBreakdown.map((m: any) => (
              <div key={m.mime_type} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="size-8 rounded-lg bg-muted flex items-center justify-center text-xs font-mono text-muted-foreground">
                    {m.mime_type.startsWith('image/') ? '🖼' : m.mime_type.startsWith('text/') ? '📄' : m.mime_type.startsWith('application/pdf') ? '📕' : '📎'}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{m.mime_type}</p>
                    <p className="text-xs text-muted-foreground">{m.count} file{m.count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <span className="text-sm font-mono text-muted-foreground">{formatBytes(m.total_bytes)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
