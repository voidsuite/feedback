/**
 * FilterBar — cross-view filters: priority, due date, labels, assignees.
 * Empty selection for a dimension means "all". Used by the board, table and
 * list views.
 */

import * as React from "react"
import { Calendar, ListFilter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/components/board/item-card"
import { initials } from "@/components/workspace-icon"
import { cn } from "@/lib/utils"
import type { Item, ItemPriority, Label, WorkspaceMember } from "@/lib/types"

export type DueFilter = "any" | "none" | "overdue" | "today" | "upcoming"

export interface BoardFilters {
  priorities: ItemPriority[]
  labels: string[]
  assignees: string[]
  due: DueFilter
}

export const EMPTY_FILTERS: BoardFilters = { priorities: [], labels: [], assignees: [], due: "any" }

export function matchesFilters(item: Item, f: BoardFilters): boolean {
  if (f.priorities.length > 0 && !f.priorities.includes(item.priority)) return false
  if (f.labels.length > 0 && !item.labels.some((l) => f.labels.includes(l.id))) return false
  if (f.assignees.length > 0 && !item.assignees.some((a) => f.assignees.includes(a.id))) return false
  switch (f.due) {
    case "any":
      return true
    case "none":
      return item.dueDate === null
    case "overdue":
      return item.dueDate !== null && item.dueDate < startOfDay()
    case "today": {
      if (item.dueDate === null) return false
      const d = new Date(item.dueDate)
      const now = new Date()
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    }
    case "upcoming":
      return item.dueDate !== null && item.dueDate >= startOfDay() && item.dueDate < startOfDay() + 7 * 86400000
  }
}

export function activeFilterCount(f: BoardFilters): number {
  return f.priorities.length + f.labels.length + f.assignees.length + (f.due === "any" ? 0 : 1)
}

function startOfDay(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "any", label: "Any due date" },
  { value: "none", label: "No due date" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Due today" },
  { value: "upcoming", label: "Due in 7 days" },
]

const PRIORITIES: ItemPriority[] = ["none", "low", "medium", "high", "urgent"]

function Toggle({
  checked,
  onCheckedChange,
  label,
  icon,
}: {
  checked: boolean
  onCheckedChange: (c: boolean) => void
  label: string
  icon?: React.ReactNode
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
      {icon}
      <span className="flex-1 truncate text-sm">{label}</span>
    </label>
  )
}

export function FilterBar({
  filters,
  onChange,
  labels,
  members,
}: {
  filters: BoardFilters
  onChange: (f: BoardFilters) => void
  labels: Label[]
  members: WorkspaceMember[]
}) {
  const [open, setOpen] = React.useState(false)
  const count = activeFilterCount(filters)

  const toggle = (key: "priorities" | "labels" | "assignees", value: string) => {
    const list = filters[key] as string[]
    onChange({ ...filters, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className={cn("gap-1.5", count > 0 && "border-primary/50 text-foreground")}>
            <ListFilter className="size-3.5" aria-hidden="true" />
            Filters
            {count > 0 ? (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {count}
              </span>
            ) : null}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 p-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-medium text-muted-foreground">Filters</p>
            {count > 0 ? (
              <button className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={() => onChange(EMPTY_FILTERS)}>
                <X className="size-3" aria-hidden="true" />
                Clear all
              </button>
            ) : null}
          </div>

          {/* Priority */}
          <div className="space-y-0.5">
            <p className="px-1 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Priority</p>
            {PRIORITIES.map((p) => (
              <Toggle
                key={p}
                checked={filters.priorities.includes(p)}
                onCheckedChange={() => toggle("priorities", p)}
                label={PRIORITY_LABELS[p]}
                icon={p !== "none" ? <span className={cn("size-2.5 rounded-full", PRIORITY_COLORS[p])} aria-hidden="true" /> : undefined}
              />
            ))}
          </div>

          <Separator />

          {/* Due */}
          <div className="space-y-0.5">
            <p className="px-1 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Due date</p>
            {DUE_OPTIONS.map((d) => (
              <label key={d.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-muted">
                <span className={cn(
                  "flex size-4 items-center justify-center rounded border",
                  filters.due === d.value ? "border-primary bg-primary text-primary-foreground" : "border-input"
                )}>
                  {filters.due === d.value ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="size-3">
                      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <Calendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="flex-1 text-sm">{d.label}</span>
              </label>
            ))}
          </div>

          <Separator />

          {/* Labels */}
          <div className="space-y-0.5">
            <p className="px-1 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Labels</p>
            {labels.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">No labels on this board yet.</p>
            ) : (
              labels.map((l) => (
                <Toggle
                  key={l.id}
                  checked={filters.labels.includes(l.id)}
                  onCheckedChange={() => toggle("labels", l.id)}
                  label={l.name}
                  icon={<span className="size-2.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />}
                />
              ))
            )}
          </div>

          <Separator />

          {/* Assignees */}
          <div className="space-y-0.5">
            <p className="px-1 py-0.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Assignees</p>
            {members.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">No members in this workspace.</p>
            ) : (
              members.map((m) => (
                <Toggle
                  key={m.userId}
                  checked={filters.assignees.includes(m.userId)}
                  onCheckedChange={() => toggle("assignees", m.userId)}
                  label={m.name}
                  icon={
                    <Avatar size="sm">
                      <AvatarImage src={m.picture || undefined} alt={m.name} />
                      <AvatarFallback className="text-[8px]">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                  }
                />
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}