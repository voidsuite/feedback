import { cn } from "@/lib/utils"

interface VoidLogoProps {
  size?: "sm" | "md" | "lg"
  className?: string
}

const sizeConfig = {
  sm: { svg: "size-3.5", text: "text-sm", gap: "gap-1.5" },
  md: { svg: "size-4", text: "text-base", gap: "gap-2" },
  lg: { svg: "size-5", text: "text-lg", gap: "gap-2.5" },
}

export function VoidLogo({ size = "md", className }: VoidLogoProps) {
  const s = sizeConfig[size]
  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold tracking-tight",
        s.gap,
        className
      )}
    >
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className={s.svg}>
        <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="10" cy="10" r="2.5" fill="currentColor" />
      </svg>
      <span className={s.text}>AuthioV</span>
    </span>
  )
}
