import { useState, useEffect } from "react"
import { Link } from "react-router"
import { getAdminTokens, revokeAdminToken } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"

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

export function AdminTokens() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [revoking, setRevoking] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getAdminTokens(page, 20, search).then((d) => { setData(d); setLoading(false) })
  }, [page, search])

  async function handleRevoke(id: string) {
    setRevoking(id)
    const result = await revokeAdminToken(id)
    if (result.success) getAdminTokens(page, 20, search).then(setData)
    setRevoking(null)
  }

  const tokens = data?.tokens || []
  const pagination = data?.pagination

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">OAuth Tokens</h1>
        <p className="mt-1 text-sm text-muted-foreground">View and revoke OAuth access tokens across all users.</p>
      </div>

      <Input
        placeholder="Search by user email or app name..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        className="max-w-sm"
      />

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">App</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Scope</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Created</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Expires</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-3.5 w-full max-w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : tokens.map((t: any) => (
                <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <Link to={`/admin/users/${t.user_id}`} className="text-sm font-medium hover:underline">{t.user_name}</Link>
                    <p className="text-xs text-muted-foreground">{t.user_email}</p>
                  </td>
                  <td className="px-4 py-3 text-sm">{t.client_name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {t.scope?.split(' ').filter(Boolean).map((s: string) => (
                        <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(t.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(t.expires_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <Badge variant={t.revoked_at ? 'destructive' : new Date(t.expires_at) < new Date() ? 'outline' : 'default'} className="text-[10px]">
                      {t.revoked_at ? 'Revoked' : new Date(t.expires_at) < new Date() ? 'Expired' : 'Active'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!t.revoked_at && new Date(t.expires_at) > new Date() && (
                      <Button
                        size="xs"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleRevoke(t.id)}
                        disabled={revoking === t.id}
                      >
                        {revoking === t.id ? "..." : "Revoke"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && tokens.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No tokens found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-1">
          <Button variant="outline" size="xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          {getPageNumbers(pagination.page, pagination.totalPages).map((p, i) =>
            p === "..." ? <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
            : <Button key={p} variant={page === p ? "default" : "outline"} size="xs" className="min-w-[32px]" onClick={() => setPage(p)}>{p}</Button>
          )}
          <Button variant="outline" size="xs" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
