/**
 * TableView — all cards in a spreadsheet-style table. Rows are sorted by
 * column position then card position; clicking a row opens the card.
 */

import { Calendar, Paperclip } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PRIORITY_COLORS, PRIORITY_LABELS } from "@/components/board/item-card"
import { initials } from "@/components/workspace-icon"
import { cn } from "@/lib/utils"
import type { Column, Item } from "@/lib/types"

export function TableView({
  columns,
  items,
  onOpen,
}: {
  columns: Column[]
  items: Item[]
  onOpen: (item: Item) => void
}) {
  const columnName = (id: string) => columns.find((c) => c.id === id)?.name ?? "—"
  const sorted = [...items].sort((a, b) => {
    const ca = columns.findIndex((c) => c.id === a.columnId)
    const cb = columns.findIndex((c) => c.id === b.columnId)
    return ca - cb || a.position - b.position || a.createdAt - b.createdAt
  })

  return (
    <div className="voidboard-scrollbar overflow-x-auto rounded-xl border border-border bg-background">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Card</TableHead>
            <TableHead className="min-w-32">Column</TableHead>
            <TableHead>Priority</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Labels</TableHead>
            <TableHead className="pr-4">Assignees</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="h-24 text-center text-sm text-muted-foreground">
                No cards match the current filters.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((item) => (
              <TableRow
                key={item.id}
                onClick={() => onOpen(item)}
                className="cursor-pointer"
              >
                <TableCell className="max-w-72 pl-4">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{item.title}</span>
                    {item.attachmentCount > 0 ? <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="text-xs font-normal">{columnName(item.columnId)}</Badge>
                </TableCell>
                <TableCell>
                  {item.priority === "none" ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <span className={cn("size-2 rounded-full", PRIORITY_COLORS[item.priority])} aria-hidden="true" />
                      {PRIORITY_LABELS[item.priority]}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {item.dueDate ? (
                    <span className={cn("inline-flex items-center gap-1 text-xs", item.dueDate < Date.now() && "font-medium text-destructive")}>
                      <Calendar className="size-3" aria-hidden="true" />
                      {new Date(item.dueDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    {item.labels.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      item.labels.map((l) => (
                        <span key={l.id} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: `${l.color}22`, color: l.color }}>
                          {l.name}
                        </span>
                      ))
                    )}
                  </span>
                </TableCell>
                <TableCell className="pr-4">
                  {item.assignees.length === 0 ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <span className="flex items-center">
                      <span className="flex -space-x-1.5 *:ring-2 *:ring-background">
                        {item.assignees.slice(0, 3).map((a) => (
                          <Avatar key={a.id} size="sm">
                            <AvatarImage src={a.picture || undefined} alt={a.name} />
                            <AvatarFallback className="text-[8px]">{initials(a.name)}</AvatarFallback>
                          </Avatar>
                        ))}
                      </span>
                      {item.assignees.length > 3 ? (
                        <span className="ml-1 text-[10px] text-muted-foreground">+{item.assignees.length - 3}</span>
                      ) : null}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}