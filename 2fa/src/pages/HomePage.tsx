import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useNavigate } from "react-router"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Settings02Icon, CloudIcon, SearchIcon } from "@hugeicons/core-free-icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AccountCard } from "@/components/AccountCard"
import { AddAccountDialog } from "@/components/AddAccountDialog"
import { SyncStatus } from "@/components/SyncStatus"
import { PinSetupPrompt, wasPinPromptDismissed } from "@/components/PinSetupPrompt"
import { VoidLogo } from "@/components/VoidLogo"
import type { TOTPAccount } from "@/lib/totp"
import { encrypt, decrypt } from "@/lib/crypto"
import { getAppData, saveAppData, getStorageUsage } from "@/lib/api"
import { getPassphrase } from "@/lib/passphrase"
import { useOAuth } from "@/contexts/oauth"
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
} from "@/lib/encrypted-storage"

const STORAGE_KEY = "ava_accounts"

export function HomePage() {
  const navigate = useNavigate()
  const { isOffline } = useOAuth()
  const searchRef = useRef<HTMLInputElement>(null)
  const [accounts, setAccounts] = useState<TOTPAccount[]>([])
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [syncState, setSyncState] = useState<"synced" | "syncing" | "error" | "idle">("idle")
  const [lastSync, setLastSync] = useState<number | null>(null)
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number } | null>(null)
  const [search, setSearch] = useState("")
  const [passphraseSet, setPassphraseSet] = useState(false)
  const [pinPromptOpen, setPinPromptOpen] = useState(false)
  const wasAuthed = useRef(false)

  useEffect(() => {
    if (!wasAuthed.current && !isOffline) {
      wasAuthed.current = true
      if (!hasPin() && !wasPinPromptDismissed()) {
        setPinPromptOpen(true)
      }
    }
  }, [isOffline])

  const filteredAccounts = useMemo(() => {
    if (!search) return accounts
    const q = search.toLowerCase()
    return accounts.filter((a) =>
      a.name.toLowerCase().includes(q) ||
      (a.issuer && a.issuer.toLowerCase().includes(q))
    )
  }, [accounts, search])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault()
        setAddOpen(true)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  useEffect(() => {
    getPassphrase().then(p => setPassphraseSet(!!p))
  }, [])

  useEffect(() => {
    async function load() {
      const pin = getPin()
      if (pin && hasPin()) {
        if (hasPlainAccounts()) {
          const plain = loadPlainAccounts()
          if (plain.length > 0) {
            await encryptAccounts(plain, pin)
          }
          localStorage.removeItem(STORAGE_KEY)
          setAccounts(plain)
        } else if (hasDeviceEncryptedAccounts()) {
          const decrypted = await decryptAccountsDevice()
          if (decrypted) {
            await encryptAccounts(decrypted, pin)
            setAccounts(decrypted)
          }
        } else if (hasEncryptedAccounts()) {
          const decrypted = await decryptAccounts(pin)
          if (decrypted) setAccounts(decrypted)
        }
      } else if (!hasPin()) {
        if (hasPlainAccounts()) {
          const plain = loadPlainAccounts()
          if (plain.length > 0) {
            await encryptAccountsDevice(plain)
          }
          localStorage.removeItem(STORAGE_KEY)
          setAccounts(plain)
        } else if (hasDeviceEncryptedAccounts()) {
          const decrypted = await decryptAccountsDevice()
          if (decrypted) setAccounts(decrypted)
        }
      }
      setLoadingAccounts(false)
    }
    load()
  }, [])

  const persistAccounts = useCallback(async (accts: TOTPAccount[]) => {
    const pin = getPin()
    if (pin && hasPin()) {
      await encryptAccounts(accts, pin)
    } else {
      await encryptAccountsDevice(accts)
    }
  }, [])

  const syncToCloud = useCallback(async (accts: TOTPAccount[]) => {
    const passphrase = await getPassphrase()
    if (!passphrase) return
    setSyncState("syncing")
    try {
      const plaintext = JSON.stringify(accts)
      const ciphertext = await encrypt(plaintext, passphrase)
      await saveAppData('totp_accounts', { accounts: accts, encrypted: ciphertext })
      setSyncState("synced")
      setLastSync(Date.now())
    } catch {
      setSyncState("error")
    }
  }, [])

  const loadFromCloud = useCallback(async () => {
    const passphrase = await getPassphrase()
    if (!passphrase) return
    setSyncState("syncing")
    try {
      const data = await getAppData('totp_accounts')
      if (data?.value?.encrypted) {
        const plaintext = await decrypt(data.value.encrypted, passphrase)
        const cloudAccounts: TOTPAccount[] = JSON.parse(plaintext)
        const merged = mergeAccounts(accounts, cloudAccounts)
        setAccounts(merged)
        await persistAccounts(merged)
      }
      setSyncState("synced")
      setLastSync(Date.now())
    } catch {
      setSyncState("error")
    }
  }, [accounts, persistAccounts])

  useEffect(() => {
    if (!isOffline && !loadingAccounts) {
      loadFromCloud()
      getStorageUsage().then(setStorageUsage).catch(() => {})
    }
  }, [isOffline, loadingAccounts])

  const handleAdd = useCallback((account: TOTPAccount) => {
    setAccounts((prev) => {
      const next = [...prev, account]
      persistAccounts(next)
      syncToCloud(next)
      return next
    })
  }, [persistAccounts, syncToCloud])

  const handleDelete = useCallback((id: string) => {
    setAccounts((prev) => {
      const next = prev.filter((a) => a.id !== id)
      persistAccounts(next)
      syncToCloud(next)
      return next
    })
  }, [persistAccounts, syncToCloud])

  const storagePercent = storageUsage ? Math.round((storageUsage.used / storageUsage.quota) * 100) : 0

  if (loadingAccounts) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <VoidLogo size="sm" />
          <div className="flex items-center gap-2">
            {isOffline ? (
              <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">Local only</span>
            ) : (
              <SyncStatus state={syncState} lastSync={lastSync} />
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => navigate("/settings")}>
              <HugeiconsIcon icon={Settings02Icon} className="size-4" />
            </Button>
          </div>
        </div>
        {accounts.length > 1 && (
          <div className="mx-auto max-w-3xl px-4 pb-2">
            <div className="relative">
              <HugeiconsIcon icon={SearchIcon} className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                placeholder="Search accounts... (Ctrl+K)"
                className="h-8 pl-7 text-xs"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {filteredAccounts.length === 0 && !search ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted">
              <HugeiconsIcon icon={CloudIcon} className="size-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold">No accounts yet</h2>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Add your first 2FA account by scanning a QR code or pasting a setup key.
            </p>
            <Button className="mt-6 gap-2" onClick={() => setAddOpen(true)}>
              <HugeiconsIcon icon={Add01Icon} className="size-4" /> Add Account
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredAccounts.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onDelete={handleDelete}
                />
              ))}
            </div>
            <div className="mt-6 flex justify-center">
              <Button variant="outline" size="lg" className="gap-2 rounded-full" onClick={() => setAddOpen(true)} data-add-account>
                <HugeiconsIcon icon={Add01Icon} className="size-4" /> Add Account
              </Button>
            </div>
          </>
        )}

        {!isOffline && accounts.length > 0 && !passphraseSet && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-center">
            <p className="text-xs text-amber-400">
              Set an encryption passphrase in Settings to enable cloud sync backup.
            </p>
          </div>
        )}

        {!isOffline && storageUsage && (
          <div className="mt-6 rounded-xl border border-border bg-card/50 p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Cloud Storage</span>
              <span>{formatBytes(storageUsage.used)} / {formatBytes(storageUsage.quota)}</span>
            </div>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.min(storagePercent, 100)}%` }}
              />
            </div>
          </div>
        )}
      </main>

      <footer className="mt-8 border-t border-border py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 text-xs text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">authiov</span> · Void 2FA
          </span>
          <a
            href={`${import.meta.env.VITE_FEEDBACK_URL || "https://feedback.stwupid.tech"}?source=authiov`}
            className="hover:text-foreground"
          >
            Feedback
          </a>
        </div>
      </footer>

      <PinSetupPrompt open={pinPromptOpen} onOpenChange={setPinPromptOpen} />
      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleAdd} />
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function mergeAccounts(local: TOTPAccount[], cloud: TOTPAccount[]): TOTPAccount[] {
  const map = new Map<string, TOTPAccount>()
  for (const a of local) map.set(a.id, a)
  for (const a of cloud) {
    const existing = map.get(a.id)
    if (!existing || a.updatedAt > existing.updatedAt) {
      map.set(a.id, a)
    }
  }
  return Array.from(map.values()).sort((a, b) => b.createdAt - a.createdAt)
}
