/**
 * Editor page — the full Docs-style document surface.
 *
 * Lifecycle: load doc (or create "new", or adopt a share link) → resolve the
 * doc key → start the encrypted Yjs room → mount the TipTap editor bound to
 * the collab document → wire up checkpoints, comments, exports and dialogs.
 */

import * as React from "react"
import { useNavigate, useParams } from "react-router"
import { ArrowLeft, FileQuestion, Star, Loader2 } from "lucide-react"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import * as Y from "yjs"
import type { Awareness } from "y-protocols/awareness"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth"
import { useDocs } from "@/contexts/docs"
import { useSettings } from "@/contexts/settings"
import { useToast } from "@/contexts/toast"
import { useYjsDoc } from "@/lib/room"
import {
  acceptSuggestions,
  addCommentThread,
  buildEditorExtensions,
  hasSuggestions,
  rejectSuggestions,
} from "@/lib/editor"
import { readShareFragment } from "@/lib/crypto"
import { applyRestore, createAutoCheckpointer, createVersion, decodeSnapshot, deleteVersion, loadVersions, renameVersion } from "@/lib/versions"
import { exportAsDocx, exportAsHtml, exportAsMarkdown, exportAsPdf, exportAsText, downloadBlob } from "@/lib/export"
import { importFileIntoEditor } from "@/lib/import"
import { PX_PER_PT, Ruler } from "@/components/editor/ruler"
import { EditorToolbar, type ToolbarCallbacks } from "@/components/editor/toolbar"
import { CommentsPanel, OutlinePanel } from "@/components/editor/sidebars"
import { EditorContextMenu } from "@/components/editor/editor-context-menu"
import { FindReplaceDialog, HelpDialog, PageSetupDialog, ShareDialog, VersionHistorySheet, WordCountDialog } from "@/components/editor/dialogs"
import { StatusBar } from "@/components/editor/status-bar"
import { defaultPageSettings, type DocMeta, type PageSettings, type VersionRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

const PAGE_PTS: Record<string, { w: number; h: number }> = {
  a4: { w: 595.28, h: 841.89 },
  letter: { w: 612, h: 792 },
}

const PALETTE = ["#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#ef4444", "#06b6d4", "#84cc16"]

function colorForName(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return PALETTE[Math.abs(hash) % PALETTE.length]
}

// --- Suggestion-mode text interception (tracked changes) ---

function suggestionAttrs(userName: string, userColor: string) {
  return { author: userName, color: userColor, date: Date.now() }
}

function findTextRun(doc: { descendants: (fn: (node: unknown, pos: number) => boolean) => void }, p: number): { from: number; to: number } | null {
  let run: { from: number; to: number } | null = null
  doc.descendants((node, pos) => {
    if (run) return false
    const n = node as { isText?: boolean; nodeSize?: number }
    if (n.isText && pos <= p && p <= pos + (n.nodeSize ?? 0)) {
      run = { from: pos, to: pos + (n.nodeSize ?? 0) }
      return false
    }
    return true
  })
  return run
}

function handleSuggestionInput(
  view: import("@tiptap/pm/view").EditorView,
  from: number,
  to: number,
  text: string,
  userName: string,
  userColor: string
): boolean {
  const { state } = view
  const insertMark = state.schema.marks["suggestion-insert"]
  const deleteMark = state.schema.marks["suggestion-delete"]
  if (!insertMark || !deleteMark) return false
  if (from > to) return false

  const tr = state.tr
  if (from < to) {
    // Replacing a selection: mark the old text as a deletion suggestion first.
    tr.addMark(from, to, deleteMark.create(suggestionAttrs(userName, userColor)))
  }
  tr.insertText(text, to)
  tr.addMark(to, to + text.length, insertMark.create(suggestionAttrs(userName, userColor)))
  view.dispatch(tr)
  return true
}

function handleSuggestionKeyDown(
  view: import("@tiptap/pm/view").EditorView,
  event: KeyboardEvent,
  userName: string,
  userColor: string
): boolean {
  if (event.key !== "Backspace" && event.key !== "Delete") return false
  if (event.ctrlKey || event.metaKey || event.altKey) return false
  const { state } = view
  const insertMark = state.schema.marks["suggestion-insert"]
  const deleteMark = state.schema.marks["suggestion-delete"]
  if (!insertMark || !deleteMark) return false

  const sel = state.selection as { empty?: boolean; from?: number; to?: number }
  if (sel.empty !== false && typeof sel.from === "number") {
    const pos = sel.from
    const p = event.key === "Backspace" ? pos - 1 : pos
    if (p < 0 || p >= state.doc.content.size) return false
    const run = findTextRun(state.doc, p)
    if (!run) return false
    const from = Math.max(run.from, p)
    const to = Math.min(run.to, p + 1)
    if (from >= to) return false
    // Typing over an existing suggestion keeps the default behavior (approve/reject it).
    if (state.doc.rangeHasMark(from, to, insertMark) || state.doc.rangeHasMark(from, to, deleteMark)) return false
    const tr = state.tr
    tr.addMark(from, to, deleteMark.create(suggestionAttrs(userName, userColor)))
    view.dispatch(tr)
    return true
  }

  if (typeof sel.from === "number" && typeof sel.to === "number" && sel.to > sel.from) {
    // Delete the selection as a suggestion.
    const tr = state.tr
    tr.addMark(sel.from, sel.to, deleteMark.create(suggestionAttrs(userName, userColor)))
    view.dispatch(tr)
    return true
  }
  return false
}

// --- Editor surface ---
// Mounts the TipTap editor bound to the room's Y.Doc. Created ONLY after the
// room is ready (empty extension lists crash the ProseMirror schema build),
// so this component is rendered conditionally and recreates the editor if the
// room is torn down (docId change).
function EditorSurface({
  yDoc,
  awareness,
  editorProps,
  onEditor,
}: {
  yDoc: Y.Doc
  awareness: Awareness
  editorProps: Record<string, unknown>
  onEditor: (e: Editor) => void
}) {
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: buildEditorExtensions({ yDoc, awareness }),
      editorProps,
    },
    [yDoc, awareness]
  )
  React.useEffect(() => {
    if (editor) onEditor(editor)
  }, [editor, onEditor])
  return null
}

// --- Main page ---

export function EditorPage() {
  const { docId = "" } = useParams()
  const navigate = useNavigate()
  const { createDoc, adoptSharedDoc, loadDoc, patchDoc, renameDoc, deleteDoc, toggleStar, cloud, syncNow } = useDocs()
  const { user } = useAuth()
  const { settings, updateSettings } = useSettings()
  const { toast } = useToast()

  const [phase, setPhase] = React.useState<"loading" | "missing" | "ready">("loading")
  const [meta, setMeta] = React.useState<DocMeta | null>(null)
  const [docKey, setDocKey] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState("Untitled document")

  const [suggestionMode, setSuggestionMode] = React.useState(settings.suggestionMode)
  const [outlineVisible, setOutlineVisible] = React.useState(settings.showOutline)
  const [commentsVisible, setCommentsVisible] = React.useState(false)
  const [findOpen, setFindOpen] = React.useState(false)
  const [wordCountOpen, setWordCountOpen] = React.useState(false)
  const [shareOpen, setShareOpen] = React.useState(false)
  const [pageSetupOpen, setPageSetupOpen] = React.useState(false)
  const [versionsOpen, setVersionsOpen] = React.useState(false)
  const [helpOpen, setHelpOpen] = React.useState(false)
  const [versions, setVersions] = React.useState<VersionRecord[]>([])
  const [hasSugg, setHasSugg] = React.useState(false)

  const userName = user?.name || "Local user"
  const userColor = React.useMemo(() => colorForName(userName), [userName])

  // --- Load / create / adopt ---
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (docId === "new") {
        const m = await createDoc("Untitled document")
        if (!cancelled) navigate(`/d/${m.id}`, { replace: true })
        return
      }
      const shareKey = readShareFragment(window.location.hash)
      let h = await loadDoc(docId)
      if (!h && shareKey) {
        try {
          const m = await adoptSharedDoc(docId, shareKey)
          h = { meta: m, docKey: shareKey }
        } catch {
          h = null
        }
      }
      if (cancelled) return
      if (!h) {
        setPhase("missing")
        return
      }
      if (shareKey) window.history.replaceState({}, "", `/d/${docId}`)
      setMeta(h.meta)
      setDocKey(h.docKey)
      setTitle(h.meta.title)
      setPhase("ready")
    })()
    return () => {
      cancelled = true
    }
  }, [docId, createDoc, adoptSharedDoc, loadDoc, navigate])

  // --- Room (encrypted collab + persistence) ---
  const room = useYjsDoc({
    enabled: phase === "ready" && !!docKey,
    docId,
    docKeyB64: docKey || "",
    userName,
    userColor,
    // The relay requires a gateway session — don't attempt it while signed
    // out (the gateway rejects the upgrade with 401 and the provider would
    // otherwise reconnect every 2s forever).
    collabEnabled: !!user,
  })

  const yDoc = room.ready ? room.getDoc() : null
  const awareness = room.ready ? room.getAwareness() : null

  // --- Editor ---
  const modeRef = React.useRef({ suggestionMode, userName, userColor })
  modeRef.current = { suggestionMode, userName, userColor }

  const editorProps = React.useMemo(
    () => ({
      attributes: { class: "vdocs-editor", spellcheck: "true" },
      handleTextInput: (view: import("@tiptap/pm/view").EditorView, from: number, to: number, text: string) => {
        const m = modeRef.current
        return m.suggestionMode
          ? handleSuggestionInput(view, from, to, text, m.userName, m.userColor)
          : false
      },
      handleKeyDown: (view: import("@tiptap/pm/view").EditorView, event: KeyboardEvent) => {
        const m = modeRef.current
        return m.suggestionMode
          ? handleSuggestionKeyDown(view, event, m.userName, m.userColor)
          : false
      },
    }),
    []
  )

  const [editor, setEditor] = React.useState<Editor | null>(null)
  const handleEditorReady = React.useCallback((e: Editor) => setEditor(e), [])
  const imageInputRef = React.useRef<HTMLInputElement>(null)

  // Track whether suggestions exist (for toolbar enable/disable).
  React.useEffect(() => {
    if (!editor) return
    const update = () => setHasSugg(hasSuggestions(editor))
    editor.on("transaction", update)
    update()
    return () => {
      editor.off("transaction", update)
    }
  }, [editor])

  // --- Auto-checkpoints ---
  React.useEffect(() => {
    if (!editor || !room.ready) return
    const checkpointer = createAutoCheckpointer()
    checkpointer.start(room.getDoc(), { docId, docKey: room.getKey()! })
    return () => checkpointer.stop()
  }, [editor, room.ready, room, docId])

  // --- Refresh versions on open ---
  const refreshVersions = React.useCallback(async () => {
    setVersions(await loadVersions(docId))
  }, [docId])

  React.useEffect(() => {
    if (versionsOpen) void refreshVersions()
  }, [versionsOpen, refreshVersions])

  // --- Persist page settings + updatedAt (debounced) ---
  const [page, setPage] = React.useState<PageSettings>(defaultPageSettings)
  React.useEffect(() => {
    if (meta) setPage(meta.page)
  }, [meta])

  const savePage = React.useCallback(
    (next: PageSettings) => {
      setPage(next)
      void patchDoc(docId, { page: next })
    },
    [docId, patchDoc]
  )

  React.useEffect(() => {
    if (!editor || !meta) return
    let t: number | undefined
    const onUpdate = () => {
      if (t) window.clearTimeout(t)
      t = window.setTimeout(() => {
        void patchDoc(docId, { updatedAt: Date.now() })
      }, 2000)
    }
    editor.on("update", onUpdate)
    return () => {
      editor.off("update", onUpdate)
      if (t) window.clearTimeout(t)
    }
  }, [editor, meta, docId, patchDoc])

  // --- Handlers ---

  const renameTimer = React.useRef<number | undefined>(undefined)
  // On narrow screens (phones) the page is fitted to the viewport until the
  // user changes the zoom manually (see the render section below).
  const zoomTouched = React.useRef(false)
  React.useEffect(() => () => window.clearTimeout(renameTimer.current), [])
  const commitRename = (name: string) => {
    const final = name.trim() || "Untitled document"
    window.clearTimeout(renameTimer.current)
    setTitle(final)
    setMeta((m) => (m ? { ...m, title: final } : m))
    void renameDoc(docId, final)
  }
  // Streaming rename — persists locally immediately, synced after a quiet beat.
  const onRename = (next: string) => {
    setTitle(next)
    setMeta((m) => (m ? { ...m, title: next } : m))
    window.clearTimeout(renameTimer.current)
    renameTimer.current = window.setTimeout(() => {
      void renameDoc(docId, next.trim() || "Untitled document")
    }, 600)
  }

  const addComment = () => {
    if (!editor || !room.ready) return
    const { from, to } = editor.state.selection
    if (from === to) {
      toast({ title: "Select text first", description: "Highlight the text you want to comment on.", variant: "destructive" })
      return
    }
    const selected = editor.state.doc.textBetween(from, to, " ")
    const id = crypto.randomUUID()
    addCommentThread(room.getDoc(), { id, text: selected, author: userName, authorColor: userColor })
    editor.chain().focus().setMark("comment", { threadId: id, author: userName, color: userColor }).run()
    setCommentsVisible(true)
    toast({ title: "Comment added", variant: "success" })
  }

  const doExport = (kind: "docx" | "pdf" | "md" | "txt" | "html") => {
    if (!editor || !meta) return
    const base = meta.title || "document"
    switch (kind) {
      case "docx":
        void exportAsDocx(editor, meta).catch(() => toast({ title: "Export failed", variant: "destructive" }))
        break
      case "pdf":
        exportAsPdf(editor, meta)
        break
      case "md":
        downloadBlob(new Blob([exportAsMarkdown(editor)], { type: "text/markdown" }), `${base}.md`)
        break
      case "txt":
        downloadBlob(new Blob([exportAsText(editor)], { type: "text/plain" }), `${base}.txt`)
        break
      case "html":
        downloadBlob(new Blob([exportAsHtml(editor)], { type: "text/html" }), `${base}.html`)
        break
    }
  }

  const doImport = async (file: File) => {
    if (!editor) return
    try {
      const { kind, warnings } = await importFileIntoEditor(file, editor)
      toast({
        title: `Imported .${kind === "docx" ? "docx" : kind === "md" ? "md" : kind === "html" ? "html" : "txt"}`,
        description: warnings.length ? `${warnings.length} conversion note(s).` : undefined,
        variant: "success",
      })
    } catch (e: unknown) {
      toast({ title: "Import failed", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const createNamedVersion = async (name: string) => {
    if (!room.ready) return
    await createVersion({
      doc: room.getDoc(),
      docId,
      docKey: room.getKey()!,
      kind: "named",
      name,
      author: userName,
    })
    void refreshVersions()
    toast({ title: "Version saved", variant: "success" })
  }

  const restoreVersion = async (v: VersionRecord) => {
    try {
      const key = room.getKey()
      if (!key) throw new Error("No key")
      const restored = await decodeSnapshot(v.snapshotB64, key)
      applyRestore(room.getDoc(), restored)
      toast({ title: "Version restored", variant: "success" })
    } catch {
      toast({ title: "Couldn't restore version", variant: "destructive" })
    }
  }

  const callbacks: ToolbarCallbacks = {
    onShare: () => setShareOpen(true),
    onPageSetup: () => setPageSetupOpen(true),
    onWordCount: () => setWordCountOpen(true),
    onFindReplace: () => setFindOpen(true),
    onVersionHistory: () => setVersionsOpen(true),
    onNew: () => navigate("/d/new"),
    onHome: () => navigate("/"),
    onRenameRequest: () => document.getElementById("vdocs-title")?.focus(),
    onToggleStar: () => void toggleStar(docId),
    onDelete: () => {
      void deleteDoc(docId)
      navigate("/")
      toast({ title: "Document moved to trash", variant: "success" })
    },
    onAddComment: addComment,
    onImport: (f) => void doImport(f),
    onExport: doExport,
    onPrint: () => doExport("pdf"),
    onToggleOutline: () => {
      setOutlineVisible((v) => {
        updateSettings({ showOutline: !v })
        return !v
      })
    },
    onToggleComments: () => setCommentsVisible((v) => !v),
    onHelp: () => setHelpOpen(true),
  }

  // --- Manual save (Ctrl/Cmd+S) ---
  // Autosave already persists every keystroke to IndexedDB; the manual save
  // flushes the "last edited" timestamp, then pushes the encrypted cloud
  // backup when signed in, and confirms with a toast.
  const doManualSave = React.useCallback(async () => {
    void patchDoc(docId, { updatedAt: Date.now() })
    if (!user) {
      toast({ title: "Saved", description: "Changes are saved on this device.", variant: "success" })
      return
    }
    const ok = await syncNow()
    if (ok) {
      toast({ title: "Saved", description: "All changes backed up to the cloud.", variant: "success" })
    } else {
      toast({ title: "Save failed", description: "Changes are saved locally; the cloud backup didn't complete.", variant: "destructive" })
    }
  }, [docId, patchDoc, syncNow, toast, user])

  // --- Global keyboard shortcuts ---
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const k = e.key.toLowerCase()

      if (e.altKey) {
        // Ctrl+Alt / Cmd+Alt — app-level navigation + panel toggles.
        if (k === "n") {
          e.preventDefault()
          navigate("/d/new")
        } else if (k === "h") {
          e.preventDefault()
          navigate("/")
        } else if (k === "m") {
          e.preventDefault()
          if (e.shiftKey) setSuggestionMode((v) => !v)
          else if (editor && editor.state.selection.from !== editor.state.selection.to) addComment()
          else toast({ title: "Select text first", description: "Highlight the text you want to comment on.", variant: "destructive" })
        } else if (k === "o") {
          e.preventDefault()
          setOutlineVisible((v) => {
            updateSettings({ showOutline: !v })
            return !v
          })
        } else if (k === "c") {
          e.preventDefault()
          setCommentsVisible((v) => !v)
        } else if (k === "v") {
          e.preventDefault()
          setVersionsOpen(true)
        } else if (k === "p") {
          e.preventDefault()
          setPageSetupOpen(true)
        } else if (k === "s") {
          e.preventDefault()
          void doManualSave()
        }
        return
      }

      // Plain Ctrl/Cmd — editor commands.
      if (k === "s") {
        // Manual save — always swallow the browser's default "Save page".
        e.preventDefault()
        void doManualSave()
      } else if (k === "h") {
        e.preventDefault()
        setFindOpen(true)
      } else if (k === "c" && e.shiftKey) {
        e.preventDefault()
        setWordCountOpen(true)
      } else if (k === "p") {
        e.preventDefault()
        doExport("pdf")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, editor, user, syncNow, doManualSave])

  // --- Render states ---

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </div>
    )
  }

  if (phase === "missing" || !meta || !docKey) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <FileQuestion className="size-10 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Document not found</p>
          <p className="text-sm text-muted-foreground">It may have been deleted, or the link is invalid.</p>
        </div>
        <Button onClick={() => navigate("/")}>Back to home</Button>
      </div>
    )
  }

  // On narrow screens (phones) the page is fitted to the viewport so it is
  // readable without horizontal panning. Once the user changes the zoom
  // manually, their choice wins.
  const pagePts = PAGE_PTS[page.size] ?? PAGE_PTS.a4
  const pageW = pagePts.w
  const zoom = zoomTouched.current
    ? page.zoom
    : Math.min(page.zoom, Math.max(0.5, (typeof window !== "undefined" ? window.innerWidth : 1024) / (pageW * PX_PER_PT)))
  const scale = PX_PER_PT * zoom
  const pageOuterPx = Math.round(pageW * scale)
  const pageInnerPx = Math.round((pageW - page.margins * 2) * scale)
  const pageH = pagePts.h
  const pageOuterHPx = Math.round(pageH * scale)
  const wordCount = editor ? editor.state.doc.textBetween(0, editor.state.doc.content.size, " ").trim().split(/\s+/).filter(Boolean).length : 0
  const pageCount = page.mode === "paged" ? Math.max(1, Math.ceil((editor ? Math.max(200, editor.state.doc.content.size / 8) : 200) / (pageH - page.margins * 2))) : 1

  const syncLabel =
    cloud.state === "syncing"
      ? "Syncing…"
      : cloud.state === "synced"
        ? "Synced"
        : cloud.state === "error"
          ? "Sync failed"
          : settings.syncEnabled
            ? "Offline"
            : undefined

  return (
    <div className="flex h-dvh flex-col bg-background">
      {room.ready && yDoc && awareness && (
        <EditorSurface yDoc={yDoc} awareness={awareness} editorProps={editorProps} onEditor={handleEditorReady} />
      )}
      {/* Header row */}
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-background px-2">
        <Button variant="ghost" size="sm" className="h-8 w-8 px-0" onClick={() => navigate("/")} title="Back to home (Ctrl+Alt+H)">
          <ArrowLeft className="size-4" />
        </Button>
        <input
          id="vdocs-title"
          value={title}
          onChange={(e) => onRename(e.target.value)}
          onBlur={() => commitRename(title)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="h-8 min-w-0 flex-1 truncate rounded-md bg-transparent px-2 text-[15px] font-medium text-foreground outline-none transition-colors hover:bg-accent/50 focus:bg-accent/60"
        />
        <Button
          variant="ghost"
          size="sm"
          className={cn("h-8 w-8 px-0", meta.starred && "text-amber-500")}
          onClick={() => void toggleStar(docId)}
          title={meta.starred ? "Unstar" : "Star"}
        >
          <Star className="size-4" fill={meta.starred ? "currentColor" : "none"} />
        </Button>
        <div className="hidden -space-x-1.5 me-1 sm:flex">
          <span
            className="inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-background"
            style={{ background: `${userColor}33`, color: userColor, boxShadow: `0 0 0 1px ${userColor}` }}
            title={userName}
          >
            {userName.slice(0, 1).toUpperCase()}
          </span>
          {room.presence.slice(0, 3).map((u) => (
            <span
              key={u.clientId}
              className="inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-background"
              style={{ background: `${u.color}33`, color: u.color, boxShadow: `0 0 0 1px ${u.color}` }}
              title={u.name}
            >
              {(u.name || "?").slice(0, 1).toUpperCase()}
            </span>
          ))}
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-xs" onClick={() => setShareOpen(true)}>
          Share
        </Button>
      </div>

      <EditorToolbar
        editor={editor}
        title={title}
        starred={meta.starred}
        suggestionMode={suggestionMode}
        setSuggestionMode={(v) => {
          setSuggestionMode(v)
          updateSettings({ suggestionMode: v })
        }}
        hasSuggestions={hasSugg}
        onAcceptSuggestions={() => {
          if (!editor) return
          acceptSuggestions(editor)
          setHasSugg(false)
        }}
        onRejectSuggestions={() => {
          if (!editor) return
          rejectSuggestions(editor)
          setHasSugg(false)
        }}
        syncState={{ state: room.status === "online" ? "synced" : room.status === "connecting" ? "syncing" : "idle" }}
        canUndo={room.canUndo}
        canRedo={room.canRedo}
        onUndo={room.undo}
        onRedo={room.redo}
        callbacks={callbacks}
      />

      <div className="flex min-h-0 flex-1">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const src = String(reader.result)
              editor?.chain().focus().setImage({ src }).run()
            }
            reader.readAsDataURL(file)
            e.target.value = ""
          }}
        />
        {editor ? (
          <EditorContextMenu
            editor={editor}
            onInsertImage={() => imageInputRef.current?.click()}
            onAddComment={addComment}
            canUndo={room.canUndo}
            canRedo={room.canRedo}
            onUndo={room.undo}
            onRedo={room.redo}
          >
            {/* Canvas */}
            <div className="vdocs-canvas vdocs-scrollbar min-w-0 flex-1 overflow-auto bg-muted/40">
              {page.mode === "paged" ? (
                <div className="mx-auto w-fit py-6">
                  <Ruler
                    pageWidthPt={pageW}
                    marginsPt={page.margins}
                    zoom={zoom}
                    onMarginsChange={(pt) => savePage({ ...page, margins: pt })}
                    className="mx-auto"
                  />
                  <div
                    className="vdocs-page mx-auto mt-1 bg-card shadow-md"
                    style={{ width: pageOuterPx, minHeight: pageOuterHPx, padding: `${Math.round(page.margins * scale)}px` }}
                  >
                    <div className="vdocs-page-content mx-auto" style={{ width: pageInnerPx }}>
                      {editor && <EditorContent editor={editor} />}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mx-auto max-w-3xl px-8 py-10">
                  {editor && <EditorContent editor={editor} />}
                </div>
              )}
            </div>
          </EditorContextMenu>
        ) : (
          <div className="vdocs-canvas vdocs-scrollbar min-w-0 flex-1 overflow-auto bg-muted/40" />
        )}

        {outlineVisible && editor && <OutlinePanel editor={editor} onClose={() => setOutlineVisible(false)} />}
        {commentsVisible && editor && room.ready && (
          <CommentsPanel
            editor={editor}
            doc={room.getDoc()}
            version={room.version}
            onClose={() => setCommentsVisible(false)}
            userName={userName}
            userColor={userColor}
          />
        )}
      </div>

      <StatusBar
        pageLabel={page.mode === "paged" ? `Page 1 of ${pageCount}` : undefined}
        wordCount={wordCount}
        zoom={zoom}
        onZoomChange={(z) => {
          zoomTouched.current = true
          savePage({ ...page, zoom: Math.round(z * 100) / 100 })
        }}
        outlineVisible={outlineVisible}
        commentsVisible={commentsVisible}
        onToggleOutline={() => setOutlineVisible((v) => !v)}
        onToggleComments={() => setCommentsVisible((v) => !v)}
        presenceCount={room.presence.length}
        syncLabel={syncLabel}
      />

      {/* Dialogs */}
      <ShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        docId={docId}
        docKey={docKey}
        presence={room.presence}
      />
      <PageSetupDialog open={pageSetupOpen} onOpenChange={setPageSetupOpen} page={page} onSave={savePage} />
      {editor && <FindReplaceDialog open={findOpen} onOpenChange={setFindOpen} editor={editor} />}
      {editor && <WordCountDialog open={wordCountOpen} onOpenChange={setWordCountOpen} editor={editor} />}
      <VersionHistorySheet
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        versions={versions}
        onRestore={(v) => void restoreVersion(v)}
        onDelete={(id) => void deleteVersion(id).then(refreshVersions)}
        onName={(v, name) => void renameVersion(v, name).then(refreshVersions)}
        onCreateNamed={createNamedVersion}
      />
      <HelpDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </div>
  )
}