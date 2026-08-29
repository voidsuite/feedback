/**
 * HomePage — your workspaces. Cards link into each workspace; owner/admin
 * can rename or delete from the card menu.
 */

import * as React from "react"
import { Link, useNavigate } from "react-router"
import { ChevronRight, FolderKanban, MoreHorizontal, PenLine, Plus, Trash2 } from "lucide-react"
import { AppShell } from "@/components/app-shell"
import { initials } from "@/components/workspace-icon"
import { AvatarPicker } from "@/components/avatar-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { PromptDialog } from "@/components/prompt-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { useToast } from "@/contexts/toast"
import { useAuth } from "@/contexts/auth"
import * as api from "@/lib/api"
import type { Workspace } from "@/lib/types"

export function HomePage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [workspaces, setWorkspaces] = React.useState<Workspace[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [renaming, setRenaming] = React.useState<Workspace | null>(null)
  const [deleting, setDeleting] = React.useState<Workspace | null>(null)

  const load = React.useCallback(() => {
    setError(null)
    setWorkspaces(null)
    api
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load workspaces"))
  }, [])

  React.useEffect(load, [load])

  const createWorkspace = async (name: string) => {
    try {
      const ws = await api.createWorkspace(name)
      toast({ title: "Workspace created", description: name, variant: "success" })
      navigate(`/w/${ws.id}`)
    } catch (e) {
      toast({ title: "Couldn't create workspace", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const renameWorkspace = async (name: string) => {
    if (!renaming) return
    try {
      await api.renameWorkspace(renaming.id, name)
      setWorkspaces((prev) => prev?.map((w) => (w.id === renaming.id ? { ...w, name } : w)) ?? null)
      toast({ title: "Workspace renamed", variant: "success" })
    } catch (e) {
      toast({ title: "Couldn't rename workspace", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const deleteWorkspace = async () => {
    if (!deleting) return
    try {
      await api.deleteWorkspace(deleting.id)
      setWorkspaces((prev) => prev?.filter((w) => w.id !== deleting.id) ?? null)
      toast({ title: "Workspace deleted", description: deleting.name })
    } catch (e) {
      toast({ title: "Couldn't delete workspace", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const canManage = (ws: Workspace) => user?.id === ws.ownerId || ws.members.some((m) => m.userId === user?.id && m.role === "admin")

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="text-sm text-muted-foreground">Your boards live inside workspaces — share one and collaborate in real time.</p>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card/50 p-10 text-center">
            <FolderKanban className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>Try again</Button>
          </div>
        ) : !workspaces ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[118px] rounded-xl" />
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-border bg-card/30 p-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
              <FolderKanban className="size-6 text-primary" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">No workspaces yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Create a workspace to hold your projects and boards — then share it with teammates via a link.
              </p>
            </div>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              New workspace
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
              <Card key={ws.id} className="group relative transition-shadow hover:shadow-md">
                <Link to={`/w/${ws.id}`} className="absolute inset-0 z-0 rounded-xl" aria-label={`Open ${ws.name}`} />
                <CardHeader className="flex-row items-start gap-3 space-y-0 p-4">
                  <AvatarPicker fileId={ws.avatarFileId} name={ws.name} seed={ws.id} size="md" className="mt-0.5" />
                  <div className="min-w-0 flex-1 pr-6">
                    <CardTitle className="truncate text-base">{ws.name}</CardTitle>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ws.members.length} {ws.members.length === 1 ? "member" : "members"}
                      {ws.ownerId === user?.id ? " · you own this" : ""}
                    </p>
                  </div>
                </CardHeader>
                <CardContent className="flex items-center gap-3 px-4 pb-4">
                  <AvatarGroup className="min-w-0 flex-1">
                    {ws.members.slice(0, 4).map((m) => (
                      <Avatar key={m.userId} size="sm">
                        <AvatarImage src={m.picture || undefined} alt={m.name} />
                        <AvatarFallback className="text-[8px]">{initials(m.name)}</AvatarFallback>
                      </Avatar>
                    ))}
                    {ws.members.length > 4 ? <AvatarGroupCount>{`+${ws.members.length - 4}`}</AvatarGroupCount> : null}
                  </AvatarGroup>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </CardContent>

                {canManage(ws) ? (
                  <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label={`Menu for ${ws.name}`}>
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => setRenaming(ws)}>
                          <PenLine className="size-4" />
                          Rename
                        </DropdownMenuItem>
                        {user?.id === ws.ownerId ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(ws)}>
                              <Trash2 className="size-4" />
                              Delete workspace
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                ) : null}
              </Card>
            ))}

            <button
              onClick={() => setCreateOpen(true)}
              className="flex h-[118px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card/30 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/50 hover:text-foreground"
            >
              <Plus className="size-5" aria-hidden="true" />
              New workspace
            </button>
          </div>
        )}
      </div>

      <PromptDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New workspace"
        description="A workspace groups projects and boards together, and controls who can see them."
        label="Workspace name"
        placeholder="e.g. Product Team"
        submitLabel="Create"
        onSubmit={createWorkspace}
      />

      <PromptDialog
        open={renaming !== null}
        onOpenChange={(o) => { if (!o) setRenaming(null) }}
        title="Rename workspace"
        label="Workspace name"
        defaultValue={renaming?.name ?? ""}
        submitLabel="Save"
        onSubmit={renameWorkspace}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => { if (!o) setDeleting(null) }}
        title="Delete this workspace?"
        description={`"${deleting?.name ?? ""}" and all of its boards and projects will be removed for everyone. This can't be undone.`}
        onConfirm={deleteWorkspace}
      />
    </AppShell>
  )
}