import * as React from "react"
import { useParams, useNavigate, Link } from "react-router"
import { ArrowLeft, Shield, ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AppShell } from "@/components/app-shell"
import { LiveChat } from "@/components/feedback/live-chat"
import { TypeBadge, StatusBadge, PriorityBadge } from "@/components/feedback/badges"
import { VoteButton } from "@/components/feedback/vote-button"
import { Markdown } from "@/components/feedback/markdown"
import { api, type ThreadDetail } from "@/lib/api"
import { useAuth } from "@/contexts/auth"

export function ThreadPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [thread, setThread] = React.useState<ThreadDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [notFound, setNotFound] = React.useState(false)

  const load = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const { thread } = await api.getThread(id)
      setThread(thread)
    } catch {
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  React.useEffect(() => { load() }, [load])

  if (loading) return <AppShell><p className="py-10 text-center text-sm text-muted-foreground">Loading…</p></AppShell>
  if (notFound || !thread) return (
    <AppShell>
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">This feedback couldn't be found.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Back home</Button>
      </div>
    </AppShell>
  )

  return (
    <AppShell>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Back">
            <ArrowLeft className="size-4" />
          </Button>
          <TypeBadge type={thread.type} />
          <StatusBadge status={thread.status} />
          {isAdmin && (
            <Link to={`/admin/thread/${thread.id}`} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
              <Shield className="size-3.5" /> Admin view <ExternalLink className="size-3" />
            </Link>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div>
              <h1 className="text-xl font-semibold tracking-tight">{thread.title}</h1>
              <p className="mt-1 text-xs text-muted-foreground">
                by {thread.author.name}
                {thread.sourceApp ? ` · from ${thread.sourceApp}` : ""} ·{" "}
                {new Date(thread.createdAt).toLocaleString()}
              </p>
            </div>
            {thread.bodyMarkdown && (
              <Card className="p-4">
                <Markdown content={thread.bodyMarkdown} />
              </Card>
            )}
            <LiveChat thread={thread} isAdmin={isAdmin} onThreadUpdate={setThread} />
          </div>

          <aside className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <VoteButton threadId={thread.id} voted={thread.hasVoted} votes={thread.voteCount} onChange={(v) => setThread((t: ThreadDetail | null) => (t ? { ...t, hasVoted: v.voted, voteCount: v.votes } : t))} />
                <div className="space-y-1 text-sm">
                  <div className="font-medium">{thread.voteCount} {thread.voteCount === 1 ? "vote" : "votes"}</div>
                  <div className="text-xs text-muted-foreground">{thread.unanswered ? "Awaiting admin reply" : `${thread.adminReplies} admin ${thread.adminReplies === 1 ? "reply" : "replies"}`}</div>
                </div>
              </div>
            </Card>
            <Card className="space-y-3 p-4 text-sm">
              <Row label="Status"><StatusBadge status={thread.status} /></Row>
              <Row label="Priority"><PriorityBadge priority={thread.priority} /></Row>
              <Row label="Assignee">{thread.assignee ? thread.assignee.name : <span className="text-muted-foreground">Unassigned</span>}</Row>
              <Row label="Source">{thread.sourceApp || <span className="text-muted-foreground">Direct</span>}</Row>
              <Row label="Visibility">{thread.isPublic ? <span className="text-violet-600 dark:text-violet-400">Public</span> : <span className="text-muted-foreground">Private</span>}</Row>
            </Card>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  )
}
