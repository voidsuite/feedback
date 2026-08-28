/**
 * ListView — cards grouped under their column headers, compact rows.
 */

import { Calendar, Paperclip } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials } from "@/components/workspace-icon"
import { cn } from "@/lib/utils"
import type { Column, Item } from "@/lib/types"

export function ListView({
  columns,
  items,
  onOpen,
}: {
  columns: Column[]
  items: Item[]
  onOpen: (item: Item) => void
}) {
  return (
    <div className="voidboard-scrollbar space-y-5 overflow-y-auto">
      {columns.length === 0 ? (
        <p className="text-sm text-muted-foreground">No columns yet.</p>
      ) : (
        columns.map((column) => {
          const columnItems = items
            .filter((i) => i.columnId === column.id)
            .sort((a, b) => a.position - b.position || a.createdAt - b.createdAt)
          return (
            <section key={column.id}>
              <header className="mb-1.5 flex items-center gap-2 px-1">
                <h3 className="text-sm font-semibold">{column.name}</h3>
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{columnItems.length}</span>
              </header>
              {columnItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  No cards here{items.length > 0 ? " — try clearing the filters" : ""}.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  {columnItems.map((item, i) => (
                    <button
                      key={item.id}
                      onClick={() => onOpen(item)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                        i > 0 && "border-t border-border/60"
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</span>
                      {item.labels.length > 0 ? (
                        <span className="flex shrink-0 gap-1">
                          {item.labels.slice(0, 3).map((l) => (
                            <span key={l.id} className="size-2.5 rounded-full" style={{ background: l.color }} aria-label={l.name} title={l.name} />
                          ))}
                        </span>
                      ) : null}
                      {item.priority !== "none" ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          <span className={cn("size-1.5 rounded-full", PRIORITY_DOT[item.priority])} aria-hidden="true" />
                          {PRIORITY_TEXT[item.priority]}
                        </span>
                      ) : null}
                      {item.dueDate ? (
                        <span className={cn("inline-flex shrink-0 items-center gap-1 text-[11px]", item.dueDate < Date.now() && "text-destructive")}>
                          <Calendar className="size-3" aria-hidden="true" />
                          {new Date(item.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      ) : null}
                      {item.attachmentCount > 0 ? <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                      {item.assignees.length > 0 ? (
                        <span className="flex shrink-0 -space-x-1.5 *:ring-2 *:ring-background">
                          {item.assignees.slice(0, 3).map((a) => (
                            <Avatar key={a.id} size="sm">
                              <AvatarImage src={a.picture || undefined} alt={a.name} />
                              <AvatarFallback className="text-[8px]">{initials(a.name)}</AvatarFallback>
                            </Avatar>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )
        })
      )}
    </div>
  )
}

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-sky-500", medium: "bg-amber-500", high: "bg-orange-600", urgent: "bg-rose-600",
}

const PRIORITY_TEXT: Record<string, string> = {
  low: "Low", medium: "Medium", high: "High", urgent: "Urgent",
}