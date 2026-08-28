/**
 * Settings sheet — theme, accent, and your account (sign out).
 * Mirrors the VoidAuth design language (warm stone, ring-dot logo accents).
 */

import { Check, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Separator } from "@/components/ui/separator"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useAuth } from "@/contexts/auth"
import { useTheme, type Accent } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

const THEMES: { id: "dark" | "light" | "system"; label: string }[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "System" },
]

const ACCENT_LABELS: Record<Accent, string> = {
  stone: "Stone",
  violet: "Violet",
  emerald: "Emerald",
  amber: "Amber",
  sky: "Sky",
  rose: "Rose",
}

const ACCENT_SWATCHES: Record<Accent, string> = {
  stone: "#78716c",
  violet: "#8b5cf6",
  emerald: "#10b981",
  amber: "#d97706",
  sky: "#0ea5e9",
  rose: "#f43f5e",
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?"
}

export function SettingsSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user, signOut } = useAuth()
  const { theme, setTheme, accent, setAccent } = useTheme()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[340px] sm:max-w-[340px]">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>Theme, accent and your account.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">
          {/* Theme */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Theme</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {THEMES.map((t) => (
                <Button
                  key={t.id}
                  variant={theme === t.id ? "secondary" : "outline"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setTheme(t.id)}
                >
                  {theme === t.id && <Check className="size-3 me-1" />}
                  {t.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Accent */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">Accent</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {Object.keys(ACCENT_LABELS).map((a) => {
                const id = a as Accent
                return (
                  <Button
                    key={id}
                    variant="outline"
                    size="sm"
                    className={cn("h-8 gap-1.5 text-xs", accent === id && "border-primary ring-1 ring-primary")}
                    onClick={() => setAccent(id)}
                  >
                    <span className="size-3 rounded-full" style={{ background: ACCENT_SWATCHES[id] }} aria-hidden="true" />
                    {ACCENT_LABELS[id]}
                  </Button>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Account */}
          {user ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <Avatar className="size-9">
                  <AvatarImage src={user.picture || undefined} alt={user.name} />
                  <AvatarFallback className="text-xs">{initials(user.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" className="h-8 w-full gap-1.5 text-xs" onClick={() => void signOut()}>
                <LogOut className="size-3.5" />
                Sign out
              </Button>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Boards sync automatically with your VoidAuth account — no passphrase, nothing to enter.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Not signed in.</p>
          )}

          <p className="text-[11px] text-muted-foreground/70">voidboard v0.1.0 · by VoidSuite</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}