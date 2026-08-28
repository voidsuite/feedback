/**
 * Sync provider — orchestration between the local encrypted store and the
 * VoidAuth storage API (E2E passphrase-encrypted). Hides the store APIs behind
 * a small surface used by both the sidebar and the settings sheet.
 */

import * as React from "react"
import * as sync from "@/lib/sync"
import * as passphrase from "@/lib/passphrase"
import * as api from "@/lib/api"
import { useAuth } from "@/contexts/auth"
import { useSettings } from "@/contexts/settings"
import { useMail } from "@/contexts/mail"
import type { MailAccount, MailMessage } from "@/lib/types"

interface Usage {
  used: number
  quota: number
  files: number
}

interface SyncOutcome {
  pushed: number
  restored: number
  attachments: number
}

interface SyncContextValue {
  busy: boolean
  usage: Usage | null
  /** sync is on AND a passphrase is on record but not entered this session. */
  needsPassphrase: boolean
  /** Sync is on AND the passphrase is ready (encryption active in this session). */
  ready: boolean
  /** Bumped whenever the in-memory passphrase changes (forces re-render). */
  syncTick: number
  setPassphrase: (pw: string, commit: boolean) => void
  clearPassphrase: () => void
  enableSync: (passphraseStr: string) => Promise<void>
  disableSync: () => void
  runNow: () => Promise<SyncOutcome>
  refreshUsage: () => Promise<void>
  clearCloudData: () => Promise<void>
}

const SyncContext = React.createContext<SyncContextValue | undefined>(undefined)

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const { settings, updateSettings } = useSettings()
  const mail = useMail()
  const [busy, setBusy] = React.useState(false)
  const [usage, setUsage] = React.useState<Usage | null>(null)
  // Bumped so consumers re-render when the in-memory passphrase changes.
  const [tick, setTick] = React.useState(0)

  const needsPassphrase = settings.syncEnabled && settings.passphraseSet && !passphrase.isPassphraseReady()
  const ready = settings.syncEnabled && passphrase.isPassphraseReady()

  const refreshUsage = React.useCallback(async () => {
    setUsage(await api.getStorageUsage())
  }, [])

  const setPassphrase = React.useCallback((pw: string, commit: boolean) => {
    passphrase.setPassphraseNextTrial(pw, commit)
    setTick((t) => t + 1)
  }, [])

  const clearPassphrase = React.useCallback(() => {
    passphrase.clearPassphrase()
    setTick((t) => t + 1)
  }, [])

  const guard = React.useCallback(() => {
    if (!user) throw new Error("Sign in with VoidAuth to use cloud sync")
  }, [user])

  /** Merge local + remote. Local accounts win by id; messages win by newer updatedAt. */
  const merge = React.useCallback(
    (remoteAccounts: MailAccount[], remoteMessages: MailMessage[], localMessages: MailMessage[]) => {
      const byId = new Map<string, MailAccount>()
      for (const a of [...remoteAccounts, ...mail.accounts]) byId.set(a.id, a)
      const msgMap = new Map<string, MailMessage>()
      for (const m of localMessages) msgMap.set(m.id, m)
      for (const m of remoteMessages) {
        const existing = msgMap.get(m.id)
        if (!existing || (m.updatedAt || 0) > (existing.updatedAt || 0)) msgMap.set(m.id, m)
      }
      return {
        accounts: Array.from(byId.values()),
        messages: Array.from(msgMap.values()).filter((m) => !m.deleted),
      }
    },
    [mail.accounts]
  )

  const runNow = React.useCallback(async (): Promise<SyncOutcome> => {
    guard()
    const pw = passphrase.getPassphrase()
    if (!pw) throw new Error("Enter your passphrase first")
    setBusy(true)
    let pushed = 0
    let restored = 0
    let attachments = 0
    try {
      // 1. Fetch the latest from the mailbox (POP3 relay). Use the freshly
      // fetched list for the merge so state updates can't race with us.
      const localMessages = await mail.fetchMail()

      // 2. Pull + merge the cloud snapshot (skip quietly when none exists yet).
      let pulledAccounts: MailAccount[] = []
      let pulledMessages: MailMessage[] = []
      try {
        const { snapshot, attachmentCount } = await sync.pullSync(pw)
        attachments = attachmentCount
        pulledAccounts = snapshot.accounts
        pulledMessages = snapshot.messages.map((m) => ({
          ...m,
          attachments: m.attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            mimeType: a.mimeType,
            size: a.size,
            dataBase64: "",
          })),
        }))
      } catch (err) {
        const isNoSnapshot = (err as Error).message.includes("No cloud snapshot")
        if (!isNoSnapshot) throw err
      }

      const merged = merge(pulledAccounts, pulledMessages, localMessages)

      // 3. Push the merged, fully-encrypted snapshot back.
      pushed = await sync.pushSync({ settings, accounts: merged.accounts, messages: merged.messages, passphrase: pw })

      restored = merged.messages.length
      mail.replaceAll(merged.accounts, merged.messages)
      updateSettings({ lastSync: Date.now() })
      await refreshUsage()
      return { pushed, restored, attachments }
    } finally {
      setBusy(false)
    }
  }, [guard, mail, merge, refreshUsage, settings, updateSettings])

  const enableSync = React.useCallback(
    async (pw: string) => {
      guard()
      setPassphrase(pw, true)
      updateSettings({ syncEnabled: true, passphraseSet: true })
      await runNow()
    },
    [guard, runNow, setPassphrase, updateSettings]
  )

  const disableSync = React.useCallback(() => {
    clearPassphrase()
    updateSettings({ syncEnabled: false, lastSync: undefined })
  }, [clearPassphrase, updateSettings])

  const clearCloudData = React.useCallback(async () => {
    guard()
    await sync.clearCloud()
    updateSettings({ lastSync: undefined })
    setUsage(null)
  }, [guard, updateSettings])

  const value = React.useMemo<SyncContextValue>(
    () => ({
      busy,
      usage,
      needsPassphrase,
      ready,
      syncTick: tick,
      setPassphrase,
      clearPassphrase,
      enableSync,
      disableSync,
      runNow,
      refreshUsage,
      clearCloudData,
    }),
    [busy, usage, needsPassphrase, ready, tick, setPassphrase, clearPassphrase, enableSync, disableSync, runNow, refreshUsage, clearCloudData]
  )

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
}

export function useSync(): SyncContextValue {
  const context = React.useContext(SyncContext)
  if (!context) throw new Error("useSync must be used within a SyncProvider")
  return context
}