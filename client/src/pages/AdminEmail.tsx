import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { apiClient } from "@/lib/api"

interface Settings {
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_pass: string
  smtp_from: string
  smtp_from_name: string
  allow_signups: boolean
}

export function AdminEmail() {
  const [settings, setSettings] = useState<Settings>({
    smtp_host: "", smtp_port: "587", smtp_user: "", smtp_pass: "",
    smtp_from: "", smtp_from_name: "VoidAuth", allow_signups: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testEmail, setTestEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    apiClient.get<Settings>('/admin/settings')
      .then((data) => { setSettings(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError(null); setSuccess(null)
    try {
      await apiClient.patch('/admin/settings', settings)
      setSuccess("Settings saved")
      setTimeout(() => setSuccess(null), 3000)
    } catch { setError("Failed to save") }
    finally { setSaving(false) }
  }

  async function handleTest() {
    setTesting(true); setError(null); setSuccess(null)
    try {
      await apiClient.post('/admin/settings/email-test', { to: testEmail || undefined })
      setSuccess("Test email sent!")
      setTimeout(() => setSuccess(null), 3000)
    } catch (err: any) { setError(err.error || "Test failed") }
    finally { setTesting(false) }
  }

  function set<K extends keyof Settings>(key: K, val: Settings[K]) {
    setSettings(prev => ({ ...prev, [key]: val }))
  }

  if (loading) return (
    <div className="space-y-8">
      <div className="space-y-1">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-2xl" />
    </div>
  )

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Email Configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure SMTP settings for password resets and notifications.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</div>}
        {success && <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-600">{success}</div>}

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">SMTP Server</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="host">SMTP Host</Label>
              <Input id="host" value={settings.smtp_host} onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port">SMTP Port</Label>
              <Input id="port" value={settings.smtp_port} onChange={(e) => set('smtp_port', e.target.value)} placeholder="587" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="user">SMTP Username</Label>
              <Input id="user" value={settings.smtp_user} onChange={(e) => set('smtp_user', e.target.value)} placeholder="postmaster@example.com" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass">SMTP Password</Label>
              <Input id="pass" type="password" value={settings.smtp_pass} onChange={(e) => set('smtp_pass', e.target.value)} placeholder="••••••••" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">From Address</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from">From Email</Label>
              <Input id="from" value={settings.smtp_from} onChange={(e) => set('smtp_from', e.target.value)} placeholder="noreply@voidauth.local" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fromName">From Name</Label>
              <Input id="fromName" value={settings.smtp_from_name} onChange={(e) => set('smtp_from_name', e.target.value)} placeholder="VoidAuth" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="text-sm font-semibold">Registration</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow new user registration</p>
              <p className="text-xs text-muted-foreground">When disabled, users will see a contact form instead of the register page.</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.allow_signups}
              onClick={() => set('allow_signups', !settings.allow_signups)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.allow_signups ? 'bg-primary' : 'bg-muted'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.allow_signups ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save Settings"}</Button>
        </div>
      </form>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Test Email</h2>
        <p className="text-xs text-muted-foreground">Send a test email to verify your SMTP configuration.</p>
        <div className="flex gap-2">
          <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="test@example.com" className="max-w-xs" />
          <Button variant="outline" onClick={handleTest} disabled={testing}>{testing ? "Sending..." : "Send Test"}</Button>
        </div>
      </div>
    </div>
  )
}
