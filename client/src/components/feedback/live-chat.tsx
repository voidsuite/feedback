import * as React from "react"
import { Send, Lock, Loader2, Trash2, CircleDot } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MarkdownEditor } from "./markdown-editor"
import { Markdown } from "./markdown"
import { api, openThreadSocket } from "@/lib/api"
import type { Message, ThreadDetail } from "@/lib/types"
import { cn } from "@/lib/utils"

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
}

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

export function LiveChat({ thread, isAdmin, onThreadUpdate }: { thread: ThreadDetail; isAdmin: boolean; onThreadUpdate: (t: ThreadDetail) => void }) {
  const [messages, setMessages] = React.useState<Message[]>(thread.messages)
  const [draft, setDraft] = React.useState("")
  const [internal, setInternal] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [online, setOnline] = React.useState<{ userId: string; name: string; picture?: string | null }[]>([])
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const wsRef = React.useRef<WebSocket | null>(null)

  React.useEffect(() => {
    setMessages(thread.messages)
  }, [thread.id, thread.messages])

  React.useEffect(() => {
    const ws = openThreadSocket(thread.id)
    wsRef.current = ws
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data)
        if (data.type === "message" && data.message) {
          setMessages((prev) => (prev.some((m) => m.id === data.message.id) ? prev : [...prev, data.message]))
        } else if (data.type === "message_deleted" && data.messageId) {
          setMessages((prev) => prev.filter((m) => m.id !== data.messageId))
        } else if (data.type === "thread_update" && data.thread) {
          onThreadUpdate(data.thread)
        } else if (data.type === "presence" && data.members) {
          setOnline(data.members)
        }
      } catch { /* ignore */ }
    }
    return () => { ws.close() }
  }, [thread.id, onThreadUpdate])

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  async function send() {
    const text = draft.trim()
    if (!text || busy) return
    setBusy(true)
    const optimistic = internal && isAdmin
    try {
      const { message } = await api.sendMessage(thread.id, text, optimistic)
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]))
      setDraft("")
      setInternal(false)
    } catch { /* ignore */ } finally {
      setBusy(false)
    }
  }

  async function removeMessage(messageId: string) {
    if (!confirm("Delete this message?")) return
    try {
      await api.deleteMessage(thread.id, messageId)
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    } catch { /* ignore */ }
  }

  const visible = isAdmin ? messages : messages.filter((m) => !m.isInternal)

  return (
    <div className="flex h-[calc(100vh-13rem)] flex-col rounded-xl border border-border bg-card">
      {online.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-500" />
          {online.map((o) => o.name).join(", ")} online
        </div>
      )}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="space-y-4 p-4">
          {visible.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
          )}
          {visible.map((m) => {
            const isSystem = m.authorRole === "system"
            const isAdminMsg = m.authorRole === "admin"
            const canDelete = isAdmin || m.author.id === thread.author.id

            if (isSystem) {
              return (
                <div key={m.id} className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                  <CircleDot className="size-3 shrink-0" />
                  <span className="italic"><Markdown content={m.bodyMarkdown} /></span>
                  <span className="shrink-0">{time(m.createdAt)}</span>
                </div>
              )
            }

            return (
              <div key={m.id} className={cn("group flex gap-3", m.isInternal && "rounded-lg bg-amber-500/5 p-2 ring-1 ring-amber-500/20")}>
                <Avatar className="size-7 shrink-0">
                  <AvatarImage src={m.author.picture || undefined} alt={m.author.name} />
                  <AvatarFallback className="text-[9px]">{initials(m.author.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{m.author.name}</span>
                    {isAdminMsg && <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">admin</span>}
                    {m.isInternal && <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] text-amber-600"><Lock className="size-2.5" /> internal</span>}
                    <span>{time(m.createdAt)}</span>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => removeMessage(m.id)}
                        className="ml-auto rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                        title="Delete message"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                  <div className="mt-1 text-sm">
                    <Markdown content={m.bodyMarkdown} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <div className="flex-1 min-w-0">
            <MarkdownEditor
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder={isAdmin ? "Reply as Void Team… (toggle internal note for admins only). Markdown supported." : "Write a reply… Markdown supported."}
              rows={2}
            />
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setInternal((v) => !v)}
              className={cn(
                "inline-flex h-9 items-center gap-1 rounded-lg border px-2 text-xs",
                internal ? "border-amber-500/40 bg-amber-500/10 text-amber-600" : "border-border text-muted-foreground"
              )}
              title="Internal note (admins only)"
            >
              <Lock className="size-3.5" /> Internal
            </button>
          )}
          <Button onClick={send} disabled={busy || !draft.trim()} size="icon" className="size-9">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
