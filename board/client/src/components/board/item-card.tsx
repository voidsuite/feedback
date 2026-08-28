/**
 * ItemCard — the draggable card preview: cover, labels, title, checklist
 * progress, due date, assignee stack. Double-click opens the detail dialog.
 */

import * as React from "react"
import { Calendar, MessageSquare, Paperclip } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { initials } from "@/components/workspace-icon"
import { cn } from "@/lib/utils"
import { fileUrl } from "@/lib/api"
import type { Item, ItemPriority } from "@/lib/types"

export const PRIORITY_COLORS: Record<ItemPriority, string> = {
  none: "",
  low: "bg-sky-500",
  medium: "bg-amber-500",
  high: "bg-orange-600",
  urgent: "bg-rose-600",
}

export const PRIORITY_LABELS: Record<ItemPriority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
}

function DueBadge({ dueDate }: { dueDate: number | null }) {
  if (!dueDate) return null
  const overdue = dueDate < Date.now()
  const label = new Date(dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
        overdue ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
      )}
    >
      <Calendar className="size-3" aria-hidden="true" />
      {label}
    </span>
  )
}

export function ItemCard({
  item,
  onOpen,
  onDragStart,
  onDragEnd,
  dragDisabled = false,
}: {
  item: Item
  onOpen: (item: Item) => void
  onDragStart: (e: React.DragEvent, item: Item) => void
  onDragEnd: (e: React.DragEvent) => void
  /** True when cross-view filters are active — reordering a filtered list would corrupt positions. */
  dragDisabled?: boolean
}) {
  const checklist = item.checklists
  const done = checklist.filter((c) => c.done).length

  return (
    <div
      draggable={!dragDisabled}
      onDragStart={dragDisabled ? undefined : (e) => onDragStart(e, item)}
      onDragEnd={dragDisabled ? undefined : onDragEnd}
      onDoubleClick={() => onOpen(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(item)
      }}
      className={cn(
        "group/card rounded-lg border border-border bg-card p-2.5 shadow-sm transition-all hover:border-foreground/20 hover:shadow-md select-none",
        dragDisabled ? "cursor-default" : "cursor-grab active:cursor-grabbing"
      )}
    >
      {item.coverFileId ? (
        <img
          src={fileUrl(item.coverFileId)}
          alt=""
          draggable={false}
          className="mb-2 aspect-video w-full rounded-md object-cover"
        />
      ) : null}

      {item.labels.length > 0 ? (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {item.labels.map((l) => (
            <span
              key={l.id}
              className="inline-flex h-2.5 w-8 items-center rounded-full"
              style={{ background: l.color }}
              aria-label={l.name}
              title={l.name}
            />
          ))}
        </div>
      ) : null}

      <p className="text-sm leading-snug font-medium">{item.title}</p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {item.priority !== "none" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", PRIORITY_COLORS[item.priority])} aria-hidden="true" />
              {PRIORITY_LABELS[item.priority]}
            </span>
          ) : null}
          {item.dueDate ? <DueBadge dueDate={item.dueDate} /> : null}
          {item.attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Paperclip className="size-3" aria-hidden="true" />
              {item.attachmentCount}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {checklist.length > 0 ? (
            <span className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium",
              done === checklist.length ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
            )}>
              <span aria-hidden="true">☑</span>
              {done}/{checklist.length}
            </span>
          ) : null}
          {item.comments.length > 0 ? (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MessageSquare className="size-3" aria-hidden="true" />
              {item.comments.length}
            </span>
          ) : null}
          {item.assignees.length > 0 ? (
            <span className="flex -space-x-1.5 *:ring-1 *:ring-card">
              {item.assignees.slice(0, 3).map((a) => (
                <Avatar key={a.id} size="sm">
                  <AvatarImage src={a.picture || undefined} alt={a.name} />
                  <AvatarFallback className="text-[8px]">{initials(a.name)}</AvatarFallback>
                </Avatar>
              ))}
              {item.assignees.length > 3 ? (
                <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[8px] font-medium text-muted-foreground ring-1 ring-card">
                  +{item.assignees.length - 3}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}