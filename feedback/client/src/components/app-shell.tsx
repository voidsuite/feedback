/**
 * AppShell — the shared frame for every authenticated Void Feedback page:
 * a sticky top bar with the voidfeedback mark, primary nav, and the account
 * menu (settings, admin, sign out).
 */

import * as React from "react"
import { Link, useNavigate } from "react-router"
import { Settings, LogOut, Shield, Plus, Globe, MessagesSquare, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VoidFeedbackLogo } from "@/components/VoidFeedbackLogo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAuth } from "@/contexts/auth"

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate("/login")
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
          <Link to="/" className="rounded-lg px-1.5 py-1 transition-colors hover:bg-accent" aria-label="Void Feedback home">
            <VoidFeedbackLogo size="md" tagline />
          </Link>

          <nav className="ml-2 hidden items-center gap-1 text-sm text-muted-foreground sm:flex">
            <Link to="/" className="rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent hover:text-foreground">
              <span className="inline-flex items-center gap-1.5"><Home className="size-3.5" /> Home</span>
            </Link>
            <Link to="/roadmap" className="rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent hover:text-foreground">
              <span className="inline-flex items-center gap-1.5"><Globe className="size-3.5" /> Roadmap</span>
            </Link>
            <Link to="/support" className="rounded-md px-2.5 py-1.5 transition-colors hover:bg-accent hover:text-foreground">
              <span className="inline-flex items-center gap-1.5"><MessagesSquare className="size-3.5" /> Support</span>
            </Link>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => navigate(user ? "/?compose=1" : "/login")}>
              <Plus className="size-4" /> New
            </Button>
            {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="size-8">
                      <AvatarImage src={user?.picture || undefined} alt={user?.name || "You"} />
                      <AvatarFallback className="text-[10px]">{user ? initials(user.name) : "?"}</AvatarFallback>
                    </Avatar>
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    <div className="truncate text-sm font-medium">{user?.name}</div>
                    <div className="truncate text-xs font-normal text-muted-foreground">{user?.email}</div>
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings className="size-4" /> Settings
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Shield className="size-4" /> Admin
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            ) : (
              <Button variant="outline" size="sm" onClick={() => navigate("/login")}>Sign in</Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 text-xs text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">voidfeedback</span> — feedback &amp; support for the Void suite
          </p>
          <p className="flex items-center gap-2 text-muted-foreground/70">
            <span>Part of</span>
            <a href="https://github.com/voidsuite/board" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Board</a>
            <span>·</span>
            <a href="https://github.com/voidsuite/2fa" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">2FA</a>
            <span>·</span>
            <a href="https://github.com/voidsuite/docs" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Docs</a>
            <span>·</span>
            <a href="https://github.com/voidsuite/mail" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">Mail</a>
            <span>·</span>
            <a href="https://github.com/voidsuite/client" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">VoidAuth</a>
            <span className="text-muted-foreground/30">·</span>
            <span>v0.1.0</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
