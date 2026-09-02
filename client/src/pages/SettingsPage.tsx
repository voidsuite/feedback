import { useNavigate } from "react-router"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { VoidFeedbackLogo } from "@/components/VoidFeedbackLogo"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AppShell } from "@/components/app-shell"
import { useAuth } from "@/contexts/auth"

function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()
}

export function SettingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your Void Feedback account.</p>
        </div>

        <Card className="flex items-center gap-4 p-5">
          <Avatar className="size-14">
            <AvatarImage src={user?.picture || undefined} alt={user?.name} />
            <AvatarFallback>{user ? initials(user.name) : "?"}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{user?.name}</p>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            {user?.role === "admin" && (
              <button className="mt-1 text-xs text-primary underline" onClick={() => navigate("/admin")}>Open admin panel</button>
            )}
          </div>
        </Card>

        <Card className="divide-y divide-border">
          <div className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Theme</p>
              <p className="text-xs text-muted-foreground">Change the look in your account settings on VoidAuth.</p>
            </div>
          </div>
          <div className="p-4">
            <p className="text-xs text-muted-foreground">
              Notifications about replies to your feedback are sent in-app. Email replies are enabled when theVoid
              team configures an email sink in the admin panel.
            </p>
          </div>
        </Card>

        <Separator />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <VoidFeedbackLogo size="sm" />
          <span>v0.1.0</span>
        </div>
      </div>
    </AppShell>
  )
}
