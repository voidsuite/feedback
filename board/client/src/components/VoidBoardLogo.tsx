import { cn } from "@/lib/utils"

interface VoidBoardLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
  tagline?: boolean
}

const sizeConfig = {
  sm: { svg: "size-3.5", text: "text-sm", gap: "gap-1.5" },
  md: { svg: "size-4", text: "text-base", gap: "gap-2" },
  lg: { svg: "size-5", text: "text-lg", gap: "gap-2.5" },
}

/** voidboard logo — a kanban mark (three columns, one with a dot) + wordmark. */
export function VoidBoardLogo({ size = "md", className, tagline = false }: VoidBoardLogoProps) {
  const s = sizeConfig[size]
  return (
    <span className={cn("inline-flex items-center font-semibold tracking-tight", s.gap, className)}>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={s.svg}>
        <rect x="3" y="3.5" width="4" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="8" y="7" width="4" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="5" width="4" height="11.5" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="8" y="8.6" width="4" height="2.2" rx="1.1" fill="currentColor" />
      </svg>
      <span className={s.text}>
        voidboard
        {tagline && (
          <span className="ml-1.5 hidden text-xs font-normal text-muted-foreground sm:inline">— Void Board</span>
        )}
      </span>
    </span>
  )
}