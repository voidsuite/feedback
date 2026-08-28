import { Link, Outlet, useLocation, useNavigate } from "react-router"
import { useAuth } from "@/contexts/auth"
import { VoidLogo } from "@/components/VoidLogo"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const navItems = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/apps", label: "Applications" },
  { href: "/admin/tokens", label: "Tokens" },
  { href: "/admin/storage", label: "Storage" },
  { href: "/admin/email", label: "Email" },
  { href: "/admin/health", label: "Health" },
  { href: "/admin/audit-log", label: "Audit Log" },
  { href: "/admin/feature-flags", label: "Feature Flags" },
  { href: "/admin/maintenance", label: "Maintenance" },
]

export function AdminLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate("/login")
  }

  return (
    <div className="min-h-svh flex">
      <aside className="w-56 border-r border-border bg-card p-4 flex flex-col gap-6">
        <Link to="/dashboard" className="inline-flex">
          <VoidLogo size="sm" />
        </Link>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.href
              : location.pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground px-3 mb-2">Admin: {user?.email}</p>
            <Button variant="ghost" size="sm" className="w-full justify-start text-xs text-muted-foreground" onClick={handleLogout}>
              Sign out
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
