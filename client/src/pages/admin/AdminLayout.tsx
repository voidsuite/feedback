import { NavLink, Outlet, useNavigate } from "react-router"
import { LayoutDashboard, Inbox, Bell, LayoutGrid, ExternalLink } from "lucide-react"
import { VoidFeedbackLogo } from "@/components/VoidFeedbackLogo"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/auth"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/inbox", label: "Inbox", icon: Inbox, end: false },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, end: false },
  { to: "/admin/sources", label: "Apps & sources", icon: LayoutGrid, end: false },
]

export function AdminLayout() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border p-4 md:flex">
        <button onClick={() => navigate("/")} className="mb-6 flex items-center justify-between rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-accent">
          <VoidFeedbackLogo size="md" tagline />
        </button>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                )
              }
            >
              <n.icon className="size-4" /> {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-2 pt-4">
          <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => navigate("/")}>
            <ExternalLink className="size-3.5" /> View site
          </Button>
          <p className="px-1 text-xs text-muted-foreground">Signed in as {user?.name}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-background/85 px-4 py-3 backdrop-blur md:hidden">
          <VoidFeedbackLogo size="sm" />
        </header>
        <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-4 py-2 md:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cn("rounded-md px-3 py-1.5 text-sm", isActive ? "bg-accent text-foreground" : "text-muted-foreground")}>
              <n.icon className="mr-1 inline size-3.5" />{n.label}
            </NavLink>
          ))}
        </div>
        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
