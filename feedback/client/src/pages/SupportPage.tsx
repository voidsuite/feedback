import * as React from "react"
import { useNavigate } from "react-router"
import { MessagesSquare, Plus, Loader2 } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AppShell } from "@/components/app-shell"
import { ThreadCard } from "@/components/feedback/thread-card"
import { api, openSupportSocket, type ThreadSummary } from "@/lib/api"
import { useAuth } from "@/contexts/auth"

export function SupportPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [threads, setThreads] = React.useState<ThreadSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [admins, setAdmins] = React.useState<{ name: string }[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.listThreads({ type: "support", ...(isAdmin ? {} : { mine: true }), sort: "active", limit: 50 })
      setThreads(res.threads)
    } finally {
      setLoading(false)
    }
  }, [isAdmin])

  React.useEffect(() => { load() }, [load])

  React.useEffect(() => {
    const ws = openSupportSocket()
    ws.onmessage = (ev) => {
      try {
        const d = JSON.parse(ev.data)
        if (d.type === "presence" && d.members) {
          setAdmins(d.members.filter((m: any) => m.role === "admin").map((m: any) => ({ name: m.name })))
        }
      } catch { /* */ }
    }
    return () => ws.close()
  }, [])

  async function startChat() {
    setBusy(true)
    try {
      const { thread } = await api.createThread({ type: "support", title: "", bodyMarkdown: "", priority: "medium" })
      navigate(`/thread/${thread.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Support</h1>
            <p className="text-sm text-muted-foreground">Live help from the Void team.</p>
          </div>
          <Button className="ml-auto gap-1.5" onClick={startChat} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Start a support chat
          </Button>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`size-2 rounded-full ${admins.length ? "bg-emerald-500" : "bg-muted-foreground/40"}`} />
          {admins.length ? `${admins.map((a) => a.name).join(", ")} available` : "No admins online right now — leave a message and we'll reply soon."}
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : threads.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-12 text-center">
            <MessagesSquare className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No support chats yet. Start one to talk to the team.</p>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {threads.map((t) => (
              <ThreadCard key={t.id} thread={t} showVotes={false} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}
