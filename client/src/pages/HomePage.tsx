import * as React from "react"
import { useNavigate } from "react-router"
import { Globe, MessagesSquare } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AppShell } from "@/components/app-shell"
import { SubmitForm } from "@/components/feedback/submit-form"
import { ThreadCard } from "@/components/feedback/thread-card"
import { api, type ThreadSummary } from "@/lib/api"

type Tab = "mine" | "browse"

export function HomePage() {
  const navigate = useNavigate()
  const [source] = React.useState<string | null>(() => new URLSearchParams(window.location.search).get("source"))
  const compose = new URLSearchParams(window.location.search).get("compose") === "1"
  const [tab, setTab] = React.useState<Tab>("mine")
  const [threads, setThreads] = React.useState<ThreadSummary[]>([])
  const [loading, setLoading] = React.useState(true)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.listThreads({
        ...(tab === "mine" ? { mine: true } : { publicOnly: true }),
        sort: "recent",
        limit: 50,
      })
      setThreads(res.threads)
    } finally {
      setLoading(false)
    }
  }, [tab])

  React.useEffect(() => { load() }, [load])

  return (
    <AppShell>
      <div className="space-y-6">
        <Card className="p-5">
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Submit feedback</h2>
          <SubmitForm
            sourceApp={source}
            autoFocus={compose}
            onCreated={(t) => navigate(`/thread/${t.id}`)}
          />
        </Card>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("mine")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === "mine" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            My feedback
          </button>
          <button
            onClick={() => setTab("browse")}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === "browse" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            Public board
          </button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/roadmap")}>
              <Globe className="size-4" /> Roadmap
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => navigate("/support")}>
              <MessagesSquare className="size-4" /> Support
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : threads.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {tab === "mine" ? "You haven't submitted any feedback yet." : "No public feedback yet."}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {threads.map((t: ThreadSummary) => (
              <ThreadCard key={t.id} thread={t} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
