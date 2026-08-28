import { useEffect, useRef, useState } from "react"
import { Loader2, PenLine, Settings } from "lucide-react"
import { AccountForm } from "@/components/account-form"
import { ComposeSheet } from "@/components/compose-sheet"
import { MailLogo } from "@/components/MailLogo"
import { PassphraseDialog } from "@/components/passphrase-dialog"
import { SettingsSheet } from "@/components/settings-sheet"
import { MessageList } from "@/components/mail/message-list"
import { ReadingPane } from "@/components/mail/reading-pane"
import { Sidebar } from "@/components/mail/sidebar"
import { useAuth } from "@/contexts/auth"
import { useMail } from "@/contexts/mail"
import { useSync } from "@/contexts/sync"
import { useToast } from "@/contexts/toast"
import * as passphrase from "@/lib/passphrase"
import type { MailAccount, MailMessage } from "@/lib/types"

type PassphraseIntent = "enable" | "unlock"

export function MailPage() {
  const { user } = useAuth()
  const mail = useMail()
  const sync = useSync()
  const { toast } = useToast()

  const [composeOpen, setComposeOpen] = useState(false)
  const [replyTo, setReplyTo] = useState<MailMessage | null>(null)
  const [forwardOf, setForwardOf] = useState<MailMessage | null>(null)
  const [accountFormOpen, setAccountFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<MailAccount | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pwDialog, setPwDialog] = useState<{ open: boolean; mode: "setup" | "unlock" }>({ open: false, mode: "setup" })
  const pwIntent = useRef<PassphraseIntent>("enable")

  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 767px)").matches)
  const fetchedOnce = useRef(false)

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)")
    const handler = () => setIsMobile(mq.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])

  // First run: pull mail automatically if there are accounts.
  useEffect(() => {
    if (fetchedOnce.current) return
    if (mail.accounts.length === 0) return
    fetchedOnce.current = true
    mail.fetchMail().then((msgs) => {
      if (msgs.length > 0) toast({ title: "Mailbox updated", description: `${msgs.length} new messages`, variant: "success" })
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mail.accounts.length])

  function openCompose(kind: "new" | "reply" | "forward") {
    setReplyTo(kind === "reply" ? mail.selectedMessage : null)
    setForwardOf(kind === "forward" ? mail.selectedMessage : null)
    setComposeOpen(true)
  }

  function openAccountForm(editing?: MailAccount) {
    setEditingAccount(editing ?? null)
    setAccountFormOpen(true)
  }

  async function handleAccountSave(account: MailAccount) {
    if (editingAccount) {
      await mail.updateAccount(account)
      toast({ title: "Account updated" })
    } else {
      await mail.addAccount(account)
      toast({ title: "Account added", description: account.email, variant: "success" })
    }
    setAccountFormOpen(false)
  }

  /**
   * Request cloud sync. If a passphrase is needed (never set, or not entered
   * this session) show the passphrase dialog first; otherwise sync now.
   */
  function requestSync() {
    if (!user) {
      toast({ title: "Sign in first", description: "Cloud sync needs a VoidAuth account." })
      return
    }
    const wantEnable = !sync.ready
    const hasRecorded = passphrase.hasPassphraseSet()
    const inMemory = passphrase.isPassphraseReady()

    if (wantEnable && !inMemory) {
      pwIntent.current = "enable"
      setPwDialog({ open: true, mode: hasRecorded ? "unlock" : "setup" })
      return
    }
    if (!inMemory) {
      pwIntent.current = "unlock"
      setPwDialog({ open: true, mode: "unlock" })
      return
    }
    void performSync()
  }

  async function performSync() {
    try {
      const outcome = await sync.runNow()
      toast({
        title: "Synced",
        description: `${outcome.restored} messages, ${outcome.pushed} pushed, ${outcome.attachments} attachments restored.`,
        variant: "success",
      })
    } catch (err) {
      toast({ title: "Sync failed", description: (err as Error).message.slice(0, 140), variant: "destructive" })
    }
  }

  async function onPassphraseConfirmed(pw: string) {
    setPwDialog((prev) => ({ ...prev, open: false }))
    if (pwIntent.current === "enable") {
      try {
        await sync.enableSync(pw)
        toast({ title: "Encrypted sync enabled", variant: "success" })
      } catch (err) {
        toast({ title: "Couldn't enable sync", description: (err as Error).message.slice(0, 140), variant: "destructive" })
      }
      return
    }
    sync.setPassphrase(pw, false)
    await performSync()
  }

  const showReadingPane = !isMobile || !!mail.selectedMessageId

  return (
    <div className="flex h-dvh overflow-hidden bg-background text-foreground">
      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background px-3 md:hidden">
        <MailLogo size="sm" />
        <div className="flex items-center gap-1">
          <button onClick={() => openCompose("new")} className="flex items-center gap-1.5 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Compose">
            <PenLine className="size-4" />
          </button>
          <button onClick={() => setSettingsOpen(true)} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" aria-label="Settings">
            <Settings className="size-4" />
          </button>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar
          onCompose={() => openCompose("new")}
          onOpenAccountForm={openAccountForm}
          onOpenSettings={() => setSettingsOpen(true)}
          onRequestSync={requestSync}
        />
      </div>

      {isMobile ? (
        <>
          {showReadingPane ? (
            <div className="mt-14 flex-1">
              <ReadingPane onBack={() => mail.selectMessage(null)} onReply={() => openCompose("reply")} onForward={() => openCompose("forward")} />
            </div>
          ) : (
            <div className="mt-14 flex-1">
              <MessageList />
            </div>
          )}
        </>
      ) : (
        <>
          <MessageList />
          <ReadingPane onBack={() => mail.selectMessage(null)} onReply={() => openCompose("reply")} onForward={() => openCompose("forward")} />
        </>
      )}

      {/* Panels */}
      <ComposeSheet
        open={composeOpen}
        onOpenChange={setComposeOpen}
        replyTo={replyTo}
        forwardOf={forwardOf}
      />
      <AccountForm
        open={accountFormOpen}
        onOpenChange={setAccountFormOpen}
        editing={editingAccount}
        onSave={handleAccountSave}
        onRemove={async (id) => {
          await mail.removeAccount(id)
          setAccountFormOpen(false)
          toast({ title: "Account removed" })
        }}
      />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} onRequestSync={requestSync} />
      <PassphraseDialog
        open={pwDialog.open}
        onOpenChange={(o) => setPwDialog((prev) => ({ ...prev, open: o }))}
        mode={pwDialog.mode}
        onConfirmed={onPassphraseConfirmed}
      />

      {sync.busy ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-popover px-4 py-2 text-xs text-muted-foreground shadow-lg">
          <Loader2 className="size-3.5 animate-spin" />
          Syncing…
        </div>
      ) : null}
    </div>
  )
}