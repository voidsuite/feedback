import * as React from "react"
import { useNavigate, Link } from "react-router"
import { ChevronUp, Shield } from "lucide-react"
import { Card } from "@/components/ui/card"
import { AppShell } from "@/components/app-shell"
import { api, type ThreadSummary, type ThreadStatus } from "@/lib/api"
import { useAuth } from "@/contexts/auth"

const PIPELINE: { status: ThreadStatus; label: string }[] = [
  { status: "open", label: "Ideas" },
  { status: "in_review", label: "Under review" },
  { status: "planned", label: "Planned" },
  { status: "in_progress", label: "In progress" },
  { status: "shipped", label: "Shipped" },
]

export function RoadmapPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [threads, setThreads] = React.useState<ThreadSummary[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    api.listThreads({ type: "feature", publicOnly: true, sort: "top", limit: 200 })
      .then((r: { threads: ThreadSummary[]; total: number }) => setThreads(r.threads))
      .catch(() => setThreads([]))
      .finally(() => setLoading(false))
  }, [])

  const byStatus = (s: ThreadStatus) => threads.filter((t) => t.status === s)

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Public roadmap</h1>
            <p className="text-sm text-muted-foreground">Feature requests from the Void community — vote to push them up.</p>
          </div>
          {user?.role === "admin" && (
            <Link to="/admin" className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
              <Shield className="size-3.5" /> Admin
            </Link>
          )}
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-5">
            {PIPELINE.map((col) => (
              <div key={col.status} className="space-y-3">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{col.label}</span>
                  <span className="text-xs text-muted-foreground">{byStatus(col.status).length}</span>
                </div>
                {byStatus(col.status).map((t) => (
                  <Card key={t.id} className="cursor-pointer p-3 transition-colors hover:border-foreground/20" onClick={() => navigate(`/thread/${t.id}`)}>
                    <p className="text-sm font-medium leading-snug">{t.title}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate">{t.sourceApp || "community"}</span>
                      <span className="inline-flex items-center gap-0.5">
                        <ChevronUp className="size-3" /> {t.voteCount}
                      </span>
                    </div>
                  </Card>
                ))}
                {byStatus(col.status).length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-3 text-center text-xs text-muted-foreground">Nothing here</p>
                )}
              </div>
            ))}
          </div>
        )}

        {!user && (
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="text-primary underline">Sign in</Link> to vote and submit your own ideas.
          </p>
        )}
      </div>
    </AppShell>
  )
}
