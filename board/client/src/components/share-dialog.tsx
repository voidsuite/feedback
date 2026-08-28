/**
 * ShareDialog — copy the workspace invite link for a board. Managing members
 * happens in the workspace (MembersDialog); this is the quick share surface.
 */

import * as React from "react"
import { Check, Copy, Link2 } from "lucide-react"
import { useToast } from "@/contexts/toast"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { Workspace } from "@/lib/types"

export function ShareDialog({
  workspace,
  open,
  onOpenChange,
}: {
  workspace: Workspace | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)

  const inviteUrl = workspace?.inviteEnabled && workspace?.inviteToken
    ? `${window.location.origin}/join/${workspace.inviteToken}`
    : null

  const copy = async () => {
    if (!inviteUrl) return
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
      toast({ title: "Invite link copied", variant: "success" })
    } catch {
      toast({ title: "Couldn't copy", description: "Select the link and copy it manually." })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Share this board</DialogTitle>
          <DialogDescription>
            Anyone with the workspace invite link can join and collaborate in real time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {inviteUrl ? (
            <>
              <div className="flex gap-2">
                <Input readOnly value={inviteUrl} className="h-8 text-xs" onFocus={(e) => e.target.select()} />
                <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={copy}>
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Link2 className="size-3" aria-hidden="true" />
                Members join as “member” — admins can change roles.
              </p>
            </>
          ) : (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p className="text-muted-foreground">Invites are currently turned off for this workspace.</p>
              <Badge variant="secondary" className="text-xs">Manage invites in the workspace</Badge>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}