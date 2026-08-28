import { useEffect, useState } from "react"
import { AlertTriangle, Cloud, CloudOff, Database, KeyRound, Loader2, Lock, RefreshCw, Trash2 } from "lucide-react"
import { ACCENTS, useTheme } from "@/components/theme-provider"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import { useAuth } from "@/contexts/auth"
import { useSettings } from "@/contexts/settings"
import { useSync } from "@/contexts/sync"
import { useToast } from "@/contexts/toast"
import * as db from "@/lib/db"
import { clearDeviceKey } from "@/lib/crypto"
import { hasPassphraseSet } from "@/lib/passphrase"
import { hasPin, setPin, verifyPin, clearPin } from "@/lib/pin-state"
import { cn } from "@/lib/utils"

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatWhen(ts: number | undefined): string {
  if (!ts) return "never"
  return new Date(ts).toLocaleString()
}

interface SettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onRequestSync: () => void
}

export function SettingsSheet({ open, onOpenChange, onRequestSync }: SettingsSheetProps) {
  const { settings, updateSettings } = useSettings()
  const { theme, setTheme, setAccent } = useTheme()
  const { user } = useAuth()
  const { busy, usage, ready, needsPassphrase, runNow, disableSync, clearCloudData, refreshUsage } = useSync()
  const { toast } = useToast()

  // PIN management state
  const [pinDialog, setPinDialog] = useState<null | "set" | "remove">(null)
  const [pinValue, setPinValue] = useState("")
  const [pinConfirm, setPinConfirm] = useState("")
  const [resetConfirm, setResetConfirm] = useState(false)
  const [clearCloudConfirm, setClearCloudConfirm] = useState(false)

  useEffect(() => {
    if (open && user) refreshUsage()
  }, [open, user, refreshUsage])

  async function submitPin() {
    if (pinDialog === "set") {
      if (pinValue.length < 4) {
        toast({ title: "PIN too short", description: "Use at least 4 digits.", variant: "destructive" })
        return
      }
      if (pinValue !== pinConfirm) {
        toast({ title: "PINs don't match", variant: "destructive" })
        return
      }
      await setPin(pinValue)
      toast({ title: "PIN enabled", description: "m3il locks when the app reloads.", variant: "success" })
      setPinDialog(null)
      setPinValue("")
      setPinConfirm("")
      return
    }
    if (pinDialog === "remove") {
      const ok = await verifyPin(pinValue)
      if (!ok) {
        toast({ title: "Incorrect PIN", variant: "destructive" })
        return
      }
      await clearPin(pinValue)
      toast({ title: "PIN removed" })
      setPinDialog(null)
      setPinValue("")
    }
  }

  async function handleSyncToggle(checked: boolean) {
    if (checked) {
      onRequestSync()
      return
    }
    disableSync()
    toast({ title: "Cloud sync disabled" })
  }

  async function handleSyncNow() {
    if (needsPassphrase || !ready) {
      onRequestSync()
      return
    }
    try {
      const outcome = await runNow()
      toast({
        title: "Synced",
        description: `${outcome.restored} messages restored, ${outcome.pushed} pushed.`,
        variant: "success",
      })
    } catch (err) {
      toast({ title: "Sync failed", description: (err as Error).message.slice(0, 140), variant: "destructive" })
    }
  }

  async function handleResetLocal() {
    await db.clearAll()
    clearDeviceKey()
    localStorage.removeItem("m3il_theme")
    localStorage.removeItem("m3il_accent")
    window.location.reload()
  }

  const usagePct = usage && usage.quota > 0 ? Math.min(100, Math.round((usage.used / usage.quota) * 100)) : 0

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle>Settings</SheetTitle>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 p-4">
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Support</h2>
              <a
                href={`${import.meta.env.VITE_FEEDBACK_URL || "https://feedback.stwupid.tech"}?source=mail`}
                className="text-sm underline"
              >
                Send feedback or report an issue
              </a>
            </section>
            {/* Appearance */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Appearance</h2>
              <div className="space-y-1.5">
                <Label>Theme</Label>
                <Select
                  value={theme}
                  onValueChange={(v) => {
                    setTheme(v as typeof theme)
                    updateSettings({ theme: v as typeof theme })
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Accent</Label>
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      data-accent-preview={a.id}
                      onClick={() => {
                        setAccent(a.id)
                        updateSettings({ accent: a.id })
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors",
                        settings.accent === a.id
                          ? "border-primary bg-accent text-accent-foreground"
                          : "border-border text-muted-foreground hover:bg-accent/60"
                      )}
                    >
                      <span className="size-2 rounded-full bg-[var(--primary)]" aria-hidden="true" />
                      {a.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <Separator />

            {/* Security */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Security</h2>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">App lock PIN</p>
                    <p className="text-xs text-muted-foreground">Locks m3il after a reload</p>
                  </div>
                </div>
                {hasPin() ? (
                  <div className="flex gap-1.5">
                    <Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new CustomEvent("m3il:lock-app"))}>
                      <Lock className="mr-1 size-3.5" />
                      Lock now
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setPinDialog("remove")}>
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setPinDialog("set")}>
                    Set PIN
                  </Button>
                )}
              </div>

              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <div className="flex items-center gap-2.5">
                  <Cloud className="size-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">Sync passphrase</p>
                    <p className="text-xs text-muted-foreground">
                      {ready ? "Active this session" : hasPassphraseSet() ? "Set, needs re-entry" : "Not set"}
                    </p>
                  </div>
                </div>
                {hasPassphraseSet() ? (
                  <Button variant="outline" size="sm" onClick={() => disableSync()}>
                    Turn off
                  </Button>
                ) : null}
              </div>
            </section>

            <Separator />

            {/* Sync */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Cloud sync</h2>

              {!user ? (
                <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
                  Sign in with VoidAuth to back up your encrypted mailbox.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">Encrypted backup</p>
                      <p className="text-xs text-muted-foreground">
                        {ready ? `Last sync ${formatWhen(settings.lastSync)}` : needsPassphrase ? "Passphrase needed" : "Off"}
                      </p>
                    </div>
                    <Switch checked={settings.syncEnabled} onCheckedChange={handleSyncToggle} aria-label="Toggle cloud sync" />
                  </div>

                  {usage ? (
                    <div className="space-y-1.5 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Storage</span>
                        <span className="tabular-nums">
                          {formatBytes(usage.used)} / {formatBytes(usage.quota)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${usagePct}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{usage.files} stored files</p>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSyncNow} disabled={busy}>
                      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                      Sync now
                    </Button>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={() => setClearCloudConfirm(true)}>
                      <CloudOff className="size-3.5" />
                      Erase cloud backup
                    </Button>
                  </div>
                </>
              )}
            </section>

            <Separator />

            {/* Data */}
            <section className="space-y-3">
              <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Data</h2>
              <Button variant="outline" size="sm" className="w-full justify-start gap-1.5 text-destructive" onClick={() => setResetConfirm(true)}>
                <Database className="size-3.5" />
                Reset local data
              </Button>
              <p className="text-[10px] text-muted-foreground">
                Clears accounts, messages and attachments stored on this device. A cloud backup, if any, is kept.
              </p>
            </section>
          </div>
        </ScrollArea>

        {/* PIN dialogs */}
        <Dialog open={pinDialog !== null} onOpenChange={(o) => !o && setPinDialog(null)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>{pinDialog === "set" ? "Set an app lock PIN" : "Remove app lock PIN"}</DialogTitle>
              <DialogDescription>
                {pinDialog === "set" ? "You'll be asked for this PIN after a reload." : "Enter your current PIN to remove the lock."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="PIN"
                value={pinValue}
                onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="text-center text-lg tracking-[0.5em]"
              />
              {pinDialog === "set" ? (
                <Input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="Confirm PIN"
                  value={pinConfirm}
                  onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  className="text-center text-lg tracking-[0.5em]"
                />
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPinDialog(null)}>
                Cancel
              </Button>
              <Button onClick={submitPin} disabled={pinValue.length < 4}>
                {pinDialog === "set" ? "Enable" : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reset local data */}
        <AlertDialog open={resetConfirm} onOpenChange={setResetConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset all local data?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently deletes accounts, messages and attachments from this device. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetLocal} className="gap-1.5">
                <AlertTriangle className="size-4" />
                Reset everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Erase cloud backup */}
        <AlertDialog open={clearCloudConfirm} onOpenChange={setClearCloudConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Erase the cloud backup?</AlertDialogTitle>
              <AlertDialogDescription>
                Deletes the encrypted snapshot and all uploaded attachments from VoidAuth storage. Your local copy stays intact.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="gap-1.5"
                onClick={async () => {
                  try {
                    await clearCloudData()
                    toast({ title: "Cloud backup erased" })
                  } catch (err) {
                    toast({ title: "Couldn't erase backup", description: (err as Error).message, variant: "destructive" })
                  }
                }}
              >
                <Trash2 className="size-4" />
                Erase
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}