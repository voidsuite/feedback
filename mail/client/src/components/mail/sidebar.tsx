import { useState } from "react"
import {
  Cloud,
  CloudOff,
  Inbox,
  Layers,
  Loader2,
  LogIn,
  LogOut,
  PenLine,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Star,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { MailLogo } from "@/components/MailLogo"
import { useAuth } from "@/contexts/auth"
import { useMail } from "@/contexts/mail"
import { useSync } from "@/contexts/sync"
import { useToast } from "@/contexts/toast"
import { cn } from "@/lib/utils"
import type { FolderId, MailAccount } from "@/lib/types"

const FOLDERS: { id: FolderId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "flagged", label: "Flagged", icon: Star },
  { id: "drafts", label: "Drafts", icon: PenLine },
  { id: "sent", label: "Sent", icon: Send },
  { id: "all", label: "All mail", icon: Layers },
]

interface SidebarProps {
  onCompose: () => void
  onOpenAccountForm: (editing?: MailAccount) => void
  onOpenSettings: () => void
  onRequestSync: () => void
}

export function Sidebar({ onCompose, onOpenAccountForm, onOpenSettings, onRequestSync }: SidebarProps) {
  const { user, signIn, signOut } = useAuth()
  const { accounts, activeAccountId, activeFolder, folderCounts, selectAccount, selectFolder, syncing } = useMail()
  const { busy, ready, needsPassphrase, runNow } = useSync()
  const { toast } = useToast()
  const [syncDone, setSyncDone] = useState(false)

  async function handleSyncNow() {
    if (needsPassphrase || !ready) {
      onRequestSync()
      return
    }
    setSyncDone(false)
    try {
      const outcome = await runNow()
      setSyncDone(true)
      toast({
        title: "Synced",
        description: `Restored ${outcome.restored} messages, uploaded ${outcome.pushed}.`,
        variant: "success",
      })
      setTimeout(() => setSyncDone(false), 3000)
    } catch (err) {
      toast({ title: "Sync failed", description: (err as Error).message.slice(0, 140), variant: "destructive" })
    }
  }

  const canCloudSync = !!user
  const syncLoading = busy || syncing

  return (
    <aside className="flex w-16 flex-col border-r border-border bg-background md:w-56">
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-3">
        <MailLogo size="sm" tagline className="truncate" />
      </div>

      {/* Compose */}
      <div className="p-3">
        <Button className="w-full justify-center gap-2 md:justify-start" onClick={onCompose}>
          <PenLine className="size-4" />
          <span className="hidden md:inline">Compose</span>
        </Button>
      </div>

      {/* Accounts */}
      <div className="px-2">
        <div className="mb-1.5 flex items-center justify-between px-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Accounts</span>
          {accounts.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<button className="flex items-center gap-2 rounded-md px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" />}
              >
                <Plus className="size-3.5" />
                <span className="sr-only">Add account</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel>Mail accounts</DropdownMenuLabel>
                {accounts.map((a) => (
                  <DropdownMenuItem key={a.id} onClick={() => selectAccount(a.id)}>
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: a.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{a.email}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onOpenAccountForm()}>
                  <Plus className="size-4" />
                  Add account…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {accounts.length === 0 ? (
          <p className="px-1.5 pb-2 text-[11px] leading-relaxed text-muted-foreground">
            No accounts yet.
          </p>
        ) : (
          <div className="space-y-0.5">
            {accounts.map((a) => (
              <button
                key={a.id}
                onClick={() => selectAccount(a.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition-colors",
                  activeAccountId === a.id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60"
                )}
              >
                <Avatar className="size-6">
                  <AvatarFallback style={{ backgroundColor: `${a.color}22`, color: a.color }} className="text-[10px] font-semibold">
                    {(a.label || a.email).slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden min-w-0 flex-1 truncate md:inline">{a.label || a.email}</span>
              </button>
            ))}
            <button
              onClick={() => onOpenAccountForm()}
              className="mt-0.5 flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60 md:pl-3"
            >
              <Plus className="size-4" />
              <span className="hidden md:inline">Add account</span>
            </button>
          </div>
        )}
      </div>

      {/* Folders */}
      <nav className="mt-3 flex-1 overflow-y-auto px-2 pb-2">
        <div className="mb-1.5 px-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Mailbox</span>
        </div>
        <div className="space-y-0.5">
          {FOLDERS.map(({ id, label, icon: Icon }) => {
            const count = folderCounts[id]
            return (
              <button
                key={id}
                onClick={() => selectFolder(id)}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm transition-colors",
                  activeFolder === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/60"
                )}
              >
                <Icon className="size-4 flex-shrink-0" />
                <span className="hidden min-w-0 flex-1 truncate md:inline">{label}</span>
                {count > 0 ? (
                  <span className="hidden rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums md:inline">
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Sync + settings */}
      <div className="border-t border-border p-2">
        {canCloudSync ? (
          <div className="mb-1 hidden items-center justify-between gap-1 rounded-lg bg-muted/50 px-2 py-1.5 md:flex">
            <button
              onClick={handleSyncNow}
              disabled={syncLoading}
              className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {syncLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : ready ? (
                <RefreshCw className="size-3.5" />
              ) : needsPassphrase ? (
                <CloudOff className="size-3.5" />
              ) : (
                <Cloud className="size-3.5" />
              )}
              <span className="truncate">
                {syncLoading ? "Syncing…" : ready ? "Sync now" : needsPassphrase ? "Enter passphrase" : "Enable sync"}
              </span>
            </button>
            {syncDone ? <span className="text-[10px] text-emerald-500">✓</span> : null}
          </div>
        ) : null}

        {!canCloudSync ? (
          <Button variant="outline" size="sm" className="mb-1 w-full gap-1.5" onClick={() => signIn()}>
            <LogIn className="size-3.5" />
            <span className="hidden md:inline">Sign in to sync</span>
          </Button>
        ) : null}

        <button
          onClick={onOpenSettings}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/60"
        >
          <Settings className="size-4" />
          <span className="hidden md:inline">Settings</span>
        </button>

        {/* User footer */}
        <div className="mt-1 flex items-center gap-2 rounded-lg px-1.5 py-1.5">
          <Avatar className="size-7">
            <AvatarFallback className="bg-primary/10 text-[10px] text-primary">
              {(user?.name || user?.email || "L").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="truncate text-xs font-medium text-foreground">{user ? user.name || user.email : "Local only"}</p>
            <p className="truncate text-[10px] text-muted-foreground">
              {user ? ready ? "Encrypted sync on" : needsPassphrase ? "Passphrase needed" : "Sync off" : "No cloud sync"}
            </p>
          </div>
          {user ? (
            <button
              onClick={() => signOut()}
              className="ml-auto hidden rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:block"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  )
}