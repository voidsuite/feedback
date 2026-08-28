import { useState, useEffect } from "react"
import { apiClient } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

export function AdminMaintenance() {
  const [enabled, setEnabled] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [subject, setSubject] = useState("")
  const [bodyHtml, setBodyHtml] = useState("")
  const [bodyText, setBodyText] = useState("")
  const [tasks, setTasks] = useState<any[]>([])
  const [taskMsg, setTaskMsg] = useState("")

  useEffect(() => {
    apiClient.get<{ enabled: boolean }>('/admin/maintenance-mode').then(r => setEnabled(r.enabled))
    apiClient.get<{ templates: any[] }>('/admin/email-templates').then(r => setTemplates(r.templates || []))
    apiClient.get<{ tasks: any[] }>('/admin/scheduled-tasks').then(r => setTasks(r.tasks || []))
  }, [])

  async function toggleMaintenance() {
    const next = !enabled
    const res = await apiClient.post<any>('/admin/maintenance-mode', { enabled: next })
    setEnabled(res.maintenanceMode)
  }

  function selectTemplate(t: any) {
    setSelected(t)
    setSubject(t.subject)
    setBodyHtml(t.body_html)
    setBodyText(t.body_text || "")
  }

  async function saveTemplate() {
    if (!selected) return
    await apiClient.patch(`/admin/email-templates/${selected.template_key}`, { subject, body_html: bodyHtml, body_text: bodyText || null })
    const res = await apiClient.get<{ templates: any[] }>('/admin/email-templates')
    setTemplates(res.templates || [])
    setSelected(null)
  }

  async function runTask(name: string) {
    setTaskMsg("")
    try {
      const res = await apiClient.post<any>('/admin/scheduled-tasks/run', { name })
      setTaskMsg(res.message || "Task completed.")
      const t = await apiClient.get<{ tasks: any[] }>('/admin/scheduled-tasks')
      setTasks(t.tasks || [])
    } catch {
      setTaskMsg("Failed to run task.")
    }
  }

  return (
    <div className="space-y-8">
      <div><h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1><p className="mt-1 text-sm text-muted-foreground">Server maintenance, email templates, and scheduled tasks.</p></div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold">Maintenance Mode</h2>
        <p className="text-xs text-muted-foreground">When enabled, non-admin users will see a maintenance page and cannot access the platform.</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleMaintenance}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${enabled ? "bg-destructive" : "bg-muted"}`}
          >
            <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${enabled ? "translate-x-5" : "translate-x-0"}`} />
          </button>
          <span className="text-sm font-medium">{enabled ? "Maintenance mode ON" : "Maintenance mode OFF"}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Email Templates</h2>
        <p className="text-xs text-muted-foreground">Customize the emails sent to users for various events.</p>
        <div className="flex gap-4 flex-wrap">
          <div className="w-56 space-y-1">
            {templates.map((t: any) => (
              <button
                key={t.template_key}
                onClick={() => selectTemplate(t)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selected?.template_key === t.template_key ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground"}`}
              >
                {t.template_key}
              </button>
            ))}
          </div>
          {selected && (
            <div className="flex-1 min-w-[300px] space-y-3">
              <Input placeholder="Subject" value={subject} onChange={e => setSubject(e.target.value)} />
              <Textarea placeholder="HTML Body" value={bodyHtml} onChange={e => setBodyHtml(e.target.value)} rows={6} />
              <Textarea placeholder="Plain Text Body (optional)" value={bodyText} onChange={e => setBodyText(e.target.value)} rows={4} />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveTemplate}>Save Template</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold">Scheduled Tasks</h2>
        <p className="text-xs text-muted-foreground">Manually trigger recurring maintenance jobs.</p>
        {taskMsg && <p className="text-xs text-green-500">{taskMsg}</p>}
        <div className="grid grid-cols-3 gap-3">
          {tasks.map((task: any) => (
            <div key={task.id} className="rounded-xl border border-border p-4 space-y-2">
              <p className="text-sm font-medium">{task.name}</p>
              <p className="text-xs text-muted-foreground">{task.description || task.schedule}</p>
              <p className="text-xs text-muted-foreground">Last run: {task.last_run ? new Date(task.last_run).toLocaleString() : "Never"}</p>
              <Button size="sm" variant="outline" onClick={() => runTask(task.name)}>Run Now</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
