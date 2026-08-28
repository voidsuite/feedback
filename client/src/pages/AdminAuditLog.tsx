import { useState, useEffect } from "react"
import { apiClient } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export function AdminAuditLog() {
  const [entries, setEntries] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [action, setAction] = useState("")
  const [userId, setUserId] = useState("")
  const limit = 50

  async function fetchLog(p: number) {
    let url = `/admin/audit-log?page=${p}&limit=${limit}`
    if (action) url += `&action=${encodeURIComponent(action)}`
    if (userId) url += `&user_id=${encodeURIComponent(userId)}`
    const res = await apiClient.get<any>(url)
    setEntries(res.entries || [])
    setTotal(res.total || 0)
    setPage(p)
  }

  useEffect(() => { fetchLog(1) }, [])

  function handleFilter() { fetchLog(1) }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Audit Log</h1><p className="mt-1 text-sm text-muted-foreground">Security event history for administrators.</p></div>
      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Filter by action (e.g. user.deleted)" value={action} onChange={e => setAction(e.target.value)} className="max-w-xs" />
        <Input placeholder="Filter by user ID" value={userId} onChange={e => setUserId(e.target.value)} className="max-w-xs" />
        <Button variant="outline" onClick={handleFilter}>Apply</Button>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Action</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Resource</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Details</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">IP</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No audit entries found.</td></tr>
            ) : (
              entries.map((entry: any) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{entry.action}</td>
                  <td className="px-4 py-3 text-xs">{entry.user_email || entry.user_id || "—"}</td>
                  <td className="px-4 py-3 text-xs">{entry.resource_type ? `${entry.resource_type}:${entry.resource_id?.slice(0, 8)}...` : "—"}</td>
                  <td className="px-4 py-3 text-xs max-w-[200px] truncate">{entry.details ? JSON.stringify(entry.details) : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{entry.ip_address || "—"}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages} ({total} entries)</p>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => fetchLog(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => fetchLog(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}
