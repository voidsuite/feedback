/**
 * Mail context — accounts + messages over encrypted IndexedDB.
 *
 * Model: POP3 has no server-side folders, so folders are client-side:
 *  - inbox   = everything fetched (deleted items are tombstoned out)
 *  - flagged = manually starred
 *  - drafts  = locally saved drafts
 *  - sent    = what was sent through m3il
 *  - all     = everything non-deleted
 */

import * as React from "react"
import * as db from "@/lib/db"
import * as api from "@/lib/api"
import { randomId } from "@/lib/crypto"
import type { FolderId, MailAccount, MailMessage, FetchedMessage } from "@/lib/types"

function toMailMessage(account: MailAccount, m: FetchedMessage): MailMessage {
  return {
    id: `${account.id}:${m.uid}`,
    accountId: account.id,
    uid: m.uid,
    folder: "inbox",
    subject: m.subject || "(no subject)",
    from: m.from,
    to: m.to,
    cc: m.cc,
    date: m.date,
    text: m.text,
    html: m.html,
    attachments: m.attachments.map((a) => ({
      id: randomId(),
      filename: a.filename,
      mimeType: a.mimeType,
      size: a.size,
      dataBase64: a.dataBase64,
    })),
    read: false,
    flagged: false,
    updatedAt: Date.now(),
  }
}

function snippetOf(m: MailMessage): string {
  if (m.text) return m.text.replace(/\s+/g, " ").trim()
  if (m.html) {
    const doc = new DOMParser().parseFromString(m.html, "text/html")
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim()
  }
  return ""
}

interface SendInput {
  account: MailAccount
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text?: string
  html?: string
  attachments?: { filename: string; contentType: string; contentBase64: string }[]
}

interface MailContextValue {
  accounts: MailAccount[]
  messages: MailMessage[]
  activeAccountId: string | null
  activeFolder: FolderId
  selectedMessageId: string | null
  search: string
  syncing: boolean
  lastSync: number | null
  syncError: string | null
  selectedMessage: MailMessage | null
  visibleMessages: MailMessage[]
  folderCounts: Record<FolderId, number>
  addAccount: (a: MailAccount) => Promise<void>
  updateAccount: (a: MailAccount) => Promise<void>
  removeAccount: (id: string) => Promise<void>
  selectAccount: (id: string | null) => void
  selectFolder: (f: FolderId) => void
  selectMessage: (id: string | null) => void
  setSearch: (q: string) => void
  /** Fetches new mail; resolves with the messages fetched. */
  fetchMail: (onlyAccountId?: string) => Promise<MailMessage[]>
  markRead: (id: string, read: boolean) => Promise<void>
  toggleFlag: (id: string) => Promise<void>
  deleteMessage: (id: string) => Promise<void>
  saveDraft: (draft: Partial<MailMessage>) => Promise<MailMessage>
  discardDraft: (id: string) => Promise<void>
  sendMessage: (input: SendInput) => Promise<string>
  loadAttachment: (id: string) => Promise<{ dataBase64: string } | null>
  replaceAll: (accounts: MailAccount[], messages: MailMessage[]) => void
}

const MailContext = React.createContext<MailContextValue | undefined>(undefined)

export function MailProvider({ children }: { children: React.ReactNode }) {
  const [accounts, setAccounts] = React.useState<MailAccount[]>([])
  const [messages, setMessages] = React.useState<MailMessage[]>([])
  const [activeAccountId, setActiveAccountId] = React.useState<string | null>(null)
  const [activeFolder, setActiveFolder] = React.useState<FolderId>("inbox")
  const [selectedMessageId, setSelectedMessageId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [syncing, setSyncing] = React.useState(false)
  const [lastSync, setLastSync] = React.useState<number | null>(null)
  const [syncError, setSyncError] = React.useState<string | null>(null)
  const isMounted = React.useRef(true)

  React.useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  // Hydrate from IndexedDB on mount.
  React.useEffect(() => {
    let cancelled = false
    Promise.all([db.loadAccounts(), db.loadMessages()]).then(([accs, msgs]) => {
      if (cancelled) return
      setAccounts(accs)
      setMessages(msgs)
      setActiveAccountId((prev) => prev ?? accs[0]?.id ?? null)
      setLastSync(msgs.reduce((max, m) => Math.max(max, m.syncedAt || 0), 0) || null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Persist accounts/messages whenever they change.
  React.useEffect(() => {
    if (accounts.length) db.saveAccounts(accounts)
  }, [accounts])
  React.useEffect(() => {
    if (messages.length) db.upsertMessages(messages)
  }, [messages])

  const selectAccount = React.useCallback((id: string | null) => {
    setActiveAccountId(id)
    setSelectedMessageId(null)
  }, [])

  const selectFolder = React.useCallback((f: FolderId) => {
    setActiveFolder(f)
    setSelectedMessageId(null)
  }, [])

  const selectMessage = React.useCallback((id: string | null) => {
    setSelectedMessageId(id)
  }, [])

  const addAccount = React.useCallback(async (a: MailAccount) => {
    setAccounts((prev) => {
      const next = [...prev.filter((x) => x.id !== a.id), a]
      return next
    })
    setActiveAccountId(a.id)
  }, [])

  const updateAccount = React.useCallback(async (a: MailAccount) => {
    setAccounts((prev) => prev.map((x) => (x.id === a.id ? a : x)))
  }, [])

  const removeAccount = React.useCallback(
    async (id: string) => {
      setAccounts((prev) => prev.filter((a) => a.id !== id))
      setMessages((prev) => {
        const removed = prev.filter((m) => m.accountId === id)
        const ids = removed.map((m) => m.id)
        const attIds = removed.flatMap((m) => m.attachments.map((a) => a.id))
        db.deleteMessages(ids)
        db.deleteAttachments(attIds)
        return prev.filter((m) => m.accountId !== id)
      })
      setActiveAccountId((prev) => (prev === id ? null : prev))
      setSelectedMessageId(null)
    },
    []
  )

  const fetchMail = React.useCallback(
    async (onlyAccountId?: string): Promise<MailMessage[]> => {
      const targets = onlyAccountId ? accounts.filter((a) => a.id === onlyAccountId) : accounts
      if (!targets.length) return []
      setSyncing(true)
      setSyncError(null)
      const allFetched: MailMessage[] = []
      const errors: string[] = []
      for (const account of targets) {
        try {
          const res = await api.fetchMail(account, 50)
          const nextMessages = res.messages.map((m) => toMailMessage(account, m))

          const accountSnapshot = { ...account, lastSync: Date.now() }

          // Persist attachments to their store, then store the messages.
          const lightMessages: MailMessage[] = []
          for (const m of nextMessages) {
            const atts = []
            for (const a of m.attachments) {
              if (a.dataBase64) await db.saveAttachment(a)
              atts.push({ ...a, dataBase64: "" })
            }
            lightMessages.push({ ...m, attachments: atts, syncedAt: Date.now() })
          }
          allFetched.push(...lightMessages)

          setAccounts((prev) => prev.map((x) => (x.id === account.id ? accountSnapshot : x)))
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]))
            for (const m of lightMessages) {
              const existing = byId.get(m.id)
              if (!existing) byId.set(m.id, m)
            }
            return Array.from(byId.values())
          })
        } catch (err) {
          errors.push(`${account.label}: ${err instanceof Error ? err.message : String(err)}`)
        }
      }
      setSyncing(false)
      setLastSync(Date.now())
      if (errors.length) setSyncError(errors.join("; "))
      return allFetched
    },
    [accounts]
  )

  const markRead = React.useCallback(
    async (id: string, read: boolean) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, read, updatedAt: Date.now() } : m)))
      await db.markMessagesDirty([id], { read, updatedAt: Date.now() })
    },
    []
  )

  const toggleFlag = React.useCallback(
    async (id: string) => {
      let next: boolean = false
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id) return m
          next = !m.flagged
          return { ...m, flagged: next, updatedAt: Date.now() }
        })
      )
      await db.markMessagesDirty([id], { flagged: next, updatedAt: Date.now() })
    },
    []
  )

  const deleteMessage = React.useCallback(
    async (id: string) => {
      const target = messages.find((m) => m.id === id)
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, deleted: true, updatedAt: Date.now() } : m)))
      await db.markMessagesDirty([id], { deleted: true, updatedAt: Date.now() })
      if (target) await db.deleteAttachments(target.attachments.map((a) => a.id))
      setSelectedMessageId((prev) => (prev === id ? null : prev))
    },
    [messages]
  )

  const saveDraft = React.useCallback(
    async (draft: Partial<MailMessage>): Promise<MailMessage> => {
      const now = Date.now()
      const existing = draft.id
        ? messages.find((m) => m.id === draft.id && m.folder === "drafts")
        : undefined
      const message: MailMessage = {
        id: existing?.id || `draft-${randomId()}`,
        accountId: draft.accountId || activeAccountId || accounts[0]?.id || "local",
        uid: existing?.uid || `draft-${randomId()}`,
        folder: "drafts",
        subject: draft.subject ?? "",
        from: draft.from ?? null,
        to: draft.to ?? [],
        cc: draft.cc ?? [],
        date: existing?.date ?? new Date().toISOString(),
        text: draft.text ?? "",
        html: draft.html ?? null,
        attachments: draft.attachments ?? [],
        read: true,
        flagged: false,
        updatedAt: now,
        deleted: false,
      }
      setMessages((prev) => [...prev.filter((m) => m.id !== message.id), message])
      return message
    },
    [accounts, activeAccountId, messages]
  )

  const discardDraft = React.useCallback(async (id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
    await db.deleteMessages([id])
  }, [])

  const sendMessage = React.useCallback(
    async (input: SendInput): Promise<string> => {
      const result = await api.sendMail({
        account: input.account,
        to: input.to,
        cc: input.cc,
        bcc: input.bcc,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments,
      })
      // Record the sent copy locally (metadata only).
      const message: MailMessage = {
        id: `sent-${randomId()}`,
        accountId: input.account.id,
        uid: `sent-${randomId()}`,
        folder: "sent",
        subject: input.subject || "(no subject)",
        from: { name: input.account.name || "", email: input.account.email },
        to: input.to.map((email) => ({ name: "", email })),
        cc: (input.cc || []).map((email) => ({ name: "", email })),
        date: new Date().toISOString(),
        text: input.text ?? "",
        html: input.html ?? "",
        attachments: [],
        read: true,
        flagged: false,
        syncedAt: Date.now(),
        updatedAt: Date.now(),
      }
      setMessages((prev) => [...prev, message])
      return result.messageId
    },
    []
  )

  const loadAttachment = React.useCallback(async (id: string) => {
    return db.loadAttachment(id)
  }, [])

  /** Full state replacement used by cloud-sync restore. */
  const replaceAll = React.useCallback((nextAccounts: MailAccount[], nextMessages: MailMessage[]) => {
    setAccounts(nextAccounts)
    setMessages(nextMessages)
    setActiveAccountId((prev) => (prev && nextAccounts.some((a) => a.id === prev) ? prev : nextAccounts[0]?.id ?? null))
    setSelectedMessageId(null)
    db.saveAccounts(nextAccounts)
    db.upsertMessages(nextMessages)
  }, [])

  // --- Derived state ---

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    return messages.filter((m) => {
      if (m.deleted) return false
      if (activeAccountId && m.accountId !== activeAccountId) return false
      if (activeFolder === "flagged") {
        if (!m.flagged) return false
      } else if (m.folder !== activeFolder) {
        return false
      }
      if (!q) return true
      const hay = `${m.subject} ${m.from?.email || ""} ${m.from?.name || ""} ${snippetOf(m)}`.toLowerCase()
      return hay.includes(q)
    })
  }, [messages, activeAccountId, activeFolder, search])

  const visibleMessages = React.useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0
      const dbv = b.date ? new Date(b.date).getTime() : 0
      return dbv - da
    })
  }, [filtered])

  const folderCounts = React.useMemo(() => {
    const counts: Record<FolderId, number> = { inbox: 0, sent: 0, drafts: 0, flagged: 0, all: 0 }
    for (const m of messages) {
      if (m.deleted) continue
      if (activeAccountId && m.accountId !== activeAccountId) continue
      counts.all += 1
      if (m.folder === "drafts") counts.drafts += 1
      if (m.folder === "sent") counts.sent += 1
      if (m.folder === "inbox") counts.inbox += 1
      if (m.flagged) counts.flagged += 1
    }
    return counts
  }, [messages, activeAccountId])

  const selectedMessage = React.useMemo(
    () => messages.find((m) => m.id === selectedMessageId) || null,
    [messages, selectedMessageId]
  )

  const value = React.useMemo<MailContextValue>(
    () => ({
      accounts,
      messages,
      activeAccountId,
      activeFolder,
      selectedMessageId,
      search,
      syncing,
      lastSync,
      syncError,
      selectedMessage,
      visibleMessages,
      folderCounts,
      addAccount,
      updateAccount,
      removeAccount,
      selectAccount,
      selectFolder,
      selectMessage,
      setSearch,
      fetchMail,
      markRead,
      toggleFlag,
      deleteMessage,
      saveDraft,
      discardDraft,
      sendMessage,
      loadAttachment,
      replaceAll,
    }),
    [
      accounts, messages, activeAccountId, activeFolder, selectedMessageId, search, syncing, lastSync, syncError,
      selectedMessage, visibleMessages, folderCounts,
      addAccount, updateAccount, removeAccount, selectAccount, selectFolder, selectMessage,
      fetchMail, markRead, toggleFlag, deleteMessage, saveDraft, discardDraft, sendMessage, loadAttachment, replaceAll,
    ]
  )

  return <MailContext.Provider value={value}>{children}</MailContext.Provider>
}

export function useMail(): MailContextValue {
  const context = React.useContext(MailContext)
  if (!context) throw new Error("useMail must be used within a MailProvider")
  return context
}