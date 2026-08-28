import * as React from "react"
import { useNavigate } from "react-router"
import { Inbox, HelpCircle, MessageSquareReply, UserCheck, Globe, Users, Bug, Lightbulb, MessagesSquare } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { api, type AdminStats } from "@/lib/api"

function Stat({ label, value, icon: Icon, onClick }: { label: string; value: number; icon: React.ElementType; onClick?: () => void }) {
  return (
    <Card className="cursor-pointer p-4 transition-colors hover:border-foreground/20" onClick={onClick}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <Icon className="size-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </Card>
  )
}

export function AdminDashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = React.useState<AdminStats | null>(null)

  React.useEffect(() => {
    api.getStats()
      .then(setStats)
      .catch(() => {})
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of feedback across the Void suite.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Total" value={stats?.total ?? 0} icon={Inbox} onClick={() => navigate("/admin/inbox")} />
        <Stat label="Open" value={stats?.open ?? 0} icon={HelpCircle} onClick={() => navigate("/admin/inbox?status=open")} />
        <Stat label="Unanswered" value={stats?.unanswered ?? 0} icon={MessageSquareReply} onClick={() => navigate("/admin/inbox?unanswered=1")} />
        <Stat label="Assigned" value={stats?.assigned ?? 0} icon={UserCheck} onClick={() => navigate("/admin/inbox?assignee=me")} />
        <Stat label="Public" value={stats?.publicCount ?? 0} icon={Globe} onClick={() => navigate("/roadmap")} />
        <Stat label="Users" value={stats?.users ?? 0} icon={Users} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">By type</p>
          <div className="space-y-2">
            {([["question", HelpCircle], ["feature", Lightbulb], ["bug", Bug], ["support", MessagesSquare]] as const).map(([k, Icon]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span className="inline-flex items-center gap-2 capitalize text-muted-foreground"><Icon className="size-4" />{k}</span>
                <span className="font-medium">{stats?.byType?.[k] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <p className="mb-3 text-sm font-medium">By status</p>
          <div className="space-y-2">
            {Object.entries(stats?.byStatus ?? {}).map(([k, v]: [string, number]) => (
              <div key={k} className="flex items-center justify-between text-sm">
                <span className="capitalize text-muted-foreground">{k.replace("_", " ")}</span>
                <span className="font-medium">{v}</span>
              </div>
            ))}
            {(!stats || Object.keys(stats.byStatus ?? {}).length === 0) && (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => navigate("/admin/inbox")}>Open inbox</Button>
        <Button variant="outline" onClick={() => navigate("/admin/notifications")}>Configure notifications</Button>
        <Button variant="outline" onClick={() => navigate("/admin/sources")}>App sources</Button>
      </div>
    </div>
  )
}
