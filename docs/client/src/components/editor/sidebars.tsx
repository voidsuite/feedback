import * as React from "react"
import { Check, MessageSquareText, PanelLeft, Reply, Trash2, X } from "lucide-react"
import type { Editor } from "@tiptap/react"
import * as Y from "yjs"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  addCommentReply,
  deleteCommentThread,
  readCommentThreads,
  setCommentResolved,
  type PlainCommentThread,
} from "@/lib/editor"
import { cn } from "@/lib/utils"

// --- Outline ---

interface OutlineEntry {
  level: number
  text: string
  pos: number
}

function collectOutline(editor: Editor): OutlineEntry[] {
  const out: OutlineEntry[] = []
  const doc = editor.state.doc
  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      out.push({ level: Number(node.attrs.level) || 1, text: node.textContent || "Untitled", pos })
    }
    return true
  })
  return out
}

export function OutlinePanel({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const items = React.useMemo(() => collectOutline(editor), [editor, editor.state.doc])

  if (items.length === 0) {
    return (
      <PanelShell title="Outline" onClose={onClose}>
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <PanelLeft className="size-6 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">Headings will appear here as you type.</p>
        </div>
      </PanelShell>
    )
  }

  return (
    <PanelShell title="Outline" onClose={onClose}>
      <ScrollArea className="h-full">
        <nav className="space-y-0.5 p-2">
          {items.map((h) => (
            <button
              key={`${h.pos}-${h.text}`}
              className="block w-full rounded-md px-2 py-1 text-left text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              style={{ paddingLeft: `${(h.level - 1) * 14 + 8}px` }}
              onClick={() => {
                editor.chain().focus().setTextSelection(h.pos).run()
                requestAnimationFrame(() => {
                  const coords = editor.view.coordsAtPos(h.pos)
                  editor.view.dom.parentElement?.scrollTo({
                    top: coords.top - editor.view.dom.parentElement.getBoundingClientRect().top - 120,
                  })
                })
              }}
            >
              <span className={cn("block truncate", h.level === 1 && "font-semibold text-foreground")}>{h.text}</span>
            </button>
          ))}
        </nav>
      </ScrollArea>
    </PanelShell>
  )
}

function PanelShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" className="h-7 w-7 px-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>
      <Separator />
      <div className="min-h-0 flex-1">{children}</div>
    </aside>
  )
}

// --- Comments ---

interface CommentsPanelProps {
  editor: Editor
  doc: Y.Doc
  version: number
  onClose: () => void
  userName: string
  userColor: string
}

export function CommentsPanel({ editor, doc, version, onClose, userName, userColor }: CommentsPanelProps) {
  const threads = React.useMemo(() => readCommentThreads(doc), [doc, version])
  const [replyText, setReplyText] = React.useState<Record<string, string>>({})

  const jumpToThread = (threadId: string) => {
    const ranges: { from: number; to: number }[] = []
    const markType = editor.state.schema.marks.comment
    if (!markType) return
    editor.state.doc.descendants((node, pos) => {
      if (node.isText && node.marks.some((m) => m.type === markType && m.attrs.threadId === threadId)) {
        ranges.push({ from: pos, to: pos + node.nodeSize })
      }
      return true
    })
    const first = ranges.sort((a, b) => a.from - b.from)[0]
    if (!first) return
    editor.chain().focus().setTextSelection({ from: first.from, to: first.to }).run()
    const coords = editor.view.coordsAtPos(first.from)
    editor.view.dom.parentElement?.scrollTo({
      top: coords.top - editor.view.dom.parentElement.getBoundingClientRect().top - 120,
    })
  }

  return (
    <PanelShell title={`Comments${threads.length ? ` (${threads.length})` : ""}`} onClose={onClose}>
      <ScrollArea className="h-full">
        <div className="flex flex-col gap-2 p-2">
          {threads.length === 0 && (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <MessageSquareText className="size-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">Select some text and hit the comment button to start a thread.</p>
            </div>
          )}
          {threads.map((thread) => (
            <CommentCard
              key={thread.id}
              thread={thread}
              replyDraft={replyText[thread.id] || ""}
              onReplyDraft={(v) => setReplyText((prev) => ({ ...prev, [thread.id]: v }))}
              onJump={() => jumpToThread(thread.id)}
              onReply={(text) => {
                addCommentReply(doc, thread.id, { id: crypto.randomUUID(), text, author: userName, authorColor: userColor })
                setReplyText((prev) => ({ ...prev, [thread.id]: "" }))
              }}
              onResolve={(resolved) => setCommentResolved(doc, thread.id, resolved, userName)}
              onDelete={() => deleteCommentThread(doc, thread.id)}
            />
          ))}
        </div>
      </ScrollArea>
    </PanelShell>
  )
}

function CommentCard({
  thread,
  replyDraft,
  onReplyDraft,
  onJump,
  onReply,
  onResolve,
  onDelete,
}: {
  thread: PlainCommentThread
  replyDraft: string
  onReplyDraft: (v: string) => void
  onJump: () => void
  onReply: (text: string) => void
  onResolve: (resolved: boolean) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-2.5 transition-opacity",
        thread.resolved && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2">
        <Avatar className="size-5">
          <AvatarFallback className="text-[9px]" style={{ background: `${thread.authorColor || "#a8a29e"}33`, color: thread.authorColor || "#a8a29e" }}>
            {thread.author.slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-medium">{thread.author}</span>
            <span className="text-[10px] text-muted-foreground">{new Date(thread.createdAt).toLocaleDateString()}</span>
          </div>
          <button className="mt-0.5 block w-full text-left text-[13px] leading-snug" onClick={onJump}>
            {thread.text || <em className="text-muted-foreground">(attachment comment)</em>}
          </button>
          {thread.replies.map((r) => (
            <div key={r.id} className="mt-1.5 rounded-md bg-muted/50 p-1.5">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-medium">{r.author}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
              </div>
              <p className="text-[12px] leading-snug">{r.text}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <button className="rounded p-0.5 text-muted-foreground hover:text-foreground" onClick={() => setExpanded((e) => !e)} title="Reply">
            <Reply className="size-3.5" />
          </button>
          <button
            className="rounded p-0.5 text-muted-foreground hover:text-emerald-600"
            onClick={() => onResolve(!thread.resolved)}
            title={thread.resolved ? "Reopen" : "Resolve"}
          >
            <Check className="size-3.5" />
          </button>
          <button className="rounded p-0.5 text-muted-foreground hover:text-destructive" onClick={onDelete} title="Delete thread">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      {expanded && (
        <div className="mt-2 flex gap-1.5">
          <Input
            placeholder="Reply…"
            className="h-7 text-xs"
            value={replyDraft}
            onChange={(e) => onReplyDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && replyDraft.trim()) {
                onReply(replyDraft.trim())
                setExpanded(false)
              }
            }}
          />
          <Button size="sm" className="h-7 px-2 text-xs" disabled={!replyDraft.trim()} onClick={() => { onReply(replyDraft.trim()); setExpanded(false) }}>
            Reply
          </Button>
        </div>
      )}
      {thread.resolved && thread.resolvedBy && <p className="mt-1 text-[10px] text-muted-foreground">Resolved by {thread.resolvedBy}</p>}
    </div>
  )
}