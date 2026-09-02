import * as React from "react"
import { useParams, useNavigate, Link } from "react-router"
import { ArrowLeft, Shield, ExternalLink, Edit, Save, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AppShell } from "@/components/app-shell"
import { LiveChat } from "@/components/feedback/live-chat"
import { TypeBadge, StatusBadge, PriorityBadge } from "@/components/feedback/badges"
import { VoteButton } from "@/components/feedback/vote-button"
import { Markdown } from "@/components/feedback/markdown"
import { MarkdownEditor } from "@/components/feedback/markdown-editor"
import { api, type ThreadDetail, type ThreadType, type ThreadPriority } from "@/lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TYPE_LABEL, PRIORITY_LABEL } from "@/lib/types"
import { useAuth } from "@/contexts/auth"

export function ThreadPage() {
  const { id } = useParams<{ id: string }>()
  const { isAdmin, user } = useAuth()
  const navigate = useNavigate()
  const [thread, setThread] = React.useState<ThreadDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [notFound, setNotFound] = React.useState(false)
  const [editingBody, setEditingBody] = React.useState(false)
  const [draftBody, setDraftBody] = React.useState("")

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

  function computeOptimistic(p: Parameters<typeof api.updateThread>[1]): ThreadDetail {
    const next = { ...thread! }
    if (p.type !== undefined) next.type = p.type
    if (p.status !== undefined) next.status = p.status
    if (p.priority !== undefined) next.priority = p.priority
    if (p.isPublic !== undefined) next.isPublic = p.isPublic
    if (p.assigneeId !== undefined) {
      next.assignee = p.assigneeId
        ? { id: p.assigneeId, name: user?.name ?? "Unknown", picture: user?.picture ?? null }
        : null
    }
    return next
  }

  async function optimisticPatch(patch: Parameters<typeof api.updateThread>[1]) {
    if (!thread) return
    const previous = thread
    setThread(computeOptimistic(patch))
    try {
      const { thread: updated } = await api.updateThread(thread.id, patch)
      setThread(updated)
    } catch {
      setThread(previous)
    }
  }

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
                {thread.author.role === "admin" && <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[9px] font-medium text-primary">admin</span>}
                {thread.sourceApp ? ` · from ${thread.sourceApp}` : ""} ·{" "}
                {new Date(thread.createdAt).toLocaleString()}
              </p>
            </div>
            {editingBody ? (
              <Card className="p-4">
                <MarkdownEditor
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Edit issue details… Markdown supported."
                  rows={5}
                />
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="gap-1.5" onClick={async () => {
                    try {
                      const { thread: updated } = await api.updateThread(thread!.id, { bodyMarkdown: draftBody })
                      setThread(updated)
                      setEditingBody(false)
                    } catch { /* ignore */ }
                  }}>
                    <Save className="size-3.5" /> Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setEditingBody(false); setDraftBody("") }}>
                    <X className="size-3.5" /> Cancel
                  </Button>
                </div>
              </Card>
            ) : (
              <Card className="p-4">
                {thread.bodyMarkdown ? <Markdown content={thread.bodyMarkdown} /> : <p className="text-sm text-muted-foreground/50">No details provided.</p>}
                {(isAdmin || thread.author.id === user?.id) && (
                  <Button
                    variant="ghost" size="sm" className="mt-2 gap-1.5"
                    onClick={() => { setDraftBody(thread.bodyMarkdown); setEditingBody(true) }}
                  >
                    <Edit className="size-3.5" /> Edit body
                  </Button>
                )}
              </Card>
            )}
            <LiveChat thread={thread} isAdmin={isAdmin} currentUserPicture={user?.picture} onThreadUpdate={setThread} />
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
              {(isAdmin || thread.author.id === user?.id) ? (
                <Row label="Type">
                  <Select value={thread.type} onValueChange={(v) => optimisticPatch({ type: v as ThreadType })}>
                    <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="question">{TYPE_LABEL.question}</SelectItem>
                      <SelectItem value="feature">{TYPE_LABEL.feature}</SelectItem>
                      <SelectItem value="bug">{TYPE_LABEL.bug}</SelectItem>
                      <SelectItem value="support">{TYPE_LABEL.support}</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
              ) : (
                <Row label="Type"><TypeBadge type={thread.type} /></Row>
              )}
              <Row label="Status"><StatusBadge status={thread.status} /></Row>
              {(isAdmin || thread.author.id === user?.id) ? (
                <Row label="Priority">
                  <Select value={thread.priority} onValueChange={(v) => optimisticPatch({ priority: v as ThreadPriority })}>
                    <SelectTrigger className="h-auto w-auto border-0 bg-transparent p-0 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{PRIORITY_LABEL.low}</SelectItem>
                      <SelectItem value="medium">{PRIORITY_LABEL.medium}</SelectItem>
                      <SelectItem value="high">{PRIORITY_LABEL.high}</SelectItem>
                      <SelectItem value="urgent">{PRIORITY_LABEL.urgent}</SelectItem>
                    </SelectContent>
                  </Select>
                </Row>
              ) : (
                <Row label="Priority"><PriorityBadge priority={thread.priority} /></Row>
              )}
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
