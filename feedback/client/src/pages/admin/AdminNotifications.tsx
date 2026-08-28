import * as React from "react"
import { Plus, Trash2, Send, Loader2, Webhook, Bell } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { api, type NotifyTarget, type NotifyTargetType, type NotifyEvent } from "@/lib/api"

const EVENTS: { id: NotifyEvent; label: string }[] = [
  { id: "new_feedback", label: "New feedback" },
  { id: "new_reply", label: "New reply" },
  { id: "status_change", label: "Status change" },
  { id: "assigned", label: "Assignment" },
]

const TYPE_FIELDS: Record<NotifyTargetType, { key: string; label: string; placeholder: string }[]> = {
  discord: [{ key: "webhook_url", label: "Webhook URL", placeholder: "https://discord.com/api/webhooks/..." }],
  slack: [{ key: "webhook_url", label: "Webhook URL", placeholder: "https://hooks.slack.com/services/..." }],
  telegram: [
    { key: "bot_token", label: "Bot token", placeholder: "123456:ABC-DEF..." },
    { key: "chat_id", label: "Chat ID", placeholder: "-100123456" },
  ],
  email: [{ key: "email", label: "Fallback email (optional)", placeholder: "alerts@example.com" }],
  webhook: [{ key: "url", label: "Endpoint URL", placeholder: "https://example.com/hook" }],
}

export function AdminNotifications() {
  const [targets, setTargets] = React.useState<NotifyTarget[]>([])
  const [loading, setLoading] = React.useState(true)
  const [note, setNote] = React.useState("")
  const [showForm, setShowForm] = React.useState(false)

  const [type, setType] = React.useState<NotifyTargetType>("discord")
  const [name, setName] = React.useState("")
  const [config, setConfig] = React.useState<Record<string, string>>({})
  const [events, setEvents] = React.useState<NotifyEvent[]>(["new_feedback", "new_reply", "status_change", "assigned"])
  const [enabled, setEnabled] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const { targets } = await api.listTargets()
      setTargets(targets)
    } finally { setLoading(false) }
  }, [])

  React.useEffect(() => { load() }, [load])

  function resetForm() {
    setType("discord"); setName(""); setConfig({}); setEvents(["new_feedback", "new_reply", "status_change", "assigned"]); setEnabled(true); setShowForm(false)
  }

  async function create() {
    setSaving(true); setNote("")
    try {
      await api.createTarget({ type, name: name || type, config, events, enabled })
      setNote("Target added.")
      resetForm()
      load()
    } catch (e: any) {
      setNote(e?.message || "Failed to add target")
    } finally { setSaving(false) }
  }

  async function toggle(id: string, v: boolean) {
    const { target } = await api.updateTarget(id, { enabled: v })
    setTargets((prev) => prev.map((t) => (t.id === id ? target : t)))
  }

  async function remove(id: string) {
    await api.deleteTarget(id)
    setTargets((prev) => prev.filter((t) => t.id !== id))
  }

  async function test(id: string) {
    setNote("")
    const res = await api.testTarget(id)
    setNote(res.ok ? "Test notification sent." : `Test failed: ${res.error || "unknown error"}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-sm text-muted-foreground">Where the team gets pinged on new feedback and replies.</p>
      </div>

      {note && <p className="rounded-lg bg-muted px-3 py-2 text-xs">{note}</p>}

      {!showForm && (
        <Button className="gap-1.5" onClick={() => setShowForm(true)}><Plus className="size-4" /> Add target</Button>
      )}

      {showForm && (
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => { setType(v as NotifyTargetType); setConfig({}) }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="discord">Discord</SelectItem>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="telegram">Telegram</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="webhook">Generic Webhook</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input placeholder={type} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          {TYPE_FIELDS[type].map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Input placeholder={f.placeholder} value={config[f.key] || ""} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} />
            </div>
          ))}

          <div className="space-y-2">
            <Label>Events</Label>
            <div className="flex flex-wrap gap-3">
              {EVENTS.map((ev) => (
                <label key={ev.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={events.includes(ev.id)} onCheckedChange={(v) => setEvents((prev) => (v ? [...new Set([...prev, ev.id])] : prev.filter((e) => e !== ev.id)))} />
                  {ev.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={enabled} onCheckedChange={setEnabled} /> Enabled
            </label>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={resetForm}>Cancel</Button>
              <Button onClick={create} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />} Add</Button>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : targets.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No notification targets yet.</p>
      ) : (
        <div className="space-y-2">
          {targets.map((t) => (
            <Card key={t.id} className="flex flex-wrap items-center gap-3 p-4">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium capitalize text-primary">
                {t.type === "webhook" ? <Webhook className="size-3" /> : <Bell className="size-3" />} {t.type}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.events.join(", ")}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={t.enabled} onCheckedChange={(v) => toggle(t.id, v)} /> {t.enabled ? "On" : "Off"}
                </label>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => test(t.id)}><Send className="size-3.5" /> Test</Button>
                <Button variant="ghost" size="icon" className="text-destructive" onClick={() => remove(t.id)} aria-label="Delete"><Trash2 className="size-4" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
