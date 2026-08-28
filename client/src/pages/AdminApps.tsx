import { useState, useEffect } from "react"
import { Link } from "react-router"
import { getAdminApps } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

const statusColors: Record<string, "default" | "secondary" | "outline"> = {
  official: "default",
  verified: "secondary",
  unverified: "outline",
}

function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | "...")[] = [1]
  if (current > 3) pages.push("...")
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push("...")
  pages.push(total)
  return pages
}

export function AdminApps() {
  const [apps, setApps] = useState<any[]>([])
  const [pagination, setPagination] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    getAdminApps(page, 20, search, status).then((res) => {
      if (res) {
        setApps(res.apps)
        setPagination(res.pagination)
      }
      setLoading(false)
    })
  }, [page, search, status])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage all OAuth applications.</p>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Search by name or client ID..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          className="max-w-sm"
        />
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }} className="w-40">
          <option value="">All status</option>
          <option value="unverified">Unverified</option>
          <option value="verified">Verified</option>
          <option value="official">Official</option>
        </Select>
      </div>

      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-16 rounded-md" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))
        ) : apps.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No applications found.</p>
        ) : apps.map((a: any) => (
          <Link key={a.id} to={`/admin/apps/${a.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
            <div>
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-xs text-muted-foreground">{a.client_id}{a.owner_name ? ` · by ${a.owner_name}` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={statusColors[a.verification_status] || 'outline'}>
                {a.verification_status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(a.created_at).toLocaleDateString()}
              </span>
            </div>
          </Link>
        ))}
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <Button variant="outline" size="xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          {getPageNumbers(pagination.page, pagination.totalPages).map((p, i) =>
            p === "..." ? (
              <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
            ) : (
              <Button
                key={p}
                variant={page === p ? "default" : "outline"}
                size="xs"
                className="min-w-[32px]"
                onClick={() => setPage(p)}
              >
                {p}
              </Button>
            )
          )}
          <Button variant="outline" size="xs" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
