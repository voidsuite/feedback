import * as React from "react"
import { cn } from "@/lib/utils"

/** 1pt = 96/72 px at 100% zoom */
export const PX_PER_PT = 4 / 3

interface RulerProps {
  /** Total page width including margins, in pt. */
  pageWidthPt: number
  marginsPt: number
  zoom: number
  onMarginsChange: (pt: number) => void
  className?: string
}

/**
 * Horizontal ruler matching the Docs look — ticks every 10pt (major every
 * 60pt), draggable margin markers on each side.
 */
export function Ruler({ pageWidthPt, marginsPt, zoom, onMarginsChange, className }: RulerProps) {
  const scale = PX_PER_PT * zoom
  const widthPx = Math.round(pageWidthPt * scale)
  const contentStartPx = Math.round(marginsPt * scale)
  const contentEndPx = widthPx - contentStartPx

  const dragging = React.useRef<"left" | "right" | null>(null)

  const handlePointer = React.useCallback(
    (e: React.PointerEvent, side: "left" | "right") => {
      e.preventDefault()
      dragging.current = side
      const move = (ev: PointerEvent) => {
        const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
        const x = ev.clientX - rect.left
        const pt = Math.max(28, Math.min(180, x / scale))
        onMarginsChange(Math.round(pt))
      }
      const up = () => {
        dragging.current = null
        window.removeEventListener("pointermove", move)
        window.removeEventListener("pointerup", up)
      }
      window.addEventListener("pointermove", move)
      window.addEventListener("pointerup", up)
    },
    [onMarginsChange, scale]
  )

  const ticks: React.ReactNode[] = []
  for (let pt = 0; pt <= pageWidthPt; pt += 10) {
    const major = pt % 60 === 0
    ticks.push(
      <div
        key={pt}
        className="absolute top-0 bg-muted-foreground/40"
        style={{ left: Math.round(pt * scale), width: 1, height: major ? 10 : 5 }}
      />
    )
    if (major && pt > 0) {
      ticks.push(
        <div
          key={`l${pt}`}
          className="absolute top-2.5 text-[8px] leading-none text-muted-foreground/60"
          style={{ left: Math.round(pt * scale) + 2 }}
        >
          {pt}
        </div>
      )
    }
  }

  return (
    <div
      className={cn("relative h-7 shrink-0 touch-none select-none overflow-hidden", className)}
      style={{ width: widthPx }}
      onPointerLeave={() => (dragging.current = null)}
    >
      {ticks}
      {/* margin markers */}
      <div
        className="absolute top-0 z-10 h-full w-1.5 cursor-ew-resize rounded-sm bg-accent-foreground/25 hover:bg-accent-foreground/50"
        style={{ left: contentStartPx - 3 }}
        onPointerDown={(e) => handlePointer(e, "left")}
        title="Drag to change left margin"
      />
      <div
        className="absolute top-0 z-10 h-full w-1.5 cursor-ew-resize rounded-sm bg-accent-foreground/25 hover:bg-accent-foreground/50"
        style={{ left: contentEndPx - 3 }}
        onPointerDown={(e) => handlePointer(e, "right")}
        title="Drag to change right margin"
      />
    </div>
  )
}