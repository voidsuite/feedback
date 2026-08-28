import { Link } from "react-router"
import { MessageSquare, CheckCircle2 } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { TypeBadge, StatusBadge } from "./badges"
import type { ThreadSummary } from "@/lib/types"
import { cn } from "@/lib/utils"

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return "just now"
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export function ThreadCard({ thread, showVotes = true }: { thread: ThreadSummary; showVotes?: boolean }) {
  return (
    <Link
      to={`/thread/${thread.id}`}
      className="block rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        <TypeBadge type={thread.type} />
        <StatusBadge status={thread.status} />
        {thread.isPublic && (
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-600 dark:text-violet-400">Public</span>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">{timeAgo(thread.createdAt)}</span>
      </div>

      <h3 className="mt-2 line-clamp-2 font-medium leading-snug">{thread.title}</h3>

      <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Avatar className="size-5">
          <AvatarImage src={thread.author.picture || undefined} alt={thread.author.name} />
          <AvatarFallback className="text-[9px]">{thread.author.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="truncate">{thread.author.name}</span>
        {thread.sourceApp && <span className="text-muted-foreground/70">· {thread.sourceApp}</span>}
        <span className="ml-auto flex items-center gap-3">
          {showVotes && thread.voteCount > 0 && (
            <span className={cn("inline-flex items-center gap-1", thread.hasVoted && "text-primary")}>
              <MessageSquare className="size-3" />
              {thread.voteCount}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3" />
            {thread.messageCount}
          </span>
          {!thread.unanswered && <CheckCircle2 className="size-3 text-emerald-500" />}
        </span>
      </div>
    </Link>
  )
}
