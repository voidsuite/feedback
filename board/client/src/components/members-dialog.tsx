/**
 * MembersDialog — workspace membership + invite sharing.
 *
 *  - Anyone with admin/owner can toggle the invite link, copy it, rotate it,
 *    change member roles and remove members.
 *  - Joining happens at /join/<token> (see JoinPage).
 */

import * as React from "react"
import { Check, Copy, Link2, MoreHorizontal, RefreshCcw, Shield, Trash2, UserRound } from "lucide-react"
import { useToast } from "@/contexts/toast"
import { useAuth } from "@/contexts/auth"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { initials } from "@/components/workspace-icon"
import * as api from "@/lib/api"
import type { Workspace, WorkspaceMember } from "@/lib/types"

const ROLE_LABELS: Record<WorkspaceMember["role"], string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
}

function MemberRow({
  member,
  canManage,
  isSelf,
  onChangeRole,
  onRemove,
}: {
  member: WorkspaceMember
  canManage: boolean
  isSelf: boolean
  onChangeRole: (role: "admin" | "member") => void
  onRemove: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/50">
      <Avatar size="sm">
        <AvatarImage src={member.picture || undefined} alt={member.name} />
        <AvatarFallback className="text-[9px]">{initials(member.name)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {member.name}
          {isSelf ? <span className="text-xs font-normal text-muted-foreground"> (you)</span> : null}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
      </div>

      {member.role === "owner" ? (
        <Badge variant="secondary" className="gap-1 text-xs">
          <Shield className="size-3" />
          Owner
        </Badge>
      ) : canManage ? (
        <Select
          value={member.role}
          onValueChange={(v) => onChangeRole(v as "admin" | "member")}
          disabled={isSelf}
        >
          <SelectTrigger size="sm" className="w-24 h-7 text-xs" aria-label={`Role of ${member.name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="member">Member</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Badge variant="secondary" className="text-xs">{ROLE_LABELS[member.role]}</Badge>
      )}

      {canManage && member.role !== "owner" && !isSelf ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Menu for ${member.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem variant="destructive" onClick={() => onRemove()}>
              <Trash2 className="size-4" />
              Remove member
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              <UserRound className="size-4" />
              Members can read & edit boards
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  )
}

export function MembersDialog({
  workspace,
  open,
  onOpenChange,
  onChanged,
}: {
  workspace: Workspace | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: (ws: Workspace) => void
}) {
  const { user } = useAuth()
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)
  const [removing, setRemoving] = React.useState<WorkspaceMember | null>(null)

  // The dialog mounts even while the workspace is still loading — do nothing
  // until there's real data (avoids reading .members of null).
  if (!workspace) return null

  const myRole = workspace.members.find((m) => m.userId === user?.id)?.role ?? "member"
  const canManage = myRole === "owner" || myRole === "admin"
  const inviteBase = `${window.location.origin}`
  const inviteUrl = workspace.inviteEnabled && workspace.inviteToken ? `${inviteBase}/join/${workspace.inviteToken}` : null

  const copyInvite = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
      toast({ title: "Invite link copied", description: "Anyone with this link can join.", variant: "success" })
    } catch {
      toast({ title: "Couldn't copy", description: "Select the link and copy it manually." })
    }
  }

  const toggleInvite = async (enabled: boolean) => {
    try {
      const ws = await api.rotateInviteToken(workspace.id, enabled)
      onChanged(ws)
    } catch (e) {
      toast({ title: "Couldn't update invite", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const rotateInvite = async () => {
    try {
      const ws = await api.rotateInviteToken(workspace.id, true)
      onChanged(ws)
      toast({ title: "Invite link rotated", description: "The old link no longer works.", variant: "success" })
    } catch (e) {
      toast({ title: "Couldn't rotate invite", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const changeRole = async (member: WorkspaceMember, role: "admin" | "member") => {
    try {
      await api.updateMemberRole(workspace.id, member.userId, role)
      onChanged({
        ...workspace,
        members: workspace.members.map((m) => (m.userId === member.userId ? { ...m, role } : m)),
      })
    } catch (e) {
      toast({ title: "Couldn't change role", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const removeMember = async () => {
    if (!removing) return
    try {
      await api.removeMember(workspace.id, removing.userId)
      onChanged({ ...workspace, members: workspace.members.filter((m) => m.userId !== removing.userId) })
      toast({ title: "Member removed", description: removing.name })
    } catch (e) {
      toast({ title: "Couldn't remove member", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Members & invite</DialogTitle>
            <DialogDescription>
              {workspace.members.length} {workspace.members.length === 1 ? "member" : "members"} in “{workspace.name}”.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {canManage ? (
              <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="invite-switch" className="flex items-center gap-2 text-xs font-medium">
                    <Link2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    Invite link
                  </Label>
                  <Switch id="invite-switch" checked={workspace.inviteEnabled} onCheckedChange={toggleInvite} />
                </div>
                {inviteUrl ? (
                  <>
                    <div className="flex gap-2">
                      <Input readOnly value={inviteUrl} className="h-8 text-xs" onFocus={(e) => e.target.select()} />
                      <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={copyInvite}>
                        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                        {copied ? "Copied" : "Copy"}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Anyone with this link can join as a member.{" "}
                      <button
                        type="button"
                        className="inline-flex items-center gap-0.5 font-medium text-foreground underline-offset-2 hover:underline"
                        onClick={rotateInvite}
                      >
                        <RefreshCcw className="size-3" aria-hidden="true" />
                        Rotate
                      </button>{" "}
                      to invalidate it.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Invites are off — members can still be added by admins.</p>
                )}
              </div>
            ) : null}

            <div className="space-y-1">
              {workspace.members.map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  canManage={canManage}
                  isSelf={m.userId === user?.id}
                  onChangeRole={(role) => changeRole(m, role)}
                  onRemove={() => setRemoving(m)}
                />
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => { if (!o) setRemoving(null) }}
        title="Remove member?"
        description={`${removing?.name ?? ""} will lose access to “${workspace.name}”. Their boards stay.`}
        confirmLabel="Remove"
        onConfirm={removeMember}
      />
    </>
  )
}