import { Paperclip, Search, Star } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useMail } from "@/contexts/mail"
import { cn } from "@/lib/utils"
import type { MailMessage } from "@/lib/types"

function formatTime(date: string | null): string {
  if (!date) return ""
  const d = new Date(date)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString([], { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) })
}

function senderOf(m: MailMessage): string {
  return m.from?.name || m.from?.email || "(unknown sender)"
}

function snippetOf(m: MailMessage): string {
  if (m.text) return m.text.replace(/\s+/g, " ").trim()
  if (m.html) {
    const doc = new DOMParser().parseFromString(m.html, "text/html")
    return (doc.body.textContent || "").replace(/\s+/g, " ").trim()
  }
  return ""
}

export function MessageList() {
  const {
    activeFolder,
    search,
    setSearch,
    visibleMessages,
    selectedMessageId,
    selectMessage,
    markRead,
    toggleFlag,
  } = useMail()

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-border md:max-w-sm lg:max-w-md">
      {/* Search + folder title */}
      <div className="space-y-2 border-b border-border p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search mail…"
            className="pl-9"
            aria-label="Search mail"
          />
        </div>
        <p className="px-0.5 text-xs text-muted-foreground">
          {activeFolder.charAt(0).toUpperCase() + activeFolder.slice(1)}
          {search ? ` · “${search}”` : ""}
          <span className="ml-1 text-[10px] opacity-70">({visibleMessages.length})</span>
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="min-h-0 flex-1">
        {visibleMessages.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground">Nothing here</p>
            <p className="text-xs text-muted-foreground">
              {search ? "No results match your search." : "Pull new mail to get started."}
            </p>
          </div>
        ) : (
          <ul className="py-1">
            {visibleMessages.map((m) => {
              const selected = m.id === selectedMessageId
              return (
                <li key={m.id}>
                  <button
                    onClick={() => {
                      selectMessage(m.id)
                      if (!m.read) markRead(m.id, true)
                    }}
                    className={cn(
                      "group flex w-full flex-col gap-1 border-b border-border/60 px-3 py-2.5 text-left transition-colors",
                      selected ? "bg-accent" : "hover:bg-accent/50"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFlag(m.id)
                        }}
                        className={cn(
                          "flex size-4 flex-shrink-0 items-center justify-center rounded-sm transition-colors",
                          m.flagged ? "text-amber-500" : "text-muted-foreground/40 group-hover:text-muted-foreground"
                        )}
                        role="button"
                        aria-label={m.flagged ? "Unflag" : "Flag"}
                      >
                        <Star className={cn("size-3.5", m.flagged && "fill-current")} />
                      </span>
                      <span className={cn("size-2 flex-shrink-0 rounded-full", m.read ? "bg-transparent" : "bg-primary")} aria-hidden="true" />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13px]",
                          m.read ? "text-muted-foreground" : "font-medium text-foreground"
                        )}
                      >
                        {senderOf(m)}
                      </span>
                      {m.attachments.length > 0 ? (
                        <Paperclip className="size-3 flex-shrink-0 text-muted-foreground/60" aria-label={`${m.attachments.length} attachments`} />
                      ) : null}
                      <span className="flex-shrink-0 text-[11px] text-muted-foreground">{formatTime(m.date)}</span>
                    </div>
                    <div className="flex items-baseline gap-2 pl-6">
                      <span className={cn("min-w-0 flex-1 truncate text-[12px]", m.read ? "text-foreground/70" : "font-medium text-foreground/90")}>
                        {m.subject}
                      </span>
                      <span className="hidden max-w-[40%] truncate text-[11px] text-muted-foreground/70 group-hover:inline">
                        {snippetOf(m).slice(0, 80)}
                      </span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </section>
  )
}