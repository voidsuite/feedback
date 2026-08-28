/**
 * Settings menu — a floating dropdown (not a sidebar) opened from the header
 * gear. Includes the profile card (VoidAuth avatar), appearance, preferences,
 * cloud sync + export-all, local vault and sign-out.
 */

import * as React from "react"
import {
  AlertTriangle,
  Archive,
  Check,
  Cloud,
  CloudOff,
  Download,
  HardDrive,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Wifi,
  WifiOff,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/contexts/auth"
import { useDocs } from "@/contexts/docs"
import { useSettings } from "@/contexts/settings"
import { useTheme } from "@/components/theme-provider"
import { useToast } from "@/contexts/toast"
import { lockVault, useVault } from "@/contexts/vault"
import { getStorageUsage } from "@/lib/api"
import { exportAll } from "@/lib/export-all"
import { cn } from "@/lib/utils"
import type { Accent, Theme } from "@/lib/types"
import { Settings as SettingsIcon } from "lucide-react"

const THEMES: { id: Theme; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
]

const ACCENT_LABELS: Record<Accent, string> = {
  stone: "Stone",
  violet: "Violet",
  emerald: "Emerald",
  amber: "Amber",
  sky: "Sky",
  rose: "Rose",
}

const ACCENT_SWATCHES: Record<Accent, string> = {
  stone: "#78716c",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#d97706",
  sky: "#0ea5e9",
  rose: "#f43f5e",
}

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "—"
  const mb = n / (1024 * 1024)
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`
  return `${mb.toFixed(1)} MB`
}

export function SettingsMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user, mode, signIn, signOut } = useAuth()
  const { settings, updateSettings } = useSettings()
  const { theme, setTheme, accent, setAccent } = useTheme()
  const { cloud, syncNow } = useDocs()
  const vault = useVault()
  const { toast } = useToast()

  const [busy, setBusy] = React.useState<null | "sync" | "md" | "json">(null)
  const [storage, setStorage] = React.useState<{ used: number; quota: number; files: number } | null>(null)

  // Load storage usage while the menu is open and the user is signed in.
  React.useEffect(() => {
    if (!open || !user) {
      setStorage(null)
      return
    }
    let cancelled = false
    getStorageUsage()
      .then((u) => !cancelled && setStorage(u))
      .catch(() => !cancelled && setStorage(null))
    return () => {
      cancelled = true
    }
  }, [open, user])

  const doSync = async () => {
    setBusy("sync")
    await syncNow()
    setBusy(null)
    if (cloud.state === "synced") {
      toast({ title: "Synced", description: "All documents are backed up.", variant: "success" })
    } else if (cloud.state === "error") {
      toast({ title: "Sync failed", description: cloud.message, variant: "destructive" })
    }
  }

  const doExport = async (format: "md" | "json") => {
    if (!vault.key) return
    setBusy(format)
    try {
      await exportAll(vault.key, format)
      if (format === "md") {
        toast({ title: "Exported", description: "All documents saved as a Markdown bundle.", variant: "success" })
      } else {
        toast({ title: "Backup saved", description: "All documents saved as JSON.", variant: "success" })
      }
    } catch {
      toast({ title: "Export failed", variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const doLockVault = () => {
    lockVault()
    toast({ title: "Vault locked", description: "Cached key removed.", variant: "success" })
  }

  const initials = user?.name ? user.name.slice(0, 1).toUpperCase() : "?"

  const syncStateLabel: Record<string, string> = {
    idle: "Idle",
    syncing: "Syncing…",
    synced: "Up to date",
    error: "Failed",
  }

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="h-9 w-9 px-0" aria-label="Settings" />}
      >
        <SettingsIcon className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[340px] max-h-[min(600px,calc(100dvh-4rem))] overflow-y-auto p-0"
      >
        {/* --- Profile / account --- */}
        {user ? (
          <div className="space-y-3 border-b border-border p-4">
            <div className="flex items-center gap-3">
              <Avatar size="lg" className="size-11">
                {user.picture ? <AvatarImage src={user.picture} alt={user.name} /> : null}
                <AvatarFallback className="text-sm">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email || "signed in via VoidAuth"}</p>
              </div>
              <Badge variant="outline" className="gap-1 text-[10px] font-normal text-muted-foreground">
                <Cloud className="size-3 text-emerald-500" /> Cloud
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <HardDrive className="size-3.5" /> Storage
              </span>
              <span className="tabular-nums">
                {storage ? `${formatBytes(storage.used)} of ${formatBytes(storage.quota)}` : "Checking…"}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <ShieldCheck className="size-3.5" /> Vault key
              </span>
              <span className="tabular-nums">
                {vault.source === "escrow"
                  ? "Escrowed"
                  : vault.source === "cached"
                    ? "Cached on device"
                    : vault.source === "device"
                      ? "Device key"
                      : "—"}
              </span>
            </div>
            {vault.source === "device" && (
              <div className="px-1">
                <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-500">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  Device key — the escrow hasn't resolved, so cloud sync can't read your backup from other devices. Sign
                  out and back in to re-link your vault.
                </p>
                {vault.escrowError && (
                  <p className="mt-1.5 break-words rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    {vault.escrowError}
                  </p>
                )}
                <div className="mt-1.5 flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 gap-1 text-[11px]"
                    onClick={() => void vault.reload()}
                    disabled={!vault.ready}
                  >
                    {!vault.ready ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3" />
                    )}
                    Retry escrow
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border-b border-border p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <CloudOff className="size-4 text-muted-foreground" /> Local mode
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Documents are stored on this device only. Sign in to back them up to your VoidAuth storage — your local
              docs are synced automatically.
            </p>
            {mode !== "offline" && (
              <Button size="sm" className="mt-3 w-full gap-1.5" onClick={() => void signIn()}>
                <Wifi className="size-3.5" /> Sign in with VoidAuth
              </Button>
            )}
          </div>
        )}

        {/* --- Appearance --- */}
        <div className="space-y-3 p-4">
          <div className="space-y-2">
            <Label className="text-[11px] font-medium text-muted-foreground">Theme</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {THEMES.map((t) => (
                <Button
                  key={t.id}
                  variant={theme === t.id ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setTheme(t.id)}
                >
                  {theme === t.id && <Check className="size-3 me-1" />}
                  {t.label}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-[11px] font-medium text-muted-foreground">Accent</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {Object.keys(ACCENT_LABELS).map((a) => {
                const id = a as Accent
                return (
                  <Tooltip key={id}>
                    <TooltipTrigger
                      render={
                        <button
                          type="button"
                          aria-label={ACCENT_LABELS[id]}
                          className={cn(
                            "flex h-8 items-center justify-center rounded-md border transition-colors",
                            accent === id ? "border-primary ring-1 ring-primary" : "border-border hover:border-muted-foreground/40"
                          )}
                          onClick={() => setAccent(id)}
                        />
                      }
                    >
                      <span className="size-3.5 rounded-full" style={{ background: ACCENT_SWATCHES[id] }} />
                    </TooltipTrigger>
                    <TooltipContent>{ACCENT_LABELS[id]}</TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* --- Preferences --- */}
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs">Show outline by default</Label>
              <p className="text-[11px] text-muted-foreground">Open the document outline sidebar in new sessions.</p>
            </div>
            <Switch checked={settings.showOutline} onCheckedChange={(on) => updateSettings({ showOutline: on })} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs">Suggestion mode by default</Label>
              <p className="text-[11px] text-muted-foreground">Start documents in tracked-changes mode.</p>
            </div>
            <Switch
              checked={settings.suggestionMode}
              onCheckedChange={(on) => updateSettings({ suggestionMode: on })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <Label className="text-xs">Encrypted cloud sync</Label>
              <p className="text-[11px] text-muted-foreground">
                {user ? "Mirror docs end-to-end via VoidAuth." : "Sign in to enable."}
              </p>
            </div>
            <Switch
              checked={settings.syncEnabled}
              onCheckedChange={(on) => updateSettings({ syncEnabled: on })}
              disabled={!user}
            />
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* --- Sync + export --- */}
        <div className="space-y-2.5 p-4">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {cloud.state === "syncing" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : cloud.state === "synced" ? (
                <Cloud className="size-3.5 text-emerald-500" />
              ) : cloud.state === "error" ? (
                <WifiOff className="size-3.5 text-destructive" />
              ) : (
                <CloudOff className="size-3.5" />
              )}
              {settings.lastSync ? `Last sync ${new Date(settings.lastSync).toLocaleString()}` : syncStateLabel[cloud.state]}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => void doSync()}
              disabled={busy !== null || !user}
            >
              <RefreshCw className={cn("size-3.5", busy === "sync" && "animate-spin")} />
              Sync now
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void doExport("md")}
              disabled={busy !== null || !vault.key}
            >
              {busy === "md" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Export all (.md)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void doExport("json")}
              disabled={busy !== null || !vault.key}
            >
              {busy === "json" ? <Loader2 className="size-3.5 animate-spin" /> : <Archive className="size-3.5" />}
              Backup (.json)
            </Button>
          </div>
        </div>

        <DropdownMenuSeparator />

        {/* --- Vault + account --- */}
        <div className="p-2">
          <DropdownMenuItem onClick={doLockVault}>
            <Lock className="size-3.5" /> Lock local vault
          </DropdownMenuItem>
          {user && (
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                void signOut()
                toast({ title: "Signed out", description: "Cloud sync paused.", variant: "success" })
              }}
            >
              <LogOut className="size-3.5" /> Sign out
            </DropdownMenuItem>
          )}
        </div>

        <p className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground/70">
          Void Docs v0.1.0 · docs by VoidSuite
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}