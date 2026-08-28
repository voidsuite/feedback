import { useState, useEffect, useCallback } from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowLeft02Icon,
  LockIcon,
  CloudIcon,
  Logout03Icon,
  Sun01Icon,
  Moon01Icon,
  DashboardSquare02Icon,
} from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { PassphraseDialog } from "@/components/PassphraseDialog"
import { SyncStatus } from "@/components/SyncStatus"
import { useOAuth } from "@/contexts/oauth"
import { useTheme } from "@/components/theme-provider"
import { getAppData, saveAppData, getStorageUsage } from "@/lib/api"
import { encrypt, decrypt } from "@/lib/crypto"
import { getPassphrase, setPassphrase as storePassphrase, clearPassphrase } from "@/lib/passphrase"
import { getPin } from "@/lib/pin-state"
import {
  hasPin,
  hasEncryptedAccounts,
  hasDeviceEncryptedAccounts,
  hasPlainAccounts,
  loadPlainAccounts,
  encryptAccounts,
  decryptAccounts,
  encryptAccountsDevice,
  decryptAccountsDevice,
  setPin as storePin,
  verifyPin,
  clearPin,
} from "@/lib/encrypted-storage"
import { Dialog } from "@/components/ui/dialog"

const STORAGE_KEY = "ava_accounts"

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, logout, isOffline } = useOAuth()
  const { theme, setTheme } = useTheme()
  const [passphraseSet, setPassphraseSet] = useState(false)
  const [passphraseOpen, setPassphraseOpen] = useState(false)
  const [syncState, setSyncState] = useState<"synced" | "syncing" | "error" | "idle">("idle")
  const [syncMessage, setSyncMessage] = useState("")
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number; files: number } | null>(null)
  const [pinDialogOpen, setPinDialogOpen] = useState(false)
  const [pinDialogMode, setPinDialogMode] = useState<"set" | "change" | "remove">("set")
  const [oldPinInput, setOldPinInput] = useState("")
  const [newPinInput, setNewPinInput] = useState("")
  const [confirmPinInput, setConfirmPinInput] = useState("")
  const [pinError, setPinError] = useState("")
  const [pinSet, setPinSet] = useState(hasPin())

  useEffect(() => {
    getPassphrase().then(p => setPassphraseSet(!!p))
    getStorageUsage().then(setStorageUsage).catch(() => {})
  }, [])

  const handleSetPassphrase = useCallback(async (passphrase: string) => {
    await storePassphrase(passphrase)
    setPassphraseSet(true)
  }, [])

  async function getDecryptedAccounts(): Promise<any[]> {
    const pin = getPin()
    if (pin && hasPin()) {
      const decrypted = await decryptAccounts(pin)
      return decrypted || []
    }
    if (hasDeviceEncryptedAccounts()) {
      const decrypted = await decryptAccountsDevice()
      return decrypted || []
    }
    if (hasPlainAccounts()) {
      const plain = loadPlainAccounts()
      if (plain.length > 0) await encryptAccountsDevice(plain)
      localStorage.removeItem(STORAGE_KEY)
      return plain
    }
    return []
  }

  async function saveAccounts(accts: any[]) {
    const pin = getPin()
    if (pin && hasPin()) {
      await encryptAccounts(accts, pin)
    } else {
      await encryptAccountsDevice(accts)
    }
  }

  const handleForceSync = useCallback(async () => {
    const passphrase = await getPassphrase()
    if (!passphrase) return
    setSyncState("syncing")
    setSyncMessage("")
    try {
      const accounts = await getDecryptedAccounts()
      const plaintext = JSON.stringify(accounts)
      const ciphertext = await encrypt(plaintext, passphrase)
      await saveAppData('totp_accounts', { accounts, encrypted: ciphertext })
      setSyncState("synced")
      setSyncMessage(`Synced ${accounts.length} account${accounts.length !== 1 ? 's' : ''}`)
      setLastSync(Date.now())
      getStorageUsage().then(setStorageUsage).catch(() => {})
    } catch (e: any) {
      setSyncState("error")
      setSyncMessage(e?.error_description || e?.message || "Sync failed")
    }
  }, [])

  const handleRestore = useCallback(async () => {
    const passphrase = await getPassphrase()
    if (!passphrase) return
    setSyncState("syncing")
    setSyncMessage("")
    try {
      const data = await getAppData('totp_accounts')
      if (!data?.value?.encrypted) {
        setSyncState("error")
        setSyncMessage("No synced data found")
        return
      }
      const plaintext = await decrypt(data.value.encrypted, passphrase)
      const accounts = JSON.parse(plaintext)
      await saveAccounts(accounts)
      setSyncState("synced")
      setSyncMessage(`Restored ${accounts.length} account${accounts.length !== 1 ? 's' : ''}`)
      setLastSync(Date.now())
    } catch {
      setSyncState("error")
      setSyncMessage("Restore failed. Wrong passphrase?")
    }
  }, [])

  const handleLogout = async () => {
    await clearPassphrase()
    localStorage.removeItem("ava_locked")
    await logout()
    navigate("/login", { replace: true })
  }

  const openPinSet = () => {
    setPinDialogMode("set")
    setOldPinInput("")
    setNewPinInput("")
    setConfirmPinInput("")
    setPinError("")
    setPinDialogOpen(true)
  }

  const openPinChange = () => {
    setPinDialogMode("change")
    setOldPinInput("")
    setNewPinInput("")
    setConfirmPinInput("")
    setPinError("")
    setPinDialogOpen(true)
  }

  const openPinRemove = () => {
    setPinDialogMode("remove")
    setOldPinInput("")
    setNewPinInput("")
    setConfirmPinInput("")
    setPinError("")
    setPinDialogOpen(true)
  }

  const handlePinSubmit = async () => {
    setPinError("")

    if (pinDialogMode === "set") {
      if (newPinInput.length < 4) { setPinError("Min 4 digits"); return }
      const accounts = await getDecryptedAccounts()
      const passphrase = await getPassphrase()
      await storePin(newPinInput)
      if (accounts.length > 0) await encryptAccounts(accounts, newPinInput)
      if (passphrase) await storePassphrase(passphrase)
      setPinSet(true)
      setPinDialogOpen(false)
      return
    }

    if (pinDialogMode === "change") {
      if (oldPinInput.length < 4) { setPinError("Enter current PIN"); return }
      if (newPinInput.length < 4) { setPinError("New PIN must be at least 4 digits"); return }
      if (newPinInput !== confirmPinInput) { setPinError("PINs don't match"); return }
      const valid = await verifyPin(oldPinInput)
      if (!valid) { setPinError("Wrong current PIN"); return }
      const accounts = await getDecryptedAccounts()
      const passphrase = await getPassphrase()
      await storePin(newPinInput)
      if (accounts.length > 0) await encryptAccounts(accounts, newPinInput)
      if (passphrase) await storePassphrase(passphrase)
      setPinDialogOpen(false)
      return
    }

    if (pinDialogMode === "remove") {
      if (oldPinInput.length < 4) { setPinError("Enter current PIN"); return }
      const valid = await verifyPin(oldPinInput)
      if (!valid) { setPinError("Wrong PIN"); return }
      const accounts = await getDecryptedAccounts()
      const passphrase = await getPassphrase()
      await encryptAccountsDevice(accounts)
      await clearPin(oldPinInput)
      if (passphrase) await storePassphrase(passphrase)
      setPinSet(false)
      setPinDialogOpen(false)
      return
    }
  }

  const handleExport = async () => {
    const accounts = await getDecryptedAccounts()
    const blob = new Blob([JSON.stringify({ format: "authiov", version: 1, accounts }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "authiov-backup.json"; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = ".json,.txt"
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const data = JSON.parse(text)

        let accounts: any[] = []
        if (data.db?.entries) {
          accounts = data.db.entries.map((e: any) => ({
            name: e.name || e.issuer || "Aegis Import",
            issuer: e.issuer || undefined,
            secret: typeof e.info?.secret === "string" ? e.info.secret : e.info?.secret?.toString?.() || "",
            algorithm: (e.info?.algo || "SHA1").toUpperCase() as any,
            digits: e.info?.digits || 6,
            period: e.info?.period || 30,
          }))
        } else if (Array.isArray(data) && data.every((s: any) => typeof s === "string" && s.startsWith("otpauth://"))) {
          const { parseOTPAuthURI } = await import("@/lib/totp")
          accounts = data.map((uri: string) => {
            try { return parseOTPAuthURI(uri) } catch { return null }
          }).filter(Boolean)
        } else if (data.format === "authiov" && data.accounts) {
          accounts = data.accounts
        } else if (Array.isArray(data)) {
          accounts = data
        }

        if (accounts.length === 0) return alert("No accounts found in file")

        const { createAccount } = await import("@/lib/totp")
        const existing = await getDecryptedAccounts()
        const now = Date.now()
        const merged = [...existing]
        for (const a of accounts) {
          if (!merged.find((m: any) => m.secret === a.secret?.replace?.(/\s/g, "").toUpperCase?.() || a.secret)) {
            merged.push(createAccount({
              name: a.name || "Imported",
              issuer: a.issuer,
              secret: a.secret || "",
              algorithm: a.algorithm,
              digits: a.digits,
              period: a.period,
            }))
          }
        }
        await saveAccounts(merged)
        window.location.reload()
      } catch {
        alert("Failed to parse import file")
      }
    }
    input.click()
  }

  const handleNextTab = (e: KeyboardEvent) => {
    if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigate("/")
    }
    if (e.key === "n" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      navigate("/")
      setTimeout(() => document.querySelector<HTMLElement>('[data-add-account]')?.click(), 100)
    }
  }

  useEffect(() => {
    window.addEventListener("keydown", handleNextTab)
    return () => window.removeEventListener("keydown", handleNextTab)
  }, [])

  const pinDialogTitle = pinDialogMode === "set" ? "Set PIN" : pinDialogMode === "change" ? "Change PIN" : "Remove PIN"

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="icon-sm" onClick={() => navigate("/")}>
            <HugeiconsIcon icon={ArrowLeft02Icon} className="size-4" />
          </Button>
          <h1 className="text-sm font-semibold">Settings</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-4 py-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground">{isOffline ? "Offline mode" : user?.email}</p>
          </CardContent>
        </Card>

        {!isOffline && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Cloud Sync</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={LockIcon} className="size-4 text-muted-foreground" />
                <span className="text-sm">Encryption Passphrase</span>
              </div>
              <Button
                variant={passphraseSet ? "outline" : "default"}
                size="xs"
                onClick={() => setPassphraseOpen(true)}
              >
                {passphraseSet ? "Change" : "Set"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {passphraseSet
                ? "Passphrase set. Your secrets are encrypted before cloud sync."
                : "Set a passphrase to enable encrypted cloud backup."}
            </p>

            {passphraseSet && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <SyncStatus state={syncState} lastSync={lastSync} />
                  <div className="flex gap-1.5">
                    <Button size="xs" variant="outline" onClick={handleForceSync}>
                      <HugeiconsIcon icon={CloudIcon} className="size-3" /> Sync Now
                    </Button>
                    <Button size="xs" variant="outline" onClick={handleRestore}>
                      Restore
                    </Button>
                  </div>
                </div>
                {syncMessage && (
                  <p className={`text-xs ${syncState === "error" ? "text-destructive" : "text-emerald-500"}`}>
                    {syncMessage}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Cloud Storage</CardTitle>
          </CardHeader>
          <CardContent>
            {storageUsage ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Used</span>
                  <span className="font-medium tabular-nums">
                    {formatBytes(storageUsage.used)} / {formatBytes(storageUsage.quota)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min((storageUsage.used / storageUsage.quota) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Synced TOTP data is encrypted and stored in your VoidAuth storage.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Loading storage info...</p>
            )}
          </CardContent>
        </Card>
          </>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1.5 rounded-lg bg-muted p-1">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    theme === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                  onClick={() => setTheme(t)}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    {t === "light" && <HugeiconsIcon icon={Sun01Icon} className="size-3" />}
                    {t === "dark" && <HugeiconsIcon icon={Moon01Icon} className="size-3" />}
                    {t === "system" && <HugeiconsIcon icon={DashboardSquare02Icon} className="size-3" />}
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Security</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">App Lock PIN</span>
              {pinSet ? (
                <div className="flex gap-1.5">
                  <Button size="xs" variant="outline" onClick={openPinChange}>Change</Button>
                  <Button size="xs" variant="ghost" className="text-destructive" onClick={openPinRemove}>Remove</Button>
                </div>
              ) : (
                <Button size="xs" onClick={openPinSet}>Set</Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Lock the app with a PIN. Auto-locks after 5 minutes of inactivity.
              {pinSet && " TOTP secrets are encrypted at rest with your PIN."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Import / Export</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={handleExport}>
                Export Backup
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={handleImport}>
                Import Accounts
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Supports AuthioV, Aegis, and Google Authenticator formats.
            </p>
          </CardContent>
        </Card>

        <Separator />

        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive"
          onClick={handleLogout}
        >
          <HugeiconsIcon icon={Logout03Icon} className="size-4" /> Sign Out
        </Button>
      </main>

      <PassphraseDialog
        open={passphraseOpen}
        onOpenChange={setPassphraseOpen}
        onSetPassphrase={handleSetPassphrase}
        hasExistingPassphrase={passphraseSet}
      />

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen} title={pinDialogTitle}>
        <div className="space-y-3">
          {pinDialogMode === "change" && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Current PIN</label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={oldPinInput}
                onChange={(e) => { setPinError(""); setOldPinInput(e.target.value.replace(/\D/g, "")) }}
                autoFocus
              />
            </div>
          )}
          {pinDialogMode === "remove" && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Enter PIN to remove lock</label>
              <Input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={oldPinInput}
                onChange={(e) => { setPinError(""); setOldPinInput(e.target.value.replace(/\D/g, "")) }}
                autoFocus
              />
            </div>
          )}
          {pinDialogMode !== "remove" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  {pinDialogMode === "set" ? "New PIN" : "New PIN"}
                </label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={newPinInput}
                  onChange={(e) => { setPinError(""); setNewPinInput(e.target.value.replace(/\D/g, "")) }}
                  autoFocus={pinDialogMode === "set"}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Confirm PIN</label>
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={confirmPinInput}
                  onChange={(e) => { setPinError(""); setConfirmPinInput(e.target.value.replace(/\D/g, "")) }}
                />
              </div>
            </>
          )}
          {pinError && <p className="text-xs text-destructive">{pinError}</p>}
          <Button className="w-full" onClick={handlePinSubmit}>
            {pinDialogMode === "set" ? "Set PIN" : pinDialogMode === "change" ? "Change PIN" : "Remove PIN"}
          </Button>
        </div>
      </Dialog>
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
