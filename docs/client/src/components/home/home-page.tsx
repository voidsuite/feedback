/**
 * Home page — Docs-style document dashboard.
 *
 * Header: wordmark, document search, sync status, settings, account menu.
 * Body: "Blank document" launcher + grid of recent documents with star,
 * rename and delete. Mirrors the Void Suite design language.
 */

import * as React from "react"
import { useNavigate } from "react-router"
import {
  AlertTriangle,
  Cloud,
  CloudOff,
  FileText,
  Loader2,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  UserRoundPlus,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DocsLogo } from "@/components/DocsLogo"
import { SettingsMenu } from "@/components/home/settings-menu"
import { useAuth } from "@/contexts/auth"
import { useDocs, type DocPreview } from "@/contexts/docs"
import { useToast } from "@/contexts/toast"
import type { DocMeta } from "@/lib/types"
import { cn, pressable } from "@/lib/utils"

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "Just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

function DocThumb({ preview }: { preview: DocPreview | null }) {
  if (preview?.image) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-lg border-b border-border bg-background">
        <img
          src={preview.image}
          alt=""
          loading="lazy"
          draggable={false}
          className="h-full w-full object-cover object-top"
        />
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/5" />
      </div>
    )
  }
  return (
    <div
      className={cn(
        "flex aspect-[4/3] w-full flex-col justify-start gap-1 overflow-hidden rounded-t-lg border-b border-border bg-card p-3 text-start",
        "bg-[linear-gradient(0deg,var(--muted),transparent_1px),linear-gradient(90deg,var(--muted),transparent_1px)]",
        "bg-[size:100%_22px,22px_100%]"
      )}
    >
      <div className="flex flex-1 items-center justify-center">
        <FileText className="size-7 text-muted-foreground/40" />
      </div>
    </div>
  )
}

function DocCard({
  doc,
  onOpen,
  onRename,
  onDelete,
  onStar,
  onPreview,
}: {
  doc: DocMeta
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
  onStar: () => void
  onPreview: (id: string) => Promise<DocPreview | null>
}) {
  const [preview, setPreview] = React.useState<DocPreview | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setPreview(null)
    onPreview(doc.id)
      .then((p) => {
        if (!cancelled) setPreview(p)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [doc.id, doc.updatedAt, onPreview])

  return (
    <div className="group overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-md">
      <button type="button" onClick={onOpen} className="block w-full text-start" aria-label={`Open ${doc.title}`}>
        <DocThumb preview={preview} />
        <div className="px-3 pb-2 pt-2.5">
          <p className="truncate text-[13px] font-medium text-foreground">{doc.title}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {timeAgo(doc.updatedAt)}
            {preview && (
              <>
                {" "}
                · {preview.words} {preview.words === 1 ? "word" : "words"}
              </>
            )}
          </p>
        </div>
      </button>
      <div className="flex items-center justify-between border-t border-border px-2 py-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-7 w-7 px-0 text-muted-foreground", doc.starred && "text-amber-500")}
                onClick={onStar}
              />
            }
          >
            <Star className="size-3.5" fill={doc.starred ? "currentColor" : "none"} />
          </TooltipTrigger>
          <TooltipContent>{doc.starred ? "Unstar" : "Star"}</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="h-7 w-7 px-0 text-muted-foreground" aria-label="Document menu" />
            }
          >
            <MoreHorizontal className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={onOpen}>
              <Pencil className="size-3.5" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRename}>
              <Pencil className="size-3.5" /> Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2 className="size-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

export function HomePage() {
  const navigate = useNavigate()
  const { user, mode, signIn, signOut } = useAuth()
  const { loading, docs, search, setSearch, createDoc, toggleStar, renameDoc, deleteDoc, cloud, previewDoc } = useDocs()
  const { toast } = useToast()

  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [renaming, setRenaming] = React.useState<DocMeta | null>(null)
  const [renameDraft, setRenameDraft] = React.useState("")
  const [deleting, setDeleting] = React.useState<DocMeta | null>(null)
  const [creating, setCreating] = React.useState(false)
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const openNew = async () => {
    setCreating(true)
    try {
      const m = await createDoc()
      navigate(`/d/${m.id}`)
    } catch {
      setCreating(false)
      toast({ title: "Couldn't create document", variant: "destructive" })
    }
  }

  const confirmRename = async () => {
    if (!renaming) return
    const name = renameDraft.trim()
    if (name && name !== renaming.title) {
      await renameDoc(renaming.id, name)
      toast({ title: "Renamed", variant: "success" })
    }
    setRenaming(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    await deleteDoc(deleting.id)
    toast({ title: "Document deleted", variant: "success" })
    setDeleting(null)
  }

  // Home keyboard shortcuts: Ctrl+N new doc · Ctrl+K search · Ctrl+, settings.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === "n") {
        e.preventDefault()
        void openNew()
      } else if (k === "k") {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      } else if (k === ",") {
        e.preventDefault()
        setSettingsOpen(true)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openNew])

  const initials = user?.name ? user.name.slice(0, 1).toUpperCase() : "?"

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <button
            type="button"
            className={cn(pressable, "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent")}
            onClick={() => navigate("/")}
            aria-label="Void Docs home"
          >
            <DocsLogo />
          </button>

          <div className="relative mx-auto w-full max-w-sm">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents"
              className="h-9 rounded-full bg-muted/50 ps-9 pe-8 text-sm shadow-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            <SettingsMenu open={settingsOpen} onOpenChange={setSettingsOpen} />

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="sm" className="h-9 gap-2 px-2" aria-label="Account menu" />
                  }
                >
                  <Avatar size="sm" className="size-6">
                    {user.picture ? <AvatarImage src={user.picture} alt={user.name} /> : null}
                    <AvatarFallback className="text-[10px] font-semibold text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden max-w-28 truncate text-xs font-medium sm:inline">{user.name}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <div className="px-2 py-1.5">
                    <p className="truncate text-xs font-medium">{user.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{user.email ?? "signed in via VoidAuth"}</p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      void signOut()
                      toast({ title: "Signed out", description: "Cloud sync paused.", variant: "success" })
                    }}
                  >
                    <LogOut className="size-3.5" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : mode === "offline" ? (
              <span
                className="hidden items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors sm:inline-flex"
                title="This build has no account support"
              >
                <CloudOff className="size-3.5" /> Local mode
              </span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-9 gap-1.5 rounded-full px-3 text-xs"
                onClick={() => void signIn()}
                title="Sign in to back up and sync your documents"
              >
                <UserRoundPlus className="size-3.5" /> Sign in
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {/* Sync banner */}
        {cloud.state === "error" && cloud.message && (
          <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm">
            <AlertTriangle className="size-4 text-destructive" />
            <span className="flex-1 text-destructive">Cloud sync failed: {cloud.message}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSettingsOpen(true)}>
              Open settings
            </Button>
          </div>
        )}

        {/* New document */}
        <section aria-label="Start a new document">
          <h2 className="mb-3 text-[13px] font-medium text-muted-foreground">Start a new document</h2>
          <button
            type="button"
            onClick={() => void openNew()}
            disabled={creating}
            className={cn(
              pressable,
              "group flex w-full max-w-64 items-center gap-3 rounded-xl border border-border bg-card p-3 text-start transition-colors hover:border-primary/40 hover:bg-accent/50 disabled:opacity-60"
            )}
          >
            <span className="inline-flex size-11 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-muted/50 transition-colors group-hover:border-primary/40">
              {creating ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : <Plus className="size-5 text-muted-foreground" />}
            </span>
            <span>
              <span className="block text-sm font-medium">Blank document</span>
              <span className="block text-[11px] text-muted-foreground">Create a new encrypted doc</span>
            </span>
          </button>
        </section>

        {/* Recent documents */}
        <section className="mt-8" aria-label="Recent documents">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-muted-foreground">
              {search ? `Results for “${search}”` : "Recent documents"}
            </h2>
            {cloud.state === "synced" && (
              <Badge variant="outline" className="gap-1 text-[11px] font-normal text-muted-foreground">
                <Cloud className="size-3" /> Synced
              </Badge>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : docs.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
              <FileText className="size-8 text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium">{search ? "No matching documents" : "No documents yet"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {search ? "Try a different search term." : "Create a blank document to get started."}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {docs.map((doc) => (
                <DocCard
                  key={doc.id}
                  doc={doc}
                  onOpen={() => navigate(`/d/${doc.id}`)}
                  onRename={() => {
                    setRenaming(doc)
                    setRenameDraft(doc.title)
                  }}
                  onDelete={() => setDeleting(doc)}
                  onStar={() => void toggleStar(doc.id)}
                  onPreview={previewDoc}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="mt-12 flex items-center justify-center gap-4 pb-6 text-[11px] text-muted-foreground/70">
          <span className="inline-flex items-center gap-1">
            <Cloud className="size-3" /> End-to-end encrypted
          </span>
          <span>·</span>
          <span>Local-first</span>
          <span>·</span>
          <span>docs by VoidSuite</span>
          <span>·</span>
          <a
            href={`${import.meta.env.VITE_FEEDBACK_URL || "https://feedback.stwupid.tech"}?source=docs`}
            className="hover:text-foreground"
          >
            Feedback
          </a>
        </footer>
      </main>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>The new name is synced to every device that has this doc.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameDraft}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void confirmRename()
              if (e.key === "Escape") setRenaming(null)
            }}
            autoFocus
            placeholder="Document name"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={() => void confirmRename()} disabled={!renameDraft.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{deleting?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the document from this device. If you have cloud sync enabled, the backup copy
              will be restored on your next sync.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}