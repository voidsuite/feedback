import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router"
import { useAuth } from "@/contexts/auth"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { VoidLogo } from "@/components/VoidLogo"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { getNotificationPrefs, updateNotificationPrefs, type NotificationPrefs } from "@/lib/auth"
import { cn } from "@/lib/utils"

interface ToggleProps {
  label: string
  description: string
  enabled: boolean
  onChange: (enabled: boolean) => void
}

function ToggleRow({ label, description, enabled, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
          enabled ? "bg-primary" : "bg-muted"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-4 rounded-full bg-background shadow ring-0 transition duration-200 ease-in-out",
            enabled ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    </div>
  )
}

export function NotificationSettings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    login_alert: true,
    password_change: true,
    new_app_connection: true,
    storage_warning: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")

  const initial = (user?.name || user?.email || "?").charAt(0).toUpperCase()

  useEffect(() => {
    async function load() {
      try {
        const result = await getNotificationPrefs()
        if (result) setPrefs(result)
      } catch {
        // Keep defaults
      }
      setLoading(false)
    }
    load()
  }, [])

  async function handleToggle(key: keyof NotificationPrefs, value: boolean) {
    setSaving(key)
    setError("")
    setSuccess("")
    const updated = { ...prefs, [key]: value }
    setPrefs(updated)
    try {
      await updateNotificationPrefs(updated)
      setSuccess("Saved")
      setTimeout(() => setSuccess(""), 2000)
    } catch (err: any) {
      setPrefs(prefs)
      setError(err.error || "Failed to save")
      setTimeout(() => setError(""), 3000)
    }
    setSaving(null)
  }

  if (!user) {
    void navigate("/login")
    return null
  }

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <VoidLogo />
          <div className="flex items-center gap-3">
            <Link to="/dashboard">
              <Avatar className="size-7">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <div>
          <Link
            to="/dashboard"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3">
              <path d="m15 18-6-6 6-6" />
            </svg>
            Back to dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Notification Preferences</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose which email notifications you'd like to receive.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</div>
        )}
        {success && (
          <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-600">{success}</div>
        )}

        <Card className="divide-y divide-border overflow-hidden">
          {loading ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-3.5 w-28" />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="px-4">
                <ToggleRow
                  label="Login alerts"
                  description="Receive an email when someone signs in to your account."
                  enabled={prefs.login_alert}
                  onChange={(v) => handleToggle("login_alert", v)}
                />
              </div>
              <div className="px-4">
                <ToggleRow
                  label="Password changes"
                  description="Get notified when your password is changed."
                  enabled={prefs.password_change}
                  onChange={(v) => handleToggle("password_change", v)}
                />
              </div>
              <div className="px-4">
                <ToggleRow
                  label="New app connections"
                  description="Receive an email when a new application connects to your account."
                  enabled={prefs.new_app_connection}
                  onChange={(v) => handleToggle("new_app_connection", v)}
                />
              </div>
              <div className="px-4">
                <ToggleRow
                  label="Storage quota warning"
                  description="Get notified when you're approaching your storage quota."
                  enabled={prefs.storage_warning}
                  onChange={(v) => handleToggle("storage_warning", v)}
                />
              </div>
            </>
          )}
        </Card>
      </main>
    </div>
  )
}
