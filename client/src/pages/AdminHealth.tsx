import { useState, useEffect } from "react"
import { apiClient } from "@/lib/api"
import { Skeleton } from "@/components/ui/skeleton"

export function AdminHealth() {
  const [health, setHealth] = useState<any>(null)
  useEffect(() => { apiClient.get('/admin/health').then(setHealth) }, [])
  if (!health) return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="text-center space-y-1">
              <Skeleton className="h-3 w-16 mx-auto" />
              <Skeleton className="h-5 w-20 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-semibold tracking-tight">System Health</h1><p className="mt-1 text-sm text-muted-foreground">Server and database status overview.</p></div>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Status</p><p className="text-2xl font-semibold mt-1 text-green-500">Healthy</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Uptime</p><p className="text-2xl font-semibold mt-1">{Math.floor(health.uptime / 3600)}h {Math.floor((health.uptime % 3600) / 60)}m</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Environment</p><p className="text-2xl font-semibold mt-1">{health.nodeEnv}</p></div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Users</p><p className="text-lg font-semibold mt-1">{health.counts.users}</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Active Tokens</p><p className="text-lg font-semibold mt-1">{health.counts.activeTokens}</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">Files Stored</p><p className="text-lg font-semibold mt-1">{health.counts.files}</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-xs text-muted-foreground">DB Status</p><p className="text-lg font-semibold mt-1 text-green-500">Connected</p></div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Memory Usage</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div><p className="text-xs text-muted-foreground">Heap Used</p><p className="text-lg font-mono">{health.memory.heapUsed} MB</p></div>
          <div><p className="text-xs text-muted-foreground">Heap Total</p><p className="text-lg font-mono">{health.memory.heapTotal} MB</p></div>
          <div><p className="text-xs text-muted-foreground">RSS</p><p className="text-lg font-mono">{health.memory.rss} MB</p></div>
        </div>
      </div>
    </div>
  )
}
