import { HugeiconsIcon } from "@hugeicons/react"
import { CloudIcon, AlertCircle, CheckmarkCircle01Icon } from "@hugeicons/core-free-icons"

type SyncState = "synced" | "syncing" | "error" | "idle"

interface SyncStatusProps {
  state: SyncState
  lastSync: number | null
}

export function SyncStatus({ state, lastSync }: SyncStatusProps) {
  const colors = {
    synced: "text-emerald-500",
    syncing: "text-primary animate-pulse",
    error: "text-destructive",
    idle: "text-muted-foreground",
  }
  const icons = {
    synced: CheckmarkCircle01Icon,
    syncing: CloudIcon,
    error: AlertCircle,
    idle: CloudIcon,
  }
  const labels = {
    synced: "Synced",
    syncing: "Syncing...",
    error: "Sync failed",
    idle: "Not synced",
  }
  const Icon = icons[state]

  return (
    <div className={`flex items-center gap-1.5 text-xs ${colors[state]}`}>
      <HugeiconsIcon icon={Icon} className="size-3.5" />
      <span>{labels[state]}</span>
      {lastSync && (
        <span className="ml-1 text-muted-foreground">
          {new Date(lastSync).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  )
}
