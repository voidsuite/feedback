import * as React from "react"
import { ChevronLeft, ChevronRight, Copy, History, Plus, Replace, Search, Trash2, Users } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table"
import { useToast } from "@/contexts/toast"
import type { PresenceUser } from "@/lib/room"
import type { PageSettings, VersionRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

// --- Share ---

export function ShareDialog({
  open,
  onOpenChange,
  docId,
  docKey,
  presence,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  docId: string
  docKey: string
  presence: PresenceUser[]
}) {
  const { toast } = useToast()
  const link = `${window.location.origin}/d/${docId}#k=${docKey}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast({ title: "Link copied", description: "Anyone with the link can open and edit this document.", variant: "success" })
    } catch {
      toast({ title: "Couldn't copy", variant: "destructive" })
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share document</DialogTitle>
          <DialogDescription>
            The document key travels in the link — the server never sees it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={copy}>
            <Copy className="size-3.5" /> Copy
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          {presence.length === 0 ? "No one else is viewing right now." : `${presence.length} viewing now`}
        </div>
        {presence.length > 0 && (
          <div className="flex -space-x-2">
            {presence.map((u) => (
              <Avatar key={u.clientId} className="size-7 ring-2 ring-background" style={{ boxShadow: `0 0 0 1px ${u.color}` }}>
                <AvatarFallback className="text-[10px]" style={{ background: `${u.color}33`, color: u.color }}>
                  {(u.name || "?").slice(0, 1).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// --- Page setup ---

export function PageSetupDialog({
  open,
  onOpenChange,
  page,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  page: PageSettings
  onSave: (p: PageSettings) => void
}) {
  const [size, setSize] = React.useState(page.size)
  const [orientation, setOrientation] = React.useState(page.orientation)
  const [margins, setMargins] = React.useState(page.margins)
  const [mode, setMode] = React.useState(page.mode)

  React.useEffect(() => {
    setSize(page.size)
    setOrientation(page.orientation)
    setMargins(page.margins)
    setMode(page.mode)
  }, [page, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Page setup</DialogTitle>
          <DialogDescription>Applies to this document.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Paper size</Label>
              <Select value={size} onValueChange={(v) => setSize(v as PageSettings["size"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="a4">A4</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Orientation</Label>
              <Select value={orientation} onValueChange={(v) => setOrientation(v as PageSettings["orientation"])}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Portrait</SelectItem>
                  <SelectItem value="landscape">Landscape</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Margins</Label>
              <span className="text-xs tabular-nums text-muted-foreground">{Math.round(margins)} pt</span>
            </div>
            <Slider min={28} max={180} step={1} value={[margins]} onValueChange={(v) => setMargins(typeof v === "number" ? v : v[0])} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs">Pageless</Label>
              <p className="text-[11px] text-muted-foreground">Continuous scrolling, no page breaks</p>
            </div>
            <Switch checked={mode === "pageless"} onCheckedChange={(on) => setMode(on ? "pageless" : "paged")} />
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => onSave({ size, orientation, margins: Math.round(margins), mode, zoom: page.zoom })}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// --- Find & replace ---

interface Match {
  from: number
  to: number
}

function collectMatches(editor: Editor, query: string): Match[] {
  if (!query) return []
  const out: Match[] = []
  const doc = editor.state.doc
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    const text = node.text ?? ""
    let idx = text.toLowerCase().indexOf(query.toLowerCase())
    while (idx !== -1) {
      out.push({ from: pos + idx, to: pos + idx + query.length })
      idx = text.toLowerCase().indexOf(query.toLowerCase(), idx + query.length)
    }
    return true
  })
  return out
}

export function FindReplaceDialog({
  open,
  onOpenChange,
  editor,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editor: Editor
}) {
  const [find, setFind] = React.useState("")
  const [replace, setReplace] = React.useState("")
  const [matches, setMatches] = React.useState<Match[]>([])
  const [index, setIndex] = React.useState(0)

  React.useEffect(() => {
    if (!open) return
    setMatches(collectMatches(editor, find))
    setIndex(0)
  }, [find, open, editor])

  React.useEffect(() => {
    if (matches.length === 0) return
    const m = matches[Math.min(index, matches.length - 1)]
    editor.chain().focus().setTextSelection({ from: m.from, to: m.to }).run()
    const coords = editor.view.coordsAtPos(m.from)
    editor.view.dom.parentElement?.scrollTo({
      top: coords.top - editor.view.dom.parentElement.getBoundingClientRect().top - 140,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, matches.length])

  const go = (delta: number) => {
    if (matches.length === 0) return
    setIndex((prev) => (prev + delta + matches.length) % matches.length)
  }

  const replaceCurrent = () => {
    const m = matches[index]
    if (!m) return
    const tr = editor.state.tr
    tr.delete(m.from, m.to)
    tr.insertText(replace, m.from)
    editor.view.dispatch(tr)
    setMatches(collectMatches(editor, find))
    setIndex((prev) => Math.min(prev, collectMatches(editor, find).length - 1))
  }

  const replaceAll = () => {
    const all = collectMatches(editor, find)
    if (all.length === 0) return
    const tr = editor.state.tr
    for (let i = all.length - 1; i >= 0; i--) {
      tr.delete(all[i].from, all[i].to)
      tr.insertText(replace, all[i].from)
    }
    editor.view.dispatch(tr)
    setMatches([])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[10%] sm:max-w-sm" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Search className="size-4" /> Find and replace
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Input
              autoFocus
              placeholder="Find…"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && go(e.shiftKey ? -1 : 1)}
              className="h-8"
            />
            <span className="w-16 shrink-0 text-center text-xs tabular-nums text-muted-foreground">
              {matches.length ? `${index + 1}/${matches.length}` : "0/0"}
            </span>
            <Button variant="outline" size="sm" className="h-8 w-8 shrink-0 px-0" onClick={() => go(-1)}>
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 w-8 shrink-0 px-0" onClick={() => go(1)}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              placeholder="Replace with…"
              value={replace}
              onChange={(e) => setReplace(e.target.value)}
              className="h-8"
            />
            <Button size="sm" className="h-8 shrink-0 gap-1" disabled={!matches.length} onClick={replaceCurrent}>
              Replace
            </Button>
            <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1" disabled={!matches.length} onClick={replaceAll}>
              <Replace className="size-3.5" /> All
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// --- Word count ---

export function WordCountDialog({ open, onOpenChange, editor }: { open: boolean; onOpenChange: (o: boolean) => void; editor: Editor }) {
  const stats = React.useMemo(() => {
    const text = editor.state.doc.textBetween(0, editor.state.doc.content.size, " ")
    const words = text.trim() ? text.trim().split(/\s+/).length : 0
    const chars = text.length
    const charsNoSpaces = text.replace(/\s/g, "").length
    let paragraphs = 0
    editor.state.doc.descendants((node) => {
      if (node.type.name === "paragraph" && node.textContent.trim()) paragraphs++
      return true
    })
    return { words, chars, charsNoSpaces, paragraphs }
  }, [editor.state.doc])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Word count</DialogTitle>
        </DialogHeader>
        <Table>
          <TableBody>
            <TableRow><TableCell className="py-2 text-sm">Words</TableCell><TableCell className="py-2 text-right tabular-nums">{stats.words}</TableCell></TableRow>
            <TableRow><TableCell className="py-2 text-sm">Characters</TableCell><TableCell className="py-2 text-right tabular-nums">{stats.chars}</TableCell></TableRow>
            <TableRow><TableCell className="py-2 text-sm">Characters (no spaces)</TableCell><TableCell className="py-2 text-right tabular-nums">{stats.charsNoSpaces}</TableCell></TableRow>
            <TableRow><TableCell className="py-2 text-sm">Paragraphs</TableCell><TableCell className="py-2 text-right tabular-nums">{stats.paragraphs}</TableCell></TableRow>
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}

// --- Version history ---

export function VersionHistorySheet({
  open,
  onOpenChange,
  versions,
  onRestore,
  onDelete,
  onName,
  onCreateNamed,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  versions: VersionRecord[]
  onRestore: (v: VersionRecord) => void
  onDelete: (id: string) => void
  onName: (v: VersionRecord, name: string) => void
  onCreateNamed: (name: string) => void
}) {
  const [pendingRestore, setPendingRestore] = React.useState<VersionRecord | null>(null)
  const [naming, setNaming] = React.useState<VersionRecord | null>(null)
  const [nameDraft, setNameDraft] = React.useState("")
  const [newVersionName, setNewVersionName] = React.useState("")

  const saveNamedVersion = () => {
    const name = newVersionName.trim()
    if (!name) return
    onCreateNamed(name)
    setNewVersionName("")
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[min(340px,100%)] sm:max-w-[340px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="size-4" /> Version history
            </SheetTitle>
            <SheetDescription>Auto-checkpoints are saved while you edit. Named versions are kept forever.</SheetDescription>
          </SheetHeader>
          <div className="mt-4 rounded-lg border border-border bg-muted/40 p-2.5">
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">Save current version</p>
            <div className="flex gap-1.5">
              <Input
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveNamedVersion()}
                placeholder="e.g. Final draft"
                className="h-8 text-xs"
              />
              <Button size="sm" className="h-8 shrink-0 px-2.5 text-xs" onClick={saveNamedVersion} disabled={!newVersionName.trim()}>
                <Plus className="size-3.5" />
              </Button>
            </div>
          </div>
          <ScrollArea className="mt-3 h-[calc(100vh-14rem)] pr-2">
            <div className="space-y-2">
              {versions.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">No versions yet — keep editing and checkpoints will appear here.</p>
              )}
              {versions.map((v) => (
                <div key={v.id} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium">
                        {v.name || (v.kind === "auto" ? "Automatic checkpoint" : "Version")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(v.createdAt).toLocaleString()} {v.author ? `· ${v.author}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-0.5">
                      <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => setPendingRestore(v)}>
                        Restore
                      </Button>
                      {v.kind === "auto" && (
                        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => { setNaming(v); setNameDraft(v.name || "") }}>
                          Name
                        </Button>
                      )}
                      {v.kind === "auto" && (
                        <Button variant="ghost" size="sm" className="h-6 w-6 px-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(v.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!pendingRestore} onOpenChange={(o) => !o && setPendingRestore(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this version?</AlertDialogTitle>
            <AlertDialogDescription>
              The current content will be replaced by the version from{" "}
              {pendingRestore ? new Date(pendingRestore.createdAt).toLocaleString() : ""}. You can undo this with
              Version history → Restore the latest checkpoint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingRestore) onRestore(pendingRestore)
                setPendingRestore(null)
              }}
            >
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!naming} onOpenChange={(o) => !o && setNaming(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Name this version</DialogTitle>
            <DialogDescription>Named versions are never pruned automatically.</DialogDescription>
          </DialogHeader>
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && nameDraft.trim() && naming) {
                onName(naming, nameDraft.trim())
                setNaming(null)
              }
            }}
            placeholder="e.g. Final draft"
          />
          <DialogFooter>
            <Button
              onClick={() => {
                if (nameDraft.trim() && naming) {
                  onName(naming, nameDraft.trim())
                  setNaming(null)
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// --- Help / shortcuts ---

const SHORTCUTS: [string, string][] = [
  ["Bold", "Ctrl+B"],
  ["Italic", "Ctrl+I"],
  ["Underline", "Ctrl+U"],
  ["Find and replace", "Ctrl+H"],
  ["Word count", "Ctrl+Shift+C"],
  ["Print / PDF", "Ctrl+P"],
  ["New document", "Ctrl+Alt+N"],
  ["Home", "Ctrl+Alt+H"],
  ["Comment", "Ctrl+Alt+M"],
  ["Suggestion mode", "Ctrl+Alt+Shift+M"],
  ["Outline", "Ctrl+Alt+O"],
  ["Comments", "Ctrl+Alt+C"],
  ["Version history", "Ctrl+Alt+V"],
  ["Page setup", "Ctrl+Alt+P"],
  ["Save / sync", "Ctrl+S"],
  ["Undo / Redo", "Ctrl+Z / Ctrl+Y"],
]

export function HelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Void Docs — encrypted, local-first documents.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-80">
          <div className="space-y-0.5">
            {SHORTCUTS.map(([label, keys]) => (
              <div key={label} className="flex items-center justify-between rounded-md px-1 py-1 text-[13px]">
                <span>{label}</span>
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px]">{keys}</kbd>
              </div>
            ))}
          </div>
        </ScrollArea>
        <Separator />
        <p className="text-[11px] text-muted-foreground">
          docs 0.1.0 · part of the VoidSuite family · MIT licensed
        </p>
      </DialogContent>
    </Dialog>
  )
}

// --- small shared bits ---

export function VersionBadge({ v }: { v: VersionRecord }) {
  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px]", v.kind === "auto" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary")}>
      {v.kind === "auto" ? "auto" : "named"}
    </span>
  )
}