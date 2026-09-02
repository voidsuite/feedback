import { HelpCircle, Lightbulb, Bug, MessagesSquare, CircleDot, CheckCircle2 } from "lucide-react"
import type { ThreadType, ThreadStatus, ThreadPriority } from "@/lib/types"
import { STATUS_LABEL, PRIORITY_LABEL } from "@/lib/types"
import { cn } from "@/lib/utils"

const TYPE_STYLE: Record<ThreadType, { icon: typeof HelpCircle; className: string }> = {
  question: { icon: HelpCircle, className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  feature: { icon: Lightbulb, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  bug: { icon: Bug, className: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  support: { icon: MessagesSquare, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
}

const STATUS_STYLE: Record<ThreadStatus, string> = {
  open: "bg-muted text-foreground",
  in_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  planned: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  in_progress: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  answered: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  shipped: "bg-green-600/10 text-green-600 dark:text-green-400",
  closed: "bg-muted text-muted-foreground",
}

const PRIORITY_STYLE: Record<ThreadPriority, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-muted text-foreground",
  high: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  urgent: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
}

export function TypeBadge({ type, className }: { type: ThreadType; className?: string }) {
  const s = TYPE_STYLE[type]
  const Icon = s.icon
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", s.className, className)}>
      <Icon className="size-3" />
      {type === "feature" ? "Feature" : type === "support" ? "Support" : type[0].toUpperCase() + type.slice(1)}
    </span>
  )
}

export function StatusBadge({ status, className }: { status: ThreadStatus; className?: string }) {
  const isResolved = status === "answered" || status === "shipped" || status === "closed"
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS_STYLE[status], className)}>
      {isResolved ? <CheckCircle2 className="mr-1 size-2.5" /> : <CircleDot className="mr-1 size-2.5" />}
      {STATUS_LABEL[status]}
    </span>
  )
}

export function PriorityBadge({ priority, className }: { priority: ThreadPriority; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORITY_STYLE[priority], className)}>
      {PRIORITY_LABEL[priority]}
    </span>
  )
}
