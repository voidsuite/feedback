import { useMemo, useState } from "react"
import { ChevronLeft, Download, Loader2, Paperclip, Reply, Star, Trash2, Forward } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MailLogo } from "@/components/MailLogo"
import { useMail } from "@/contexts/mail"
import { useToast } from "@/contexts/toast"
import { sanitizeHtml } from "@/lib/sanitize"
import { cn } from "@/lib/utils"
import type { Address } from "@/lib/types"

function formatDate(iso: string | null): string {
  if (!iso) return ""
  return new Date(iso).toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function addressLabel(a: Address | null): string {
  if (!a) return "Unknown"
  return a.name ? `${a.name} <${a.email}>` : a.email
}

interface ReadingPaneProps {
  onBack: () => void
  onReply: () => void
  onForward: () => void
}

export function ReadingPane({ onBack, onReply, onForward }: ReadingPaneProps) {
  const { selectedMessage, toggleFlag, deleteMessage, loadAttachment } = useMail()
  const { toast } = useToast()
  const [downloading, setDownloading] = useState<string | null>(null)

  const m = selectedMessage
  const sanitized = useMemo(() => (m?.html ? sanitizeHtml(m.html) : null), [m])

  if (!m) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <MailLogo size="sm" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Select a message</p>
          <p className="text-xs text-muted-foreground">Your mail will appear here.</p>
        </div>
      </main>
    )
  }

  async function downloadAttachment(id: string, filename: string) {
    setDownloading(id)
    try {
      const data = await loadAttachment(id)
      if (!data?.dataBase64) {
        toast({ title: "Attachment unavailable", description: "The file data isn't stored on this device.", variant: "destructive" })
        return
      }
      const link = document.createElement("a")
      link.href = `data:application/octet-stream;base64,${data.dataBase64}`
      link.download = filename
      link.click()
    } catch {
      toast({ title: "Download failed", variant: "destructive" })
    } finally {
      setDownloading(null)
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border p-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back to list">
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold tracking-tight text-foreground">{m.subject}</h1>
          <p className="truncate text-xs text-muted-foreground">{formatDate(m.date)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={() => toggleFlag(m.id)} aria-label={m.flagged ? "Unflag" : "Flag"} className={m.flagged ? "text-amber-500" : ""}>
            <Star className={cn("size-4", m.flagged && "fill-current")} />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onReply} aria-label="Reply">
            <Reply className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onForward} aria-label="Forward">
            <Forward className="size-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => deleteMessage(m.id)} aria-label="Delete" className="text-muted-foreground hover:text-destructive">
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Sender */}
      <div className="flex items-start gap-3 border-b border-border px-4 py-3">
        <Avatar className="size-9">
          <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
            {(m.from?.name || m.from?.email || "?").slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{addressLabel(m.from)}</p>
          <p className="truncate text-xs text-muted-foreground">
            To: {m.to.length ? m.to.map(addressLabel).join(", ") : "—"}
            {m.cc.length ? ` · Cc: ${m.cc.map(addressLabel).join(", ")}` : ""}
          </p>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="min-h-0 flex-1">
        <article className="prose-sm max-w-none px-5 py-4 text-sm leading-relaxed text-foreground">
          {m.html && sanitized ? (
            <div className="[&_a]:text-primary [&_a]:underline [&_img]:max-w-full [&_img]:h-auto [&_pre]:overflow-x-auto" dangerouslySetInnerHTML={{ __html: sanitized }} />
          ) : m.text ? (
            <pre className="whitespace-pre-wrap font-sans text-sm">{m.text}</pre>
          ) : (
            <p className="text-muted-foreground">(no content)</p>
          )}
        </article>

        {/* Attachments */}
        {m.attachments.length > 0 ? (
          <div className="space-y-1.5 px-5 pb-6">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Paperclip className="size-3" />
              Attachments
            </p>
            {m.attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <Paperclip className="size-3.5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs">{a.filename}</span>
                <span className="flex-shrink-0 text-[10px] text-muted-foreground">{formatBytes(a.size)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => downloadAttachment(a.id, a.filename)}
                  disabled={downloading === a.id}
                  aria-label={`Download ${a.filename}`}
                >
                  {downloading === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </ScrollArea>
    </main>
  )
}