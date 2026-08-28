import { useState, useEffect } from "react"
import { Link } from "react-router"
import { getAdminUsers } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

export function AdminUsers() {
  const [users, setUsers] = useState<any[]>([])
  const [pagination, setPagination] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    getAdminUsers(page, 20, search).then((res) => {
      if (res) {
        setUsers(res.users)
        setPagination(res.pagination)
      }
      setLoading(false)
    })
  }, [page, search])

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage all registered users.</p>
        </div>
      </div>

      <Input
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1) }}
        className="max-w-sm"
      />

      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-8 rounded-full" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-14 rounded-md" />
                <Skeleton className="h-3 w-10" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))
        ) : users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No users found.</p>
        ) : users.map((u: any) => (
          <Link key={u.id} to={`/admin/users/${u.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <Avatar className="size-8">
                <AvatarFallback>{u.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
              <span className="text-xs text-muted-foreground">
                {u.is_active ? "Active" : "Inactive"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(u.created_at).toLocaleDateString()}
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
