import { useEffect, useRef, useState } from "react"
import { Loader2, Paperclip, Send, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useMail } from "@/contexts/mail"
import { useSettings } from "@/contexts/settings"
import { useToast } from "@/contexts/toast"
import type { MailMessage } from "@/lib/types"

interface ComposeAttachment {
  name: string
  type: string
  size: number
  dataBase64: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface ComposeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  replyTo?: MailMessage | null
  forwardOf?: MailMessage | null
}

export function ComposeSheet({ open, onOpenChange, replyTo, forwardOf }: ComposeSheetProps) {
  const { accounts, activeAccountId, sendMessage, saveDraft, discardDraft } = useMail()
  const { settings } = useSettings()
  const { toast } = useToast()

  const [accountId, setAccountId] = useState("")
  const [to, setTo] = useState("")
  const [cc, setCc] = useState("")
  const [bcc, setBcc] = useState("")
  const [showCc, setShowCc] = useState(false)
  const [showBcc, setShowBcc] = useState(false)
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([])
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const draftId = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setAccountId(accounts.find((a) => a.id === activeAccountId)?.id || accounts[0]?.id || "")
    setAttachments([])
    setCc("")
    setBcc("")
    setShowCc(false)
    setShowBcc(false)
    setSending(false)
    setSaving(false)
    draftId.current = null
    if (replyTo) {
      setTo(replyTo.from?.email || "")
      setSubject(replyTo.subject.startsWith("Re:") ? replyTo.subject : `Re: ${replyTo.subject}`)
      setBody(`\n\nOn ${replyTo.date ? new Date(replyTo.date).toLocaleString() : ""}, ${replyTo.from?.name || replyTo.from?.email || ""} wrote:\n> ${(replyTo.text || "").split("\n").join("\n> ")}`)
    } else if (forwardOf) {
      setTo("")
      setSubject(forwardOf.subject.startsWith("Fwd:") ? forwardOf.subject : `Fwd: ${forwardOf.subject}`)
      setBody(`\n\n---------- Forwarded message ----------\nFrom: ${forwardOf.from?.name || ""} <${forwardOf.from?.email || ""}>\nDate: ${forwardOf.date ? new Date(forwardOf.date).toLocaleString() : ""}\nSubject: ${forwardOf.subject}\n\n${forwardOf.text || ""}`)
    } else {
      setTo("")
      setSubject("")
      setBody("")
    }
  }, [open, replyTo, forwardOf, accounts, activeAccountId])

  function parseAddresses(raw: string): string[] {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    for (const file of files) {
      if (file.size > 20 * 1024 * 1024) {
        toast({ title: "Attachment too large", description: `${file.name} exceeds the 20 MB limit`, variant: "destructive" })
        continue
      }
      const reader = new FileReader()
      const dataBase64 = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(String(reader.result).split(",")[1] || "")
        reader.readAsDataURL(file)
      })
      setAttachments((prev) => [...prev, { name: file.name, type: file.type, size: file.size, dataBase64 }])
    }
    if (fileRef.current) fileRef.current.value = ""
  }

  async function submit(saveOnly: boolean) {
    const account = accounts.find((a) => a.id === accountId)
    if (!account) {
      toast({ title: "No account", description: "Add a mail account first.", variant: "destructive" })
      return
    }
    if (!saveOnly) {
      const recipients = parseAddresses(to)
      if (!recipients.length) {
        toast({ title: "No recipients", description: "Add a valid recipient address.", variant: "destructive" })
        return
      }
    }
    if (saveOnly) {
      setSaving(true)
      try {
        await saveDraft({
          id: draftId.current || undefined,
          accountId: account.id,
          to: parseAddresses(to).map((email) => ({ name: "", email })),
          cc: parseAddresses(cc).map((email) => ({ name: "", email })),
          subject,
          text: body,
          attachments: attachments.map((a) => ({ id: "", filename: a.name, mimeType: a.type, size: a.size, dataBase64: a.dataBase64 })),
        }).then((d) => {
          draftId.current = d.id
        })
        toast({ title: "Draft saved" })
      } catch (err) {
        toast({ title: "Couldn't save draft", description: String(err), variant: "destructive" })
      } finally {
        setSaving(false)
      }
      return
    }

    setSending(true)
    try {
      await sendMessage({
        account,
        to: parseAddresses(to),
        cc: parseAddresses(cc),
        bcc: parseAddresses(bcc),
        subject,
        text: body,
        attachments: attachments.map((a) => ({
          filename: a.name,
          contentType: a.type || "application/octet-stream",
          contentBase64: a.dataBase64,
        })),
      })
      if (draftId.current) await discardDraft(draftId.current).catch(() => {})
      toast({ title: "Message sent", variant: "success" })
      onOpenChange(false)
    } catch (err) {
      toast({
        title: "Send failed",
        description: err instanceof Error ? err.message.slice(0, 160) : String(err),
        variant: "destructive",
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center justify-between gap-3">
            <SheetTitle>{replyTo ? "Reply" : forwardOf ? "Forward" : "New message"}</SheetTitle>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="h-8 max-w-[220px] rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring"
              aria-label="From account"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email}
                </option>
              ))}
            </select>
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2">
            <Label className="w-8 text-xs text-muted-foreground">To</Label>
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="recipient@example.com" className="h-8 flex-1 border-none px-0 shadow-none focus-visible:ring-0" />
            {!showCc && !showBcc ? (
              <button className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setShowCc(true)}>
                Cc
              </button>
            ) : null}
            {showCc && !showBcc ? (
              <button className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline" onClick={() => setShowBcc(true)}>
                Bcc
              </button>
            ) : null}
          </div>
          {showCc ? (
            <div className="flex items-center gap-x-3 border-b px-4 py-2">
              <Label className="w-8 text-xs text-muted-foreground">Cc</Label>
              <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="cc@example.com" className="h-8 flex-1 border-none px-0 shadow-none focus-visible:ring-0" />
            </div>
          ) : null}
          {showBcc ? (
            <div className="flex items-center gap-x-3 border-b px-4 py-2">
              <Label className="w-8 text-xs text-muted-foreground">Bcc</Label>
              <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="bcc@example.com" className="h-8 flex-1 border-none px-0 shadow-none focus-visible:ring-0" />
            </div>
          ) : null}
          <div className="border-b px-4 py-2">
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="h-8 border-none px-0 shadow-none focus-visible:ring-0" />
          </div>

          <div className="min-h-[260px] flex-1">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message…"
              className="h-full min-h-[260px] resize-none border-none px-4 py-3 shadow-none focus-visible:ring-0"
            />
          </div>

          {attachments.length ? (
            <div className="flex flex-wrap gap-2 border-t px-4 py-3">
              {attachments.map((att, i) => (
                <div key={`${att.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5">
                  <Paperclip className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="max-w-[180px] truncate text-xs">{att.name}</span>
                  <span className="text-[10px] text-muted-foreground">{formatBytes(att.size)}</span>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, ix) => ix !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${att.name}`}
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-3">
          <div className="flex items-center gap-1">
            <Button onClick={() => !sending && !saving && submit(false)} disabled={sending || saving} className="gap-2">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Send
            </Button>
            <Button variant="ghost" onClick={() => !sending && submit(true)} disabled={sending || saving} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-3.5" />}
              Save draft
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={onFileChosen} />
            <Button variant="outline" size="icon" onClick={() => fileRef.current?.click()} aria-label="Attach files">
              <Paperclip className="size-4" />
            </Button>
            <span className="hidden text-[10px] text-muted-foreground sm:inline">
              {settings.syncEnabled ? "Encrypted sync" : "Local only"}
            </span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}