import { Minus, MessageSquareText, PanelLeft, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface StatusBarProps {
  pageLabel?: string
  wordCount: number
  zoom: number
  onZoomChange: (z: number) => void
  outlineVisible: boolean
  commentsVisible: boolean
  onToggleOutline: () => void
  onToggleComments: () => void
  presenceCount: number
  syncLabel?: string
}

const ZOOM_MIN = 0.5
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1

export function StatusBar({
  pageLabel,
  wordCount,
  zoom,
  onZoomChange,
  outlineVisible,
  commentsVisible,
  onToggleOutline,
  onToggleComments,
  presenceCount,
  syncLabel,
}: StatusBarProps) {
  const zoomPct = Math.round(zoom * 100)
  return (
    <div className="flex h-8 shrink-0 select-none items-center gap-1 border-t border-border bg-background px-2 text-xs text-muted-foreground">
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-6 gap-1 px-1.5 text-xs", outlineVisible && "bg-accent text-foreground")}
        onClick={onToggleOutline}
        title="Show outline (Ctrl+Alt+O)"
      >
        <PanelLeft className="size-3.5" />
        Outline
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn("h-6 gap-1 px-1.5 text-xs", commentsVisible && "bg-accent text-foreground")}
        onClick={onToggleComments}
        title="Show comments"
      >
        <MessageSquareText className="size-3.5" />
        Comments
      </Button>
      {presenceCount > 0 && (
        <span className="ml-1 hidden rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary sm:inline">
          {presenceCount} online
        </span>
      )}
      <span className="hidden truncate sm:inline">
        {pageLabel ? `${pageLabel} · ` : ""}
        {wordCount.toLocaleString()} {wordCount === 1 ? "word" : "words"}
      </span>
      {syncLabel && <span className="hidden truncate md:inline"> · {syncLabel}</span>}

      <div className="ms-auto flex items-center gap-0.5">
        <Button variant="ghost" size="sm" className="h-6 w-6 px-0" onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))} title="Zoom out">
          <Minus className="size-3.5" />
        </Button>
        <button
          className="h-6 rounded-md px-1.5 text-xs tabular-nums hover:bg-accent focus-visible:outline-none"
          onClick={() => onZoomChange(1)}
          title="Reset zoom to 100%"
        >
          {zoomPct}%
        </button>
        <Button variant="ghost" size="sm" className="h-6 w-6 px-0" onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))} title="Zoom in">
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}