import * as React from "react"
import { useParams, useNavigate } from "react-router"
import { ArrowLeft, Trash2, UserCheck, UserX, Edit, Save, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LiveChat } from "@/components/feedback/live-chat"
import { TypeBadge } from "@/components/feedback/badges"
import { Markdown } from "@/components/feedback/markdown"
import { MarkdownEditor } from "@/components/feedback/markdown-editor"
import { api, type ThreadDetail, type ThreadStatus, type ThreadPriority } from "@/lib/api"
import { useAuth } from "@/contexts/auth"

export function AdminThread() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [thread, setThread] = React.useState<ThreadDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [editingBody, setEditingBody] = React.useState(false)
  const [draftBody, setDraftBody] = React.useState("")

  const load = React.useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const { thread } = await api.getThread(id)
      setThread(thread)
    } catch { /* */ } finally { setLoading(false) }
  }, [id])

  React.useEffect(() => { load() }, [load])

  async function patch(p: Parameters<typeof api.updateThread>[1]) {
    if (!thread || busy) return
    setBusy(true)
    try {
      const { thread: updated } = await api.updateThread(thread.id, p)
      setThread(updated)
    } catch { /* */ } finally { setBusy(false) }
  }

  async function remove() {
    if (!thread) return
    if (!confirm("Delete this thread? This cannot be undone.")) return
    await api.deleteThread(thread.id)
    navigate("/admin/inbox")
  }

  if (loading) return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
  if (!thread) return <p className="py-10 text-center text-sm text-muted-foreground">Thread not found.</p>

  const assignedToMe = thread.assignee?.id === user?.id

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin/inbox")} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <TypeBadge type={thread.type} />
        <h1 className="truncate text-lg font-semibold tracking-tight">{thread.title}</h1>
        <Button variant="ghost" size="icon" className="ml-auto text-destructive" onClick={remove} aria-label="Delete">
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          {editingBody ? (
            <Card className="p-4">
              <MarkdownEditor
                value={draftBody}
                onChange={(e) => setDraftBody(e.target.value)}
                placeholder="Edit issue details… Markdown supported."
                rows={6}
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
              <Button variant="ghost" size="sm" className="mt-2 gap-1.5" onClick={() => { setDraftBody(thread.bodyMarkdown); setEditingBody(true) }}>
                <Edit className="size-3.5" /> Edit body
              </Button>
            </Card>
          )}
          <LiveChat thread={thread} isAdmin onThreadUpdate={setThread} />
        </div>

        <aside className="space-y-4">
          <Card className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={thread.status} onValueChange={(v) => patch({ status: v as ThreadStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="in_review">In review</SelectItem>
                  <SelectItem value="planned">Planned</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="answered">Answered</SelectItem>
                  <SelectItem value="shipped">Shipped</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={thread.priority} onValueChange={(v) => patch({ priority: v as ThreadPriority })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="public">Public on roadmap</Label>
              <Switch id="public" checked={thread.isPublic} onCheckedChange={(v) => patch({ isPublic: v })} />
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <div className="text-sm">
                <p className="text-muted-foreground">Assignee</p>
                <p className="font-medium">{thread.assignee?.name ?? "Unassigned"}</p>
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => patch({ assigneeId: assignedToMe ? null : user!.id })}>
                {assignedToMe ? <><UserX className="size-3.5" /> Unassign</> : <><UserCheck className="size-3.5" /> Assign to me</>}
              </Button>
            </div>
            <div className="border-t border-border pt-3 text-xs text-muted-foreground">
              <p>Author: {thread.author.name}</p>
              <p>Source: {thread.sourceApp || "direct"}</p>
              <p>Votes: {thread.voteCount}</p>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  )
}
