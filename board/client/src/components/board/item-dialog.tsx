/**
 * ItemDialog — the full card editor. Everything commits through the board
 * store (REST + realtime in phase 5), and the local component state is
 * reset per item via `key`.
 */

import * as React from "react"
import {
  Calendar, CornerDownRight, ImagePlus, ListChecks, MessageSquare,
  Pencil, Plus, Tag, Trash2, UserRound, X,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/components/board/item-card"
import { initials } from "@/components/workspace-icon"
import { renderMarkdown } from "@/lib/markdown"
import { fileUrl } from "@/lib/api"
import { useBoard } from "@/lib/use-board"
import { cn } from "@/lib/utils"
import type { ActivityEvent, Comment, Item, ItemPriority, Label as LabelModel, WorkspaceMember } from "@/lib/types"

const LABEL_COLORS = ["#a8a29e", "#8b5cf6", "#10b981", "#d97706", "#0ea5e9", "#f43f5e", "#ef4444", "#84cc16"]

const PRIORITIES: ItemPriority[] = ["none", "low", "medium", "high", "urgent"]

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

function Title({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [local, setLocal] = React.useState(value)
  React.useEffect(() => setLocal(value), [value])
  return (
    <input
      value={local}
      maxLength={500}
      aria-label="Card title"
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => { const v = local.trim(); if (v && v !== value) onCommit(v) }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur()
      }}
      className="w-full bg-transparent text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground"
    />
  )
}

function MarkdownEditor({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [mode, setMode] = React.useState<"edit" | "preview">("edit")
  const [draft, setDraft] = React.useState(value)
  React.useEffect(() => { setDraft(value) }, [value])

  const save = () => {
    if (draft !== value) onCommit(draft)
    setMode("preview")
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">Description</Label>
        <div className="flex items-center gap-1">
          <div className="flex rounded-md border border-border bg-muted/50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("edit")}
              className={cn("rounded px-2 py-0.5 transition-colors", mode === "edit" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={save}
              className={cn("rounded px-2 py-0.5 transition-colors", mode === "preview" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              Preview
            </button>
          </div>
          {value ? <Badge variant="secondary" className="text-[10px]">Markdown</Badge> : null}
        </div>
      </div>
      {mode === "edit" ? (
        <>
          <textarea
            value={draft}
            rows={5}
            maxLength={20000}
            placeholder="Add a description… markdown supported"
            onChange={(e) => setDraft(e.target.value)}
            className="w-full resize-y rounded-lg border border-border bg-background p-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          {draft !== value ? (
            <div className="flex justify-end gap-1.5">
              <Button type="button" variant="ghost" size="xs" onClick={() => { setDraft(value); setMode(value ? "preview" : "edit") }}>Discard</Button>
              <Button type="button" size="xs" onClick={save}>Save description</Button>
            </div>
          ) : null}
        </>
      ) : value ? (
        <div className="vb-markdown rounded-lg border border-border bg-background p-3" dangerouslySetInnerHTML={{ __html: renderMarkdown(value) }} />
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">No description</p>
      )}
    </div>
  )
}

function ColorDots({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex gap-1">
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Label color ${c}`}
          className={cn("size-4 rounded-full transition-transform hover:scale-110", value === c && "ring-2 ring-foreground ring-offset-1 ring-offset-background")}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  )
}

function LabelPicker({
  item,
  onToggle,
  onCreate,
}: {
  item: Item
  onToggle: (labelId: string) => void
  onCreate: (name: string, color: string) => void
}) {
  const board = useBoardContext()
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState(LABEL_COLORS[1])
  const [editing, setEditing] = React.useState<LabelModel | null>(null)
  const [editName, setEditName] = React.useState("")
  const [editColor, setEditColor] = React.useState(LABEL_COLORS[1])
  const [deleting, setDeleting] = React.useState<LabelModel | null>(null)
  const selected = new Set(item.labels.map((l) => l.id))

  const startEdit = (l: LabelModel) => {
    setEditing(l)
    setEditName(l.name)
    setEditColor(l.color)
  }

  const saveEdit = () => {
    if (!editing) return
    const n = editName.trim()
    if (n && (n !== editing.name || editColor !== editing.color)) {
      void board.updateLabel(editing.id, { name: n, color: editColor }).catch(() => {})
    }
    setEditing(null)
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium transition-colors hover:bg-muted">
            <Tag className="size-3.5" aria-hidden="true" />
            Labels
            {item.labels.length > 0 ? <span className="rounded bg-background px-1 text-[10px]">{item.labels.length}</span> : null}
          </button>
        }
      />
      <PopoverContent align="start" className="w-64 p-2">
        <div className="space-y-1">
          <p className="px-1 py-0.5 text-xs font-medium text-muted-foreground">Labels</p>
          {board.labels.length === 0 ? (
            <p className="px-1 py-1 text-xs text-muted-foreground">No labels yet — create one below.</p>
          ) : (
            board.labels.map((l) =>
              editing?.id === l.id ? (
                <div key={l.id} className="space-y-1.5 rounded-md border border-border p-1.5">
                  <input
                    autoFocus
                    value={editName}
                    maxLength={50}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveEdit()
                      if (e.key === "Escape") setEditing(null)
                    }}
                    className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring"
                  />
                  <div className="flex items-center justify-between gap-1">
                    <ColorDots value={editColor} onChange={setEditColor} />
                    <div className="flex gap-1">
                      <Button type="button" size="xs" onClick={saveEdit}>Save</Button>
                      <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={l.id} className="group/label flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted">
                  <Checkbox checked={selected.has(l.id)} onCheckedChange={() => onToggle(l.id)} aria-label={l.name} />
                  <span className="size-3 shrink-0 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                  <span className="flex-1 truncate text-sm">{l.name}</span>
                  <span className="hidden shrink-0 items-center gap-0.5 group-hover/label:flex">
                    <button
                      type="button"
                      aria-label={`Rename label ${l.name}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => startEdit(l)}
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete label ${l.name}`}
                      className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                      onClick={() => setDeleting(l)}
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </span>
                </div>
              )
            )
          )}
        </div>
        <Separator className="my-2" />
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            const n = name.trim()
            if (n) {
              onCreate(n, color)
              setName("")
            }
          }}
        >
          <input
            value={name}
            maxLength={50}
            placeholder="New label…"
            onChange={(e) => setName(e.target.value)}
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus-visible:border-ring"
          />
          <div className="flex items-center justify-between">
            <ColorDots value={color} onChange={setColor} />
            <Button type="submit" size="xs" disabled={!name.trim()}>Add</Button>
          </div>
        </form>
      </PopoverContent>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title="Delete this label?"
        description={`“${deleting?.name ?? ""}” will be removed from every card on this board.`}
        confirmLabel="Delete label"
        onConfirm={() => {
          if (deleting) void board.deleteLabel(deleting.id).catch(() => {})
          setDeleting(null)
        }}
      />
    </Popover>
  )
}

const BoardContext = React.createContext<ReturnType<typeof useBoard> | null>(null)
function useBoardContext(): ReturnType<typeof useBoard> {
  const ctx = React.useContext(BoardContext)
  if (!ctx) throw new Error("ItemDialog must be rendered inside BoardContext")
  return ctx
}

/** Group a flat comment list into parent → replies. */
function groupComments(comments: Comment[]): Map<string | null, Comment[]> {
  const byParent = new Map<string | null, Comment[]>()
  for (const c of comments) {
    const arr = byParent.get(c.parentId)
    if (arr) arr.push(c)
    else byParent.set(c.parentId, [c])
  }
  return byParent
}

function CommentNode({
  comment,
  depth,
  item,
  board,
  byParent,
}: {
  comment: Comment
  depth: number
  item: Item
  board: ReturnType<typeof useBoard>
  byParent: Map<string | null, Comment[]>
}) {
  const [replying, setReplying] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const replies = byParent.get(comment.id) ?? []
  // Cap the visual nesting so deep threads don't collapse the dialog.
  const nested = depth < 4

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const b = draft.trim()
    if (!b) return
    void board.addComment(item.id, b, comment.id).catch(() => {})
    setDraft("")
    setReplying(false)
  }

  return (
    <div className={cn("space-y-3", nested && depth > 0 && "ml-5 border-l border-border pl-3")}>
      <div className="flex gap-2.5">
        <Avatar size="sm" className="mt-0.5">
          <AvatarImage src={comment.author.picture || undefined} alt={comment.author.name} />
          <AvatarFallback className="text-[8px]">{initials(comment.author.name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-medium">{comment.author.name}</span>
            <span className="text-[11px] text-muted-foreground">{timeAgo(comment.createdAt)}</span>
          </div>
          <div className="vb-markdown mt-1 rounded-lg border border-border bg-muted/30 p-2.5" dangerouslySetInnerHTML={{ __html: renderMarkdown(comment.body) }} />
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setReplying((r) => !r)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <CornerDownRight className="size-3" aria-hidden="true" />
              Reply
            </button>
            {replies.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {replies.length} {replies.length === 1 ? "reply" : "replies"}
              </span>
            ) : null}
          </div>
          {replying ? (
            <form className="mt-2 space-y-1.5" onSubmit={submit}>
              <textarea
                autoFocus
                value={draft}
                rows={2}
                maxLength={5000}
                placeholder={`Reply to ${comment.author.name}…`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setReplying(false)
                    setDraft("")
                  }
                }}
                className="w-full resize-y rounded-lg border border-border bg-background p-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <div className="flex justify-end gap-1.5">
                <Button type="button" variant="ghost" size="xs" onClick={() => { setReplying(false); setDraft("") }}>Cancel</Button>
                <Button type="submit" size="xs" disabled={!draft.trim()}>Reply</Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>
      {nested && replies.length > 0 ? (
        <div className="space-y-3">
          {replies.map((r) => (
            <CommentNode key={r.id} comment={r} depth={depth + 1} item={item} board={board} byParent={byParent} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function ItemDialog({
  item,
  open,
  onOpenChange,
  onDelete,
}: {
  item: Item
  open: boolean
  onOpenChange: (open: boolean) => void
  onDelete: (item: Item) => void
}) {
  const board = useBoardContext()
  const [confirmDelete, setConfirmDelete] = React.useState(false)
  const [coverUploading, setCoverUploading] = React.useState(false)
  const [comment, setComment] = React.useState("")
  const [checklistDraft, setChecklistDraft] = React.useState("")

  React.useEffect(() => {
    if (open) {
      setConfirmDelete(false)
      setComment("")
      setChecklistDraft("")
    }
  }, [open, item.id])

  // Multiplayer: announce which card you're viewing.
  React.useEffect(() => {
    if (!open) return
    board.sendCursor(item.id)
    return () => board.sendCursor(null)
  }, [open, item.id, board])

  const viewersHere = board.viewers.filter((v) => v.itemId === item.id)

  const members: WorkspaceMember[] = board.workspace?.members ?? []
  const assigneeIds = new Set(item.assignees.map((a) => a.id))
  const byParent = React.useMemo(() => groupComments(item.comments), [item.comments])

  const commit = (patch: Parameters<typeof board.updateItem>[1]) => {
    void board.updateItem(item.id, patch).catch(() => {})
  }

  const toggleLabel = (labelId: string) => {
    const has = item.labels.some((l) => l.id === labelId)
    const next = has ? item.labels.filter((l) => l.id !== labelId).map((l) => l.id)
      : [...item.labels.map((l) => l.id), labelId]
    void board.setItemLabels(item.id, next).catch(() => {})
  }

  const toggleAssignee = (userId: string) => {
    const next = assigneeIds.has(userId) ? item.assignees.filter((a) => a.id !== userId).map((a) => a.id)
      : [...item.assignees.map((a) => a.id), userId]
    void board.setItemAssignees(item.id, next).catch(() => {})
  }

  const uploadCover = async (file: File | undefined) => {
    if (!file) return
    setCoverUploading(true)
    try {
      await board.uploadCover(item.id, file)
    } finally {
      setCoverUploading(false)
    }
  }

  const checklistTotal = item.checklists.length
  const checklistDone = item.checklists.filter((c) => c.done).length

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[92dvh] max-w-3xl flex-col gap-0 !p-0 sm:max-w-3xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{item.title}</DialogTitle>
          </DialogHeader>

          <div className="voidboard-scrollbar flex-1 overflow-y-auto p-5">
            <div className="space-y-5">
              {/* Cover */}
              {item.coverFileId ? (
                <div className="group relative overflow-hidden rounded-xl border border-border">
                  <img src={fileUrl(item.coverFileId)} alt="Cover" className="max-h-64 w-full object-cover" />
                  <div className="absolute right-2 top-2 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <label className="cursor-pointer rounded-md bg-background/90 px-2 py-1 text-xs font-medium shadow-sm transition-colors hover:bg-background">
                      Change
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadCover(e.target.files?.[0])} />
                    </label>
                    <Button type="button" variant="secondary" size="xs" onClick={() => commit({ coverFileId: null })}>
                      <X className="size-3" />
                      Remove
                    </Button>
                  </div>
                </div>
              ) : null}

              <Title value={item.title} onCommit={(v) => commit({ title: v })} />

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-2">
                <Select value={item.priority} onValueChange={(v) => { if (v) commit({ priority: v as ItemPriority }) }}>
                  <SelectTrigger size="sm" className="h-7 text-xs" aria-label="Priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="gap-2">
                        <span className="flex items-center gap-2">
                          {p !== "none" ? <span className={cn("size-2 rounded-full", PRIORITY_COLORS[p])} aria-hidden="true" /> : null}
                          {PRIORITY_LABELS[p]}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <DatePicker value={item.dueDate} onChange={(v) => commit({ dueDate: v })} />

                <LabelPicker item={item} onToggle={toggleLabel} onCreate={(name, color) => void board.createLabel(name, color)} />

                <Popover>
                  <PopoverTrigger
                    render={
                      <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-medium transition-colors hover:bg-muted">
                        <UserRound className="size-3.5" aria-hidden="true" />
                        Members
                        {item.assignees.length > 0 ? <span className="rounded bg-background px-1 text-[10px]">{item.assignees.length}</span> : null}
                      </button>
                    }
                  />
                  <PopoverContent align="start" className="w-64 p-2">
                    <p className="px-1 py-0.5 text-xs font-medium text-muted-foreground">Assignees</p>
                    {members.length === 0 ? (
                      <p className="px-1 py-1 text-xs text-muted-foreground">No members in this workspace yet.</p>
                    ) : (
                      members.map((m) => (
                        <label key={m.userId} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted">
                          <Checkbox checked={assigneeIds.has(m.userId)} onCheckedChange={() => toggleAssignee(m.userId)} aria-label={m.name} />
                          <Avatar size="sm">
                            <AvatarImage src={m.picture || undefined} alt={m.name} />
                            <AvatarFallback className="text-[8px]">{initials(m.name)}</AvatarFallback>
                          </Avatar>
                          <span className="flex-1 truncate text-sm">{m.name}</span>
                        </label>
                      ))
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Active labels */}
              {item.labels.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {item.labels.map((l) => (
                    <Badge key={l.id} className="gap-1.5 text-xs font-normal" style={{ background: `${l.color}22`, color: l.color, borderColor: `${l.color}55` }}>
                      <span className="size-2 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                      {l.name}
                    </Badge>
                  ))}
                </div>
              ) : null}

              <Separator />

              <MarkdownEditor value={item.description} onCommit={(v) => commit({ description: v })} />

              {/* Checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <ListChecks className="size-3.5" aria-hidden="true" />
                    Checklist
                  </Label>
                  {checklistTotal > 0 ? (
                    <span className="text-xs text-muted-foreground">{checklistDone}/{checklistTotal}</span>
                  ) : null}
                </div>
                {checklistTotal > 0 ? (
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(checklistDone / checklistTotal) * 100}%` }} />
                  </div>
                ) : null}
                <div className="space-y-1">
                  {item.checklists.map((entry) => (
                    <div key={entry.id} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-muted/50">
                      <Checkbox
                        checked={entry.done}
                        onCheckedChange={(c) => void board.setChecklistEntry(item.id, entry.id, entry.text, c === true)}
                        aria-label={`Mark "${entry.text}" done`}
                      />
                      <span className={cn("flex-1 text-sm", entry.done && "text-muted-foreground line-through")}>{entry.text}</span>
                      <button
                        type="button"
                        className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-destructive group-hover:opacity-100"
                        aria-label={`Delete "${entry.text}"`}
                        onClick={() => void board.deleteChecklistEntry(item.id, entry.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <form
                  className="flex gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const t = checklistDraft.trim()
                    if (t) {
                      void board.addChecklistEntry(item.id, t)
                      setChecklistDraft("")
                    }
                  }}
                >
                  <Input
                    value={checklistDraft}
                    maxLength={500}
                    placeholder="Add checklist item…"
                    className="h-7 text-xs"
                    onChange={(e) => setChecklistDraft(e.target.value)}
                  />
                  <Button type="submit" size="xs" variant="outline" disabled={!checklistDraft.trim()}><Plus className="size-3" />Add</Button>
                </form>
              </div>

              {/* Comments */}
              <div className="space-y-3">
                <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MessageSquare className="size-3.5" aria-hidden="true" />
                  Comments
                  {item.comments.length > 0 ? <span className="rounded-md bg-muted px-1.5 py-0.5">{item.comments.length}</span> : null}
                </Label>
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    const b = comment.trim()
                    if (b) {
                      void board.addComment(item.id, b)
                      setComment("")
                    }
                  }}
                >
                  <textarea
                    value={comment}
                    rows={3}
                    maxLength={5000}
                    placeholder="Write a comment… markdown supported"
                    onChange={(e) => setComment(e.target.value)}
                    className="w-full resize-y rounded-lg border border-border bg-background p-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="sm" disabled={!comment.trim()}>Comment</Button>
                  </div>
                </form>
                <div className="space-y-4">
                  {item.comments.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No comments yet.</p>
                  ) : (
                    (byParent.get(null) ?? []).map((c) => (
                      <CommentNode key={c.id} comment={c} depth={0} item={item} board={board} byParent={byParent} />
                    ))
                  )}
                </div>
              </div>

              {/* Activity */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground">Activity</Label>
                {item.activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nothing yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {item.activity.map((a) => <ActivityRow key={a.id} event={a} />)}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 border-t border-border px-5 py-3">
            {viewersHere.length > 0 ? (
              <span className="flex items-center gap-1">
                <span className="flex -space-x-1.5 *:ring-2 *:ring-background">
                  {viewersHere.slice(0, 3).map((v) => (
                    <Avatar key={v.userId} size="sm">
                      <AvatarImage src={v.picture || undefined} alt={v.name} />
                      <AvatarFallback className="text-[8px]">{initials(v.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                </span>
                <span className="text-[11px] text-muted-foreground">viewing</span>
              </span>
            ) : null}
            <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
              Created {timeAgo(item.createdAt)} by {item.createdBy.name} · updated {timeAgo(item.updatedAt)}
            </p>
            {item.coverFileId ? null : (
              <label className="inline-flex cursor-pointer">
                <span className="inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                  {coverUploading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" /> : <ImagePlus className="size-3.5" />}
                  Add cover
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={(e) => void uploadCover(e.target.files?.[0])} />
              </label>
            )}
            <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this card?"
        description={`“${item.title}” will be permanently removed.`}
        confirmLabel="Delete card"
        onConfirm={() => onDelete(item)}
      />
    </>
  )
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const fmt = (d: Record<string, unknown>) => {
    if (event.action === "updated") {
      const fields = (d.fields as string[] | undefined) ?? []
      if (fields.length) return fields.map((f) => f.replace(/([A-Z])/g, " $1").toLowerCase()).join(", ")
    }
    if (event.action === "moved") return "to another column"
    if (event.action === "labels") return `set ${d.count ?? ""} label${Number(d.count) === 1 ? "" : "s"}`
    if (event.action === "assignees") return `set ${d.count ?? ""} assignee${Number(d.count) === 1 ? "" : "s"}`
    return null
  }
  const detail = fmt(event.data)
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="shrink-0 font-medium">{event.actor.name}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {ACTIONS[event.action] ?? event.action}
        {detail ? <span className="text-foreground/70"> — {detail}</span> : null}
      </span>
      <span className="shrink-0 text-[11px] text-muted-foreground/70">{timeAgo(event.createdAt)}</span>
    </div>
  )
}

const ACTIONS: Record<string, string> = {
  created: "created this card",
  moved: "moved",
  updated: "updated",
  labels: "changed labels",
  assignees: "changed assignees",
  comment: "commented",
  checklist: "updated the checklist",
}

function DatePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [open, setOpen] = React.useState(false)
  const dateValue = value ? new Date(value).toISOString().slice(0, 10) : ""
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
              value ? "border-border bg-muted/40" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
            )}
          >
            <Calendar className="size-3.5" aria-hidden="true" />
            {value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Due date"}
          </button>
        }
      />
      <PopoverContent align="start" className="w-fit p-2">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={dateValue}
            onChange={(e) => {
              onChange(e.target.value ? new Date(e.target.value + "T12:00:00").getTime() : null)
              setOpen(false)
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus-visible:border-ring"
          />
          {value ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => { onChange(null) }}>Clear</Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { BoardContext }