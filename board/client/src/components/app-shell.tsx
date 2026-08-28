/**
 * AppShell — the shared frame for every authenticated page: a sticky top
 * bar with the voidboard mark, an optional slot for page actions, and the
 * settings trigger with your avatar.
 */

import * as React from "react"
import { Link } from "react-router"
import { Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VoidBoardLogo } from "@/components/VoidBoardLogo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { SettingsSheet } from "@/components/settings-sheet"
import { useAuth } from "@/contexts/auth"
import { initials } from "@/components/workspace-icon"

export function AppShell({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) {
  const { user } = useAuth()
  const [settingsOpen, setSettingsOpen] = React.useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Link
            to="/"
            className="rounded-lg px-1.5 py-1 transition-colors hover:bg-accent"
            aria-label="VoidBoard home"
          >
            <VoidBoardLogo size="md" tagline />
          </Link>
          {actions ? <div className="ml-auto flex items-center gap-1.5">{actions}</div> : null}
          <div className={actions ? "flex items-center gap-1.5" : "ml-auto flex items-center gap-1.5"}>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 text-muted-foreground"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="size-4" />
            </Button>
            <Avatar className="size-8">
              <AvatarImage src={user?.picture || undefined} alt={user?.name || "You"} />
              <AvatarFallback className="text-[10px]">{initials(user?.name || "?")}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>

      <footer className="border-t border-border py-6">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">voidboard</span> — kanban for the VoidSuite family
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>·</span>
            <a
              href={`${import.meta.env.VITE_FEEDBACK_URL || "https://feedback.stwupid.tech"}?source=board`}
              className="hover:text-foreground"
            >
              Feedback
            </a>
            <span>·</span>
            <span className="text-muted-foreground/70">v0.1.0</span>
          </div>
        </div>
      </footer>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}