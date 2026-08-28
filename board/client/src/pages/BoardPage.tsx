/**
 * BoardPage — the kanban. Horizontal column strip with native DnD between
 * columns, inline card composer, and a full card editor dialog.
 */

import * as React from "react"
import { Link, useParams } from "react-router"
import { ArrowLeft, LayoutGrid, List, Loader2, Plus, Share2, Table2, Wifi, WifiOff, type LucideIcon } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { PromptDialog } from "@/components/prompt-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { BoardColumn, type DragState } from "@/components/board/board-column"
import { ItemDialog, BoardContext } from "@/components/board/item-dialog"
import { AvatarPicker } from "@/components/avatar-picker"
import { FilterBar, EMPTY_FILTERS, activeFilterCount, matchesFilters, type BoardFilters } from "@/components/board/filter-bar"
import { TableView } from "@/components/board/table-view"
import { ListView } from "@/components/board/list-view"
import { ShareDialog } from "@/components/share-dialog"
import { useBoard } from "@/lib/use-board"
import { useAuth } from "@/contexts/auth"
import { useToast } from "@/contexts/toast"
import { cn } from "@/lib/utils"
import type { Column, Item } from "@/lib/types"

type View = "board" | "table" | "list"

const VIEWS: { id: View; icon: LucideIcon; label: string }[] = [
  { id: "board", icon: LayoutGrid, label: "Board view" },
  { id: "table", icon: Table2, label: "Table view" },
  { id: "list", icon: List, label: "List view" },
]

interface ColumnMenu {
  action: "rename" | "wip"
  column: Column
}

export function BoardPage() {
  const { boardId = "" } = useParams()
  const board = useBoard(boardId)
  const { user } = useAuth()
  const { toast } = useToast()

  const [dragState, setDragState] = React.useState<DragState | null>(null)
  const [openItemId, setOpenItemId] = React.useState<string | null>(null)
  const [columnMenu, setColumnMenu] = React.useState<ColumnMenu | null>(null)
  const [deletingColumn, setDeletingColumn] = React.useState<Column | null>(null)
  const [deletingItem, setDeletingItem] = React.useState<Item | null>(null)
  const [createColumnOpen, setCreateColumnOpen] = React.useState(false)
  const [renameBoardOpen, setRenameBoardOpen] = React.useState(false)
  const [view, setView] = React.useState<View>("board")
  const [filters, setFilters] = React.useState<BoardFilters>(EMPTY_FILTERS)
  const [shareOpen, setShareOpen] = React.useState(false)

  const openItem = openItemId ? board.item(openItemId) : undefined
  const filtersActive = activeFilterCount(filters) > 0
  // Every card across the board, then narrowed by the active filters. The
  // board view additionally filters per-column; table/list use this flat list.
  const visibleItems = board.columns.flatMap((c) => board.itemsIn(c.id)).filter((i) => matchesFilters(i, filters))

  // Owner/admins can change the board avatar; everyone else just sees it.
  const boardRole = board.workspace?.members.find((m) => m.userId === user?.id)?.role
  const canManageBoard = boardRole === "owner" || boardRole === "admin"

  // Clear the drag state when a native drag ends outside a drop target.
  React.useEffect(() => {
    const clear = () => setDragState(null)
    window.addEventListener("dragend", clear)
    return () => window.removeEventListener("dragend", clear)
  }, [])

  // --- column helpers ---

  const run = (p: Promise<unknown>, fail: string): void => {
    p.catch((e: unknown) => toast({ title: fail, description: e instanceof Error ? e.message : undefined, variant: "destructive" }))
  }

  const addColumn = async (name: string) => {
    try {
      await board.createColumn(name)
    } catch (e) {
      toast({ title: "Couldn't add column", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const renameColumn = async (name: string) => {
    if (!columnMenu || columnMenu.action !== "rename") return
    const { column } = columnMenu
    try {
      await board.renameColumn(column.id, name)
    } catch (e) {
      toast({ title: "Couldn't rename column", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const renameBoard = async (name: string) => {
    try {
      await board.renameBoard(name)
    } catch (e) {
      toast({ title: "Couldn't rename board", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const setBoardAvatar = async (file: File) => {
    try {
      await board.setBoardAvatar(file)
      toast({ title: "Board photo updated", variant: "success" })
    } catch (e) {
      toast({ title: "Couldn't update photo", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const removeBoardAvatar = async () => {
    try {
      await board.setBoardAvatar(null)
      toast({ title: "Board photo removed", variant: "success" })
    } catch (e) {
      toast({ title: "Couldn't remove photo", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const dropCard = (itemId: string, columnId: string, index: number) => {
    run(board.moveItem(itemId, columnId, index), "Couldn't move card")
  }

  const addCard = async (columnId: string, title: string) => {
    try {
      await board.createItem(columnId, title)
    } catch (e) {
      toast({ title: "Couldn't add card", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
  }

  const deleteColumn = async () => {
    if (!deletingColumn) return
    try {
      await board.deleteColumn(deletingColumn.id)
      if (openItemId) {
        const it = board.item(openItemId)
        if (it?.columnId === deletingColumn.id) setOpenItemId(null)
      }
    } catch (e) {
      toast({ title: "Couldn't delete column", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
      throw e
    }
  }

  const deleteItem = async (item: Item) => {
    setOpenItemId(null)
    try {
      await board.deleteItem(item.id)
    } catch (e) {
      toast({ title: "Couldn't delete card", description: e instanceof Error ? e.message : undefined, variant: "destructive" })
    }
    setDeletingItem(null)
  }

  // --- states ---

  if (board.status === "loading") {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <LayoutGrid className="size-7 animate-pulse text-muted-foreground" aria-hidden="true" />
        <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Loading board" />
      </div>
    )
  }

  if (board.status === "error" || !board.board) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="font-medium">{board.error || "Board not found"}</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          It may have been deleted, or you no longer have access to it.
        </p>
        <Link to="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="size-3.5" />
            Back to workspaces
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
        <Link
          to={`/w/${board.workspace?.id}`}
          className="inline-flex max-w-52 items-center gap-1 truncate rounded-lg px-1.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{board.workspace?.name ?? "Workspace"}</span>
        </Link>
        <span className="text-muted-foreground/40" aria-hidden="true">/</span>
        <AvatarPicker
          fileId={board.board.avatarFileId}
          name={board.board.name}
          seed={board.board.id}
          size="sm"
          canEdit={canManageBoard}
          onUpload={setBoardAvatar}
          onRemove={removeBoardAvatar}
        />
        <button
          onClick={() => setRenameBoardOpen(true)}
          className="min-w-0 truncate rounded-lg px-1.5 py-1 text-left text-sm font-semibold transition-colors hover:bg-accent"
          title="Rename board"
        >
          {board.board.name}
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          {/* View switcher */}
          <div className="hidden items-center gap-0.5 rounded-lg bg-muted p-0.5 sm:flex" role="group" aria-label="View">
            {VIEWS.map((v) => {
              const Icon = v.icon
              const active = view === v.id
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setView(v.id)}
                  aria-pressed={active}
                  title={v.label}
                  className={cn(
                    "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
                    active && "bg-background text-foreground shadow-sm"
                  )}
                >
                  <Icon className="size-3.5" aria-hidden="true" />
                </button>
              )
            })}
          </div>

          <FilterBar
            filters={filters}
            onChange={setFilters}
            labels={board.labels}
            members={board.workspace?.members ?? []}
          />

          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShareOpen(true)}>
            <Share2 className="size-3.5" aria-hidden="true" />
            Share
          </Button>

          <PresenceBadge state={board.socketState} online={board.presence.filter((p) => p.userId !== user?.id).length} />
          <span className="hidden rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground sm:inline">
            {visibleItems.length} {visibleItems.length === 1 ? "card" : "cards"}
          </span>
        </div>
      </header>

      {/* View body */}
      <BoardContext.Provider value={board}>
        {view === "board" ? (
          <div className="vb-board-columns voidboard-scrollbar flex-1 overflow-x-auto overflow-y-hidden px-4 py-4">
            {board.columns.length === 0 ? (
              <div className="flex h-full min-h-full items-center justify-center">
                <div className="text-center">
                  <LayoutGrid className="mx-auto size-8 text-muted-foreground/40" aria-hidden="true" />
                  <p className="mt-3 font-medium">This board is empty</p>
                  <p className="mt-1 text-sm text-muted-foreground">Add a column to start organizing cards.</p>
                  <Button className="mt-4" size="sm" onClick={() => setCreateColumnOpen(true)}>
                    <Plus className="size-3.5" />
                    Add column
                  </Button>
                </div>
              </div>
            ) : (
            <div className="flex h-full min-h-full items-start gap-3">
              {board.columns.map((column) => (
                <BoardColumn
                  key={column.id}
                  column={column}
                  items={board.itemsIn(column.id).filter((i) => matchesFilters(i, filters))}
                  wipVisible
                  dragState={filtersActive ? null : dragState}
                  dragDisabled={filtersActive}
                  onDropCard={dropCard}
                  onItemDragStart={(item, columnId) => {
                    if (filtersActive) return
                    setDragState({ itemId: item.id, fromColumnId: columnId, sourceIndex: board.itemsIn(columnId).findIndex((i) => i.id === item.id) })
                  }}
                  onOpen={(item) => setOpenItemId(item.id)}
                  onAddCard={addCard}
                  onDeleteColumn={(c) => setDeletingColumn(c)}
                  onDeleteItem={(item) => setDeletingItem(item)}
                  onMenuAction={(action, column) => {
                    if (action === "clear-wip") {
                      run(board.setColumnWip(column.id, null), "Couldn't update WIP limit")
                    } else {
                      setColumnMenu({ action, column })
                    }
                  }}
                />
              ))}

              <button
                onClick={() => setCreateColumnOpen(true)}
                className="flex h-12 w-72 shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/50 hover:text-foreground"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add column
              </button>
            </div>
            )}
          </div>
        ) : (
          <div className="voidboard-scrollbar flex-1 overflow-y-auto px-4 py-4">
            {view === "table" ? (
              <TableView columns={board.columns} items={visibleItems} onOpen={(item) => setOpenItemId(item.id)} />
            ) : (
              <ListView columns={board.columns} items={visibleItems} onOpen={(item) => setOpenItemId(item.id)} />
            )}
          </div>
        )}

        {/* Card editor */}
        {openItem ? (
          <ItemDialog
            key={openItem.id}
            item={openItem}
            open
            onOpenChange={(o) => { if (!o) setOpenItemId(null) }}
            onDelete={deleteItem}
          />
        ) : null}
      </BoardContext.Provider>

      {/* Create column */}
      <PromptDialog
        open={createColumnOpen}
        onOpenChange={setCreateColumnOpen}
        title="New column"
        label="Column name"
        placeholder="e.g. In Progress"
        submitLabel="Add column"
        onSubmit={addColumn}
      />

      {/* Rename column */}
      <PromptDialog
        open={columnMenu?.action === "rename"}
        onOpenChange={(o) => { if (!o) setColumnMenu(null) }}
        title="Rename column"
        label="Column name"
        defaultValue={columnMenu?.column.name ?? ""}
        submitLabel="Save"
        onSubmit={renameColumn}
      />

      {/* WIP limit */}
      <WipDialog
        open={columnMenu?.action === "wip"}
        column={columnMenu?.column ?? null}
        onOpenChange={(o) => { if (!o) setColumnMenu(null) }}
        onSave={(wip) => {
          if (!columnMenu) return
          run(board.setColumnWip(columnMenu.column.id, wip), "Couldn't set WIP limit")
        }}
      />

      {/* Rename board */}
      <PromptDialog
        open={renameBoardOpen}
        onOpenChange={setRenameBoardOpen}
        title="Rename board"
        label="Board name"
        defaultValue={board.board.name}
        submitLabel="Save"
        onSubmit={renameBoard}
      />

      {/* Delete column */}
      <ConfirmDialog
        open={deletingColumn !== null}
        onOpenChange={(o) => { if (!o) setDeletingColumn(null) }}
        title="Delete this column?"
        description={`“${deletingColumn?.name ?? ""}” and every card in it will be permanently removed.`}
        onConfirm={deleteColumn}
      />

      {/* Delete card (context menu) */}
      <ConfirmDialog
        open={deletingItem !== null}
        onOpenChange={(o) => { if (!o) setDeletingItem(null) }}
        title="Delete this card?"
        description={`“${deletingItem?.title ?? ""}” will be permanently removed.`}
        confirmLabel="Delete card"
        onConfirm={() => { if (deletingItem) void deleteItem(deletingItem) }}
      />

      {/* Share */}
      <ShareDialog workspace={board.workspace ?? null} open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  )
}

/** Live-connection + online-members indicator shown in the board header. */
function PresenceBadge({ state, online }: { state: "connecting" | "open" | "offline"; online: number }) {
  const offline = state === "offline"
  const connecting = state === "connecting"
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <span className="relative flex size-2" aria-hidden="true">
              <span className={cn(
                "absolute inline-flex size-full rounded-full",
                offline ? "bg-destructive/60" : "bg-emerald-500/60",
                !offline && "animate-ping opacity-75"
              )} />
              <span className={cn("relative inline-flex size-2 rounded-full", offline ? "bg-destructive" : connecting ? "bg-amber-500" : "bg-emerald-500")} />
            </span>
            {offline ? <WifiOff className="size-3" /> : connecting ? <Loader2 className="size-3 animate-spin" /> : <Wifi className="size-3" />}
            {online > 0 ? `${online} online` : offline ? "offline" : "live"}
          </span>
        }
      />
      <TooltipContent>
        {offline
          ? "Reconnecting… changes will sync when you're back online"
          : connecting
            ? "Connecting…"
            : `${online} ${online === 1 ? "person is" : "people are"} viewing this board right now`}
      </TooltipContent>
    </Tooltip>
  )
}

/** WIP limit editor dialog (numeric, empty = unlimited). */
function WipDialog({
  open,
  column,
  onOpenChange,
  onSave,
}: {
  open: boolean
  column: Column | null
  onOpenChange: (open: boolean) => void
  onSave: (wip: number | null) => void
}) {
  const [value, setValue] = React.useState("")
  React.useEffect(() => {
    if (open) setValue(column?.wipLimit != null ? String(column.wipLimit) : "")
  }, [open, column])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = value.trim()
    if (n === "") {
      onSave(null)
    } else {
      const num = Number(n)
      if (Number.isInteger(num) && num >= 0) onSave(num)
      else return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>WIP limit</DialogTitle>
          <DialogDescription>Max cards allowed in “{column?.name ?? ""}”. Empty to remove.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wip-input">Limit</Label>
            <Input
              id="wip-input"
              inputMode="numeric"
              value={value}
              placeholder="Unlimited"
              autoFocus
              onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className={cn(value.trim() === "" && "text-foreground")}>Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}