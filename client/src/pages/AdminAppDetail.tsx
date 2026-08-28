import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router"
import { getAdminApp, updateAdminApp, deleteAdminApp } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import Dialog from "@/components/ui/dialog"

export function AdminAppDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [app, setApp] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: "", description: "", verification_status: "unverified", is_active: true, redirect_uris: "" })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)

  useEffect(() => {
    if (!id) return
    getAdminApp(id).then((res) => {
      if (res?.app) {
        const a = res.app
        setApp(a)
        let uris: string[] = []
        try { uris = JSON.parse(a.redirect_uris || '[]') } catch {}
        setForm({
          name: a.name,
          description: a.description || "",
          verification_status: a.verification_status,
          is_active: !!a.is_active,
          redirect_uris: uris.join("\n"),
        })
      }
    })
  }, [id])

  if (!app) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-center gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3.5 w-40" />
            </div>
          ))}
          <div className="px-4 py-3 space-y-1">
            <Skeleton className="h-3 w-24 mb-2" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="px-4 py-3 space-y-1">
            <Skeleton className="h-3 w-16 mb-2" />
            <div className="flex gap-1">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-5 w-14 rounded-md" />)}
            </div>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        </div>
      </div>
    )
  }

  async function handleSave() {
    setError(null); setSuccess(null)
    const data: any = {}
    if (form.name !== app.name) data.name = form.name
    if (form.description !== (app.description || "")) data.description = form.description
    if (form.verification_status !== app.verification_status) data.verification_status = form.verification_status
    if (form.is_active !== !!app.is_active) data.is_active = form.is_active

    let newUris: string[] = []
    try { newUris = JSON.parse(app.redirect_uris || '[]') } catch {}
    const formUris = form.redirect_uris.split("\n").map(s => s.trim()).filter(Boolean)
    if (JSON.stringify(formUris) !== JSON.stringify(newUris)) data.redirect_uris = formUris

    if (Object.keys(data).length === 0) { setEditing(false); return }

    const result = await updateAdminApp(id!, data)
    if (result.success) {
      setSuccess("App updated")
      setEditing(false)
      getAdminApp(id!).then((res) => res?.app && setApp(res.app))
    } else {
      setError(result.error || "Failed to update")
    }
  }

  async function handleDelete() {
    const result = await deleteAdminApp(id!)
    if (result.success) navigate("/admin/apps")
    else setError(result.error || "Failed to delete")
  }

  let redirectUris: string[] = []
  try { redirectUris = JSON.parse(app.redirect_uris || '[]') } catch {}

  let scopes: string[] = []
  try { scopes = JSON.parse(app.allowed_scopes || '[]') } catch {}

  const statusBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
    official: "default", verified: "secondary", unverified: "outline",
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/apps")} className="text-muted-foreground">
        ← Back to apps
      </Button>

      <div className="flex items-center gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{app.name}</h1>
            <Badge variant={statusBadgeVariant[app.verification_status] || 'outline'}>{app.verification_status}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{app.client_id}</p>
        </div>
      </div>

      {!editing ? (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {[
            { label: "Client ID", value: app.client_id, mono: true },
            { label: "Description", value: app.description || "(none)" },
            { label: "Status", value: app.is_active ? "Active" : "Inactive" },
            { label: "Owner", value: app.owner_name ? `${app.owner_name} (${app.owner_email})` : "System (seed)" },
            { label: "Created", value: new Date(app.created_at).toLocaleString() },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">{r.label}</span>
              <span className={`text-sm ${r.mono ? 'font-mono text-xs' : ''}`}>{r.value}</span>
            </div>
          ))}
          <div className="px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground">Redirect URIs</p>
            {redirectUris.map((uri: string) => (
              <p key={uri} className="text-xs font-mono">{uri}</p>
            ))}
          </div>
          <div className="px-4 py-3 space-y-1">
            <p className="text-xs text-muted-foreground">Scopes</p>
            <div className="flex flex-wrap gap-1">
              {scopes.map((s: string) => <Badge key={s} variant="secondary">{s}</Badge>)}
            </div>
          </div>
          <div className="flex gap-2 px-4 py-3">
            <Button size="sm" onClick={() => setEditing(true)}>Edit App</Button>
            <Button size="sm" variant="destructive" onClick={() => setShowDelete(true)}>Delete App</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
          {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</div>}
          {success && <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-600">{success}</div>}

          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-desc">Description</Label>
            <Input id="edit-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-uris">Redirect URIs (one per line)</Label>
            <Textarea id="edit-uris" rows={4} value={form.redirect_uris} onChange={(e) => setForm({ ...form, redirect_uris: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Verification Status</Label>
            <Select id="edit-status" value={form.verification_status} onChange={(e) => setForm({ ...form, verification_status: e.target.value })}>
              <option value="unverified">Unverified</option>
              <option value="verified">Verified</option>
              <option value="official">Official</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="edit-active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded border-border" />
            <Label htmlFor="edit-active">App active</Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleSave}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {showDelete && (
        <Dialog open={showDelete} onOpenChange={(v: boolean) => { if (!v) setShowDelete(false) }} title="Delete app" description={`Permanently delete ${app.name}?`}>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </div>
        </Dialog>
      )}
    </div>
  )
}
