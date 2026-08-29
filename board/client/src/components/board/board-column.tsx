/**
 * BoardColumn — one kanban column: header with count/WIP + menu, the card
 * list (native HTML5 drag & drop with an insertion line), and an inline
 * "add card" composer.
 */

import * as React from "react"
import { MoreHorizontal, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { ItemCard } from "@/components/board/item-card"
import { cn } from "@/lib/utils"
import type { Column, Item } from "@/lib/types"

export interface DragState {
  itemId: string
  fromColumnId: string
  sourceIndex: number
}

export function BoardColumn({
  column,
  items,
  wipVisible,
  dragState,
  onDropCard,
  onItemDragStart,
  onOpen,
  onAddCard,
  onDeleteColumn,
  onDeleteItem,
  onMenuAction,
  dragDisabled = false,
}: {
  column: Column
  items: Item[]
  wipVisible: boolean
  dragState: DragState | null
  onDropCard: (itemId: string, columnId: string, index: number) => void
  onItemDragStart: (item: Item, columnId: string) => void
  onOpen: (item: Item) => void
  onAddCard: (columnId: string, title: string) => Promise<void>
  onDeleteColumn: (column: Column) => void
  onDeleteItem: (item: Item) => void
  onMenuAction: (action: "rename" | "wip" | "clear-wip", column: Column) => void
  /** True when filters are active — cards are not draggable then. */
  dragDisabled?: boolean
}) {
  const [dragOver, setDragOver] = React.useState(false)
  const [dropIndex, setDropIndex] = React.useState<number | null>(null)
  const [composing, setComposing] = React.useState(false)
  const [draft, setDraft] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const listRef = React.useRef<HTMLDivElement>(null)

  const isSource = dragState?.fromColumnId === column.id

  const computeDropIndex = (clientY: number): number => {
    const el = listRef.current
    if (!el) return items.length
    const rect = el.getBoundingClientRect()
    const y = clientY - rect.top
    if (items.length === 0) return 0
    const ratio = Math.min(1, Math.max(0, y / rect.height))
    return Math.round(ratio * items.length)
  }

  const onDragOver = (e: React.DragEvent) => {
    if (!dragState) return
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    const index = computeDropIndex(e.clientY)
    setDragOver(true)
    setDropIndex(index)
  }

  const onDragLeave = (e: React.DragEvent) => {
    if (!listRef.current?.contains(e.relatedTarget as Node)) {
      setDragOver(false)
      setDropIndex(null)
    }
  }

  const onDrop = (e: React.DragEvent) => {
    if (!dragState) return
    e.preventDefault()
    const id = e.dataTransfer.getData("text/plain") || dragState.itemId
    const index = dropIndex ?? items.length
    setDragOver(false)
    setDropIndex(null)
    onDropCard(id, column.id, index)
  }

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const title = draft.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      await onAddCard(column.id, title)
      setDraft("")
      setComposing(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <section
            data-slot="vb-column"
            className={cn(
              "vb-column w-72 shrink-0 rounded-xl border border-border bg-muted/40",
              isSource && dragState && "opacity-90",
              dragOver && "vb-drag-over border-primary/60 bg-primary/5"
            )}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
      {/* Header */}
      <header className="flex items-center gap-2 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-semibold">{column.name}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="rounded-md bg-muted px-1.5 py-0.5">{items.length}</span>
            {column.wipLimit !== null && wipVisible ? (
              <span className={cn("rounded-md px-1.5 py-0.5", items.length > column.wipLimit ? "bg-destructive/10 text-destructive" : "bg-muted")}>
                / {column.wipLimit}
              </span>
            ) : null}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="icon-xs" className="size-6 shrink-0 text-muted-foreground" aria-label={`Menu for ${column.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onMenuAction("rename", column)}>
              Rename column
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onMenuAction("wip", column)}>
              {column.wipLimit !== null ? "Change WIP limit" : "Set WIP limit"}
            </DropdownMenuItem>
            {column.wipLimit !== null ? (
              <DropdownMenuItem onClick={() => onMenuAction("clear-wip", column)}>
                Remove WIP limit
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDeleteColumn(column)}>
              Delete column
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Cards */}
      <div ref={listRef} className="vb-column-list px-2 pb-2">
        {items.length === 0 ? (
          <div
            className={cn(
              "flex h-24 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground",
              dragOver && "border-primary/50 text-primary"
            )}
          >
            {dragOver ? "Release to drop" : "No cards"}
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <React.Fragment key={item.id}>
                {dropIndex === i && dragOver ? <DropLine /> : null}
                <ContextMenu>
                  <ContextMenuTrigger
                    render={
                      <ItemCard
                        item={item}
                        onOpen={onOpen}
                        dragDisabled={dragDisabled}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", item.id)
                          e.dataTransfer.effectAllowed = "move"
                          onItemDragStart(item, column.id)
                        }}
                        onDragEnd={() => {
                          setDragOver(false)
                          setDropIndex(null)
                        }}
                      />
                    }
                  />
                  <ContextMenuContent className="w-40">
                    <ContextMenuItem onClick={() => onOpen(item)}>Open card</ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={() => onDeleteItem(item)}>Delete card</ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </React.Fragment>
            ))}
            {dropIndex === items.length && dragOver ? <DropLine /> : null}
          </div>
        )}
      </div>

      {/* Composer */}
      <footer className="px-2 pb-2">
        {composing ? (
          <form onSubmit={submit} className="space-y-1.5 rounded-lg border border-border bg-card p-2">
            <textarea
              autoFocus
              value={draft}
              rows={2}
              maxLength={500}
              placeholder="Card title…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setComposing(false)
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              className="w-full resize-none rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center gap-1.5">
              <Button type="submit" size="xs" disabled={!draft.trim() || busy}>Add card</Button>
              <Button type="button" variant="ghost" size="icon-xs" className="size-6 text-muted-foreground" aria-label="Cancel"
                onClick={() => { setComposing(false); setDraft("") }}>
                <X className="size-3.5" />
              </Button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="size-4" aria-hidden="true" />
            Add a card
          </button>
        )}
      </footer>
          </section>
        }
      />
      <ContextMenuContent className="w-44">
        <ContextMenuItem onClick={() => onMenuAction("rename", column)}>
          Rename column
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onMenuAction("wip", column)}>
          {column.wipLimit !== null ? "Change WIP limit" : "Set WIP limit"}
        </ContextMenuItem>
        {column.wipLimit !== null ? (
          <ContextMenuItem onClick={() => onMenuAction("clear-wip", column)}>
            Remove WIP limit
          </ContextMenuItem>
        ) : null}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={() => onDeleteColumn(column)}>
          Delete column
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function DropLine() {
  return <div className="h-0.5 rounded-full bg-primary/80" aria-hidden="true" />
}