import { cn } from "@/lib/utils"

interface VoidFeedbackLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
  tagline?: boolean
}

const sizeConfig = {
  sm: { svg: "size-3.5", text: "text-sm", gap: "gap-1.5" },
  md: { svg: "size-4", text: "text-base", gap: "gap-2" },
  lg: { svg: "size-6", text: "text-2xl", gap: "gap-2.5" },
}

/** voidfeedback logo — a chat bubble mark + wordmark. */
export function VoidFeedbackLogo({ size = "md", className, tagline = false }: VoidFeedbackLogoProps) {
  const s = sizeConfig[size]
  return (
    <span className={cn("inline-flex items-center font-semibold tracking-tight", s.gap, className)}>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={s.svg}>
        <path
          d="M3.5 5.5c0-1.1.9-2 2-2h9c1.1 0 2 .9 2 2v6c0 1.1-.9 2-2 2H8.5L5.3 16.2c-.5.4-1.3.1-1.3-.6V13.5H5.5c-1.1 0-2-.9-2-2V5.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="7.5" cy="8.7" r="1.1" fill="currentColor" />
        <circle cx="10.3" cy="8.7" r="1.1" fill="currentColor" />
        <circle cx="13.1" cy="8.7" r="1.1" fill="currentColor" />
      </svg>
      <span className={s.text}>
        voidfeedback
        {tagline && (
          <span className="ml-1.5 hidden text-xs font-normal text-muted-foreground sm:inline">— feedback &amp; support</span>
        )}
      </span>
    </span>
  )
}
