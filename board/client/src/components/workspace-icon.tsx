/**
 * WorkspaceIcon — a deterministic colored tile with initials, used for
 * workspace cards. The hue is derived from the id hash so each workspace
 * keeps a stable identity across renders and clients.
 */

import { cn } from "@/lib/utils"

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "?"
  )
}

const PALETTE = [
  "bg-stone-700/90 text-stone-100",
  "bg-violet-600/90 text-violet-50",
  "bg-emerald-600/90 text-emerald-50",
  "bg-amber-600/90 text-amber-50",
  "bg-sky-600/90 text-sky-50",
  "bg-rose-600/90 text-rose-50",
]

export function hashHue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % PALETTE.length
}

export function WorkspaceIcon({
  id,
  name,
  className,
  size = "md",
}: {
  id: string
  name: string
  className?: string
  size?: "sm" | "md" | "lg"
}) {
  const sizes = { sm: "size-7 text-[10px]", md: "size-9 text-xs", lg: "size-12 text-sm" }
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-xl font-semibold",
        PALETTE[hashHue(id)],
        sizes[size],
        className
      )}
    >
      {initials(name)}
    </span>
  )
}

export const AVATAR_PALETTE = [
  "bg-stone-600/80 text-stone-50",
  "bg-violet-600/80 text-violet-50",
  "bg-emerald-600/80 text-emerald-50",
  "bg-amber-600/80 text-amber-50",
  "bg-sky-600/80 text-sky-50",
  "bg-rose-600/80 text-rose-50",
]

export function avatarHue(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length]
}