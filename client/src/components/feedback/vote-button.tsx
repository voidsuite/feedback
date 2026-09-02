import * as React from "react"
import { ChevronUp } from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"

export function VoteButton({ threadId, voted, votes, onChange }: { threadId: string; voted: boolean; votes: number; onChange: (next: { voted: boolean; votes: number }) => void }) {
  const [busy, setBusy] = React.useState(false)
  async function toggle() {
    if (busy) return
    setBusy(true)
    try {
      const res = voted ? await api.unvoteThread(threadId) : await api.voteThread(threadId)
      onChange(res)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={cn(
        "flex w-12 flex-col items-center gap-0.5 rounded-lg border py-1.5 text-xs transition-colors",
        voted ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-foreground/20"
      )}
      aria-pressed={voted}
    >
      <ChevronUp className="size-4" />
      {votes}
    </button>
  )
}
