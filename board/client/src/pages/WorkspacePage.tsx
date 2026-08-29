/**
 * WorkspacePage — one workspace: hero with members + invite, a projects
 * row, and a grid of boards. Boards open into the kanban at /b/:boardId.
 */

import * as React from "react"
import { Link, useNavigate, useParams } from "react-router"
import {
  ArrowLeft, ChevronRight, FolderKanban, LayoutGrid, MoreHorizontal, PenLine, Plus, Trash2, UserPlus,
} from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { initials } from "@/components/workspace-icon"
import { AvatarPicker } from "@/components/avatar-picker"
import { MembersDialog } from "@/components/members-dialog"
import { PromptDialog } from "@/components/prompt-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/contexts/toast"
import { useAuth } from "@/contexts/auth"
import * as api from "@/lib/api"
import type { Board, Project, Workspace } from "@/lib/types"

const PROJECT_COLORS = ["#a8a29e", "#8b5cf6", "#10b981", "#d97706", "#0ea5e9", "#f43f5e"]

const colorName: Record<string, string> = {
  "#a8a29e": "Stone",
  "#8b5cf6": "Violet",
  "#10b981": "Emerald",
  "#d97706": "Amber",
  "#0ea5e9": "Sky",
  "#f43f5e": "Rose",
}

export function WorkspacePage() {
  const { workspaceId = "" } = useParams()
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [workspace, setWorkspace] = React.useState<Workspace | null>(null)
  const [projects, setProjects] = React.useState<Project[] | null>(null)
  const [boards, setBoards] = React.useState<Board[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [membersOpen, setMembersOpen] = React.useState(false)
  const [createProjectOpen, setCreateProjectOpen] = React.useState(false)
  const [createBoardOpen, setCreateBoardOpen] = React.useState(false)
  const [renaming, setRenaming] = React.useState<{ kind: "workspace" | "project" | "board"; id: string; name: string } | null>(null)
  const [recoloring, setRecoloring] = React.useState<Project | null>(null)
  const [deleting, setDeleting] = React.useState<{ kind: "workspace" | "project" | "board"; id: string; name: string } | null>(null)

  const load = React.useCallback(() => {
    setError(null)
    Promise.all([api.getWorkspace(workspaceId), api.listProjects(workspaceId), api.listBoards(workspaceId)])
      .then(([ws, prjs, brds]) => {
        setWorkspace(ws)
        setProjects(prjs)
        setBoards(brds)
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Couldn't load this workspace"))
  }, [workspaceId])

  React.useEffect(load, [load])

  const myRole = workspace?.members.find((m) => m.userId === user?.id)?.role ?? "member"
  const canManage = myRole === "owner" || myRole === "admin"

  // --- mutations ---

  const setWorkspaceAvatar = async (file: File) => {
    try {
      const meta = await api.uploadFile(workspaceId, file)
      const ws = await api.updateWorkspace(workspaceId, { avatarFileId: meta.id })
      setWorkspace(ws)
      toast({ title: "Photo updated", variant: "success" })
    } catch (e) {
      toast({ title: "Couldn't update photo", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const removeWorkspaceAvatar = async () => {
    try {
      const ws = await api.updateWorkspace(workspaceId, { avatarFileId: null })
      setWorkspace(ws)
      toast({ title: "Photo removed", variant: "success" })
    } catch (e) {
      toast({ title: "Couldn't remove photo", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const createProject = async (name: string) => {
    try {
      const p = await api.createProject(workspaceId, name)
      setProjects((prev) => [...(prev ?? []), p])
      toast({ title: "Project created", description: name, variant: "success" })
    } catch (e) {
      toast({ title: "Couldn't create project", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const createBoard = async (name: string, projectId?: string | null) => {
    try {
      const b = await api.createBoard(workspaceId, name, projectId)
      setBoards((prev) => [...(prev ?? []), b])
      toast({ title: "Board created", description: name, variant: "success" })
      navigate(`/b/${b.id}`)
    } catch (e) {
      toast({ title: "Couldn't create board", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const rename = async (name: string) => {
    if (!renaming) return
    try {
      if (renaming.kind === "workspace") {
        const ws = await api.renameWorkspace(renaming.id, name)
        setWorkspace(ws)
      } else if (renaming.kind === "project") {
        const p = await api.renameProject(renaming.id, name)
        setProjects((prev) => prev?.map((x) => (x.id === p.id ? p : x)) ?? null)
      } else {
        const b = await api.renameBoard(renaming.id, name)
        setBoards((prev) => prev?.map((x) => (x.id === b.id ? b : x)) ?? null)
      }
      toast({ title: "Renamed", variant: "success" })
    } catch (e) {
      toast({ title: "Couldn't rename", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const recolor = async (color: string) => {
    if (!recoloring) return
    try {
      const p = await api.recolorProject(recoloring.id, color)
      setProjects((prev) => prev?.map((x) => (x.id === p.id ? p : x)) ?? null)
      setRecoloring(null)
    } catch (e) {
      toast({ title: "Couldn't change color", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const remove = async () => {
    if (!deleting) return
    try {
      if (deleting.kind === "workspace") {
        await api.deleteWorkspace(deleting.id)
        toast({ title: "Workspace deleted", description: deleting.name })
        navigate("/")
      } else if (deleting.kind === "project") {
        await api.deleteProject(deleting.id)
        setProjects((prev) => prev?.filter((x) => x.id !== deleting.id) ?? null)
        toast({ title: "Project deleted", description: deleting.name })
      } else {
        await api.deleteBoard(deleting.id)
        setBoards((prev) => prev?.filter((x) => x.id !== deleting.id) ?? null)
        toast({ title: "Board deleted", description: deleting.name })
      }
    } catch (e) {
      toast({ title: "Couldn't delete", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const deleteLabel = deleting?.kind === "workspace" ? "Delete workspace" : deleting?.kind === "project" ? "Delete project" : "Delete board"

  return (
    <AppShell>
      {error ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 p-10 text-center">
          <FolderKanban className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
              <ArrowLeft className="size-3.5" />
              All workspaces
            </Button>
          </div>
        </div>
      ) : !workspace ? (
        <div className="space-y-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-10 w-1/2 rounded-xl" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Hero */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="flex items-start gap-4">
              <AvatarPicker
                fileId={workspace.avatarFileId}
                name={workspace.name}
                seed={workspace.id}
                size="lg"
                canEdit={canManage}
                onUpload={setWorkspaceAvatar}
                onRemove={removeWorkspaceAvatar}
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-tight">{workspace.name}</h1>
                  {canManage ? (
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Rename workspace"
                      onClick={() => setRenaming({ kind: "workspace", id: workspace.id, name: workspace.name })}>
                      <PenLine className="size-3.5" />
                    </Button>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {workspace.members.length} {workspace.members.length === 1 ? "member" : "members"}
                  {projects ? ` · ${projects.length} project${projects.length === 1 ? "" : "s"}` : ""}
                  {boards ? ` · ${boards.length} board${boards.length === 1 ? "" : "s"}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setMembersOpen(true)}>
                <UserPlus className="size-3.5" />
                Invite
              </Button>
              <button
                onClick={() => setMembersOpen(true)}
                className="group flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 transition-colors hover:bg-muted/50"
                aria-label="Members"
              >
                <AvatarGroup className="*:data-[slot=avatar]:size-6">
                  {workspace.members.slice(0, 4).map((m) => (
                    <Avatar key={m.userId} size="sm">
                      <AvatarImage src={m.picture || undefined} alt={m.name} />
                      <AvatarFallback className="text-[8px]">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                  ))}
                  {workspace.members.length > 4
                    ? <AvatarGroupCount className="size-6 text-[10px]">{`+${workspace.members.length - 4}`}</AvatarGroupCount>
                    : null}
                </AvatarGroup>
                <span className="pr-1 text-xs text-muted-foreground">{workspace.members.length}</span>
              </button>
            </div>
          </div>

          {/* Projects */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Projects</h2>
              {canManage ? (
                <Button variant="ghost" size="icon-sm" className="size-6 text-muted-foreground" aria-label="New project"
                  onClick={() => setCreateProjectOpen(true)}>
                  <Plus className="size-3.5" />
                </Button>
              ) : null}
            </div>
            {projects === null ? (
              <div className="flex gap-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-40 rounded-full" />)}
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No projects yet — group boards under a project (e.g. “Q3 Release”).{" "}
                {canManage ? (
                  <button className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => setCreateProjectOpen(true)}>
                    Create one
                  </button>
                ) : null}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {projects.map((p) => (
                  <div key={p.id} className="group flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-2.5 pr-1.5">
                    <span className="size-2.5 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                    <span className="max-w-40 truncate text-sm font-medium">{p.name}</span>
                    {canManage ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon-xs" className="size-5 text-muted-foreground" aria-label={`Menu for ${p.name}`}>
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => setRenaming({ kind: "project", id: p.id, name: p.name })}>
                            <PenLine className="size-4" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setRecoloring(p)}>
                            <span className="flex size-4 items-center justify-center gap-1" aria-hidden="true">
                              {PROJECT_COLORS.map((c) => (
                                <span key={c} className="size-2 rounded-full" style={{ background: c }} />
                              ))}
                            </span>
                            Recolor
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onClick={() => setDeleting({ kind: "project", id: p.id, name: p.name })}>
                            <Trash2 className="size-4" />
                            Delete project
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Boards */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Boards</h2>
              {canManage ? (
                <Button variant="ghost" size="icon-sm" className="size-6 text-muted-foreground" aria-label="New board"
                  onClick={() => setCreateBoardOpen(true)}>
                  <Plus className="size-3.5" />
                </Button>
              ) : null}
            </div>
            {boards === null ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
              </div>
            ) : boards.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/30 p-10 text-center">
                <LayoutGrid className="size-7 text-muted-foreground" aria-hidden="true" />
                <p className="max-w-sm text-sm text-muted-foreground">
                  No boards yet. Create your first kanban board and start moving cards.
                </p>
                {canManage ? (
                  <Button onClick={() => setCreateBoardOpen(true)}>
                    <Plus className="size-4" />
                    New board
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {boards.map((b) => {
                  const project = projects?.find((p) => p.id === b.projectId)
                  return (
                    <Card key={b.id} className="group relative overflow-hidden transition-shadow hover:shadow-md">
                      <Link to={`/b/${b.id}`} className="absolute inset-0 z-0 rounded-xl" aria-label={`Open ${b.name}`} />
                      <div className="h-1" style={{ background: project?.color ?? "transparent" }} aria-hidden="true" />
                      <CardHeader className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {b.avatarFileId ? (
                                <img src={api.fileUrl(b.avatarFileId)} alt="" className="size-6 shrink-0 rounded-md object-cover" />
                              ) : null}
                              <CardTitle className="min-w-0 truncate text-base">{b.name}</CardTitle>
                            </div>
                            {project ? (
                              <Badge variant="secondary" className="mt-1.5 gap-1.5 text-[10px] font-normal">
                                <span className="size-2 rounded-full" style={{ background: project.color }} aria-hidden="true" />
                                {project.name}
                              </Badge>
                            ) : (
                              <p className="mt-1 text-xs text-muted-foreground">Standalone board</p>
                            )}
                          </div>
                          {canManage ? (
                            <div className="relative z-10">
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100" aria-label={`Menu for ${b.name}`}>
                                      <MoreHorizontal className="size-4" />
                                    </Button>
                                  }
                                />
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem onClick={() => setRenaming({ kind: "board", id: b.id, name: b.name })}>
                                    <PenLine className="size-4" />
                                    Rename
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem variant="destructive" onClick={() => setDeleting({ kind: "board", id: b.id, name: b.name })}>
                                    <Trash2 className="size-4" />
                                    Delete board
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ) : null}
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between px-4 pb-4">
                        <span className="text-xs text-muted-foreground">Kanban board</span>
                        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </CardContent>
                    </Card>
                  )
                })}

                {canManage ? (
                  <button
                    onClick={() => setCreateBoardOpen(true)}
                    className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/30 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/50 hover:text-foreground"
                  >
                    <Plus className="size-5" aria-hidden="true" />
                    New board
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}

      <MembersDialog
        workspace={workspace}
        open={membersOpen && !!workspace}
        onOpenChange={setMembersOpen}
        onChanged={setWorkspace}
      />

      {/* Create project */}
      <PromptDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        title="New project"
        description="A project groups related boards together — e.g. “Q3 Release”."
        label="Project name"
        placeholder="e.g. Q3 Release"
        submitLabel="Create"
        onSubmit={createProject}
      />

      {/* Create board */}
      <CreateBoardDialog
        open={createBoardOpen}
        onOpenChange={setCreateBoardOpen}
        projects={projects ?? []}
        onSubmit={createBoard}
      />

      {/* Rename */}
      <PromptDialog
        open={renaming !== null}
        onOpenChange={(o) => { if (!o) setRenaming(null) }}
        title={renaming?.kind === "workspace" ? "Rename workspace" : renaming?.kind === "project" ? "Rename project" : "Rename board"}
        label={renaming?.kind === "board" ? "Board name" : "Name"}
        defaultValue={renaming?.name ?? ""}
        submitLabel="Save"
        onSubmit={rename}
      />

      {/* Recolor project */}
      <Dialog open={recoloring !== null} onOpenChange={(o) => { if (!o) setRecoloring(null) }}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Project color</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center gap-3 pb-1">
            {PROJECT_COLORS.map((c) => (
              <button
                key={c}
                aria-label={`Use ${colorName[c] ?? c}`}
                className={`size-8 rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 ${recoloring?.color === c ? "ring-2 ring-foreground" : ""}`}
                style={{ background: c }}
                onClick={() => recolor(c)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title={deleting?.kind === "workspace" ? "Delete this workspace?" : deleting?.kind === "project" ? "Delete this project?" : "Delete this board?"}
        description={
          deleting?.kind === "workspace"
            ? `"${deleting?.name ?? ""}" and all of its boards and projects will be removed for everyone.`
            : deleting?.kind === "project"
              ? `"${deleting?.name ?? ""}" will be removed. Its boards stay in the workspace.`
              : `"${deleting?.name ?? ""}" and every card on it will be permanently removed.`
        }
        confirmLabel={deleteLabel}
        onConfirm={remove}
      />
    </AppShell>
  )
}

function CreateBoardDialog({
  open,
  onOpenChange,
  projects,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projects: Project[]
  onSubmit: (name: string, projectId?: string | null) => Promise<void>
}) {
  const [name, setName] = React.useState("")
  const [projectId, setProjectId] = React.useState<string>("none")
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (open) {
      setName("")
      setProjectId("none")
      setBusy(false)
    }
  }, [open])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const next = name.trim()
    if (!next || busy) return
    setBusy(true)
    try {
      await onSubmit(next, projectId === "none" ? null : projectId)
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New board</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="board-name" className="text-sm font-medium">Board name</label>
            <input
              id="board-name"
              value={name}
              maxLength={100}
              autoFocus
              placeholder="e.g. Launch Sprint"
              onChange={(e) => setName(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          {projects.length > 0 ? (
            <div className="space-y-2">
              <label htmlFor="board-project" className="text-sm font-medium">Project</label>
              <Select value={projectId} onValueChange={(v) => { if (v !== null) setProjectId(v) }}>
                <SelectTrigger id="board-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className="flex items-center gap-2">
                        <span className="size-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={!name.trim() || busy}>Create board</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}