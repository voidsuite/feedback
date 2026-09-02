import * as React from "react"
import { useSearchParams } from "react-router"
import { Link } from "react-router"
import { Search, CheckCircle2, MessageSquare } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TypeBadge, StatusBadge } from "@/components/feedback/badges"
import { api, type ThreadSummary } from "@/lib/api"
import { useAuth } from "@/contexts/auth"
import { cn } from "@/lib/utils"

export function AdminInbox() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [threads, setThreads] = React.useState<ThreadSummary[]>([])
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(true)

  const type = params.get("type") || ""
  const status = params.get("status") || ""
  const unanswered = params.get("unanswered") === "1"
  const sort = (params.get("sort") as any) || "recent"
  const q = params.get("q") || ""

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  React.useEffect(() => {
    setLoading(true)
    api.listThreads({
      ...(type ? { type: type as any } : {}),
      ...(status ? { status: status as any } : {}),
      ...(unanswered ? { unanswered: true } : {}),
      ...(params.get("assignee") === "me" && user ? { assignee: user.id } : {}),
      ...(q ? { q } : {}),
      sort,
      limit: 100,
    })
      .then((r: { threads: ThreadSummary[]; total: number }) => { setThreads(r.threads); setTotal(r.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [type, status, unanswered, sort, q, params, user])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
        <p className="text-sm text-muted-foreground">{total} threads</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-7 text-xs"
            placeholder="Search feedback…"
            value={q}
            onChange={(e) => set("q", e.target.value)}
          />
        </div>
        <Select value={type || "all"} onValueChange={(v) => set("type", v === "all" || v === null ? "" : v)}>
          <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="question">Question</SelectItem>
            <SelectItem value="feature">Feature</SelectItem>
            <SelectItem value="bug">Bug</SelectItem>
            <SelectItem value="support">Support</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status || "all"} onValueChange={(v) => set("status", v === "all" || v === null ? "" : v)}>
          <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_review">In review</SelectItem>
            <SelectItem value="planned">Planned</SelectItem>
            <SelectItem value="in_progress">In progress</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="shipped">Shipped</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => set("sort", v ?? "")}>
          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Newest</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="top">Most voted</SelectItem>
          </SelectContent>
        </Select>
        <button
          onClick={() => set("unanswered", unanswered ? "" : "1")}
          className={cn("h-8 rounded-lg border px-3 text-xs", unanswered ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground")}
        >
          Unanswered only
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : threads.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No threads match these filters.</p>
      ) : (
        <div className="space-y-2">
          {threads.map((t) => (
            <Link key={t.id} to={`/admin/thread/${t.id}`} className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-foreground/20 hover:bg-accent/40">
              <div className="flex items-center gap-2">
                <TypeBadge type={t.type} />
                <StatusBadge status={t.status} />
                <span className="ml-auto text-[11px] text-muted-foreground">{t.sourceApp || "direct"}</span>
              </div>
              <p className="mt-1.5 truncate text-sm font-medium">{t.title}</p>
              <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="truncate">{t.author.name}</span>
                {t.assignee && <span>· {t.assignee.name}</span>}
                <span className="ml-auto flex items-center gap-3">
                  <span className="inline-flex items-center gap-1"><MessageSquare className="size-3" />{t.messageCount}</span>
                  {!t.unanswered && <CheckCircle2 className="size-3 text-emerald-500" />}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
