import { useState, useEffect } from "react"
import { useParams, useNavigate } from "react-router"
import { getAdminUser, updateAdminUser, deleteAdminUser, forceResetPassword, getAdminUserSessions, impersonateUser, banUser, getAdminUserTokens, getAdminUserStorageFiles } from "@/lib/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select } from "@/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import Dialog from "@/components/ui/dialog"

function formatBytes(b: number) {
  const n = Number(b) || 0
  if (n === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(n) / Math.log(1024))
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

export function AdminUserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [userData, setUserData] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", role: "user", avatar_url: "", is_active: true })
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showDelete, setShowDelete] = useState(false)
  const [showResetPwd, setShowResetPwd] = useState(false)
  const [tempPwd, setTempPwd] = useState<string | null>(null)
  const [showSessions, setShowSessions] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [impersonating, setImpersonating] = useState(false)
  const [showTokens, setShowTokens] = useState(false)
  const [tokens, setTokens] = useState<any[]>([])
  const [showFiles, setShowFiles] = useState(false)
  const [files, setFiles] = useState<any[]>([])
  const [banning, setBanning] = useState(false)
  const [loadingUser, setLoadingUser] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    loadUser()
  }, [id])

  async function loadUser() {
    if (!id) return
    setLoadingUser(true)
    setLoadError(null)
    try {
      const res = await getAdminUser(id)
      if (res) {
        setUserData(res)
        setForm({
          name: res.user.name,
          email: res.user.email,
          role: res.user.role,
          avatar_url: res.user.avatar_url || "",
          is_active: !!res.user.is_active,
        })
      } else {
        setLoadError("User not found")
      }
    } catch {
      setLoadError("Failed to load user")
    }
    setLoadingUser(false)
  }

  if (loadingUser) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-12" />
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3.5 w-32" />
            </div>
          ))}
          <div className="flex gap-2 px-4 py-3">
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")} className="text-muted-foreground">
          ← Back to users
        </Button>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-border bg-card mb-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-5 text-muted-foreground">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold mb-1">{loadError}</h2>
          <p className="text-sm text-muted-foreground">The user could not be loaded. They may have been deleted.</p>
          <Button size="sm" onClick={loadUser} className="mt-4">Try again</Button>
        </div>
      </div>
    )
  }

  if (!userData) return null

  const { user, stats } = userData

  async function handleSave() {
    setError(null); setSuccess(null)
    const data: any = {}
    if (form.name !== user.name) data.name = form.name
    if (form.email !== user.email) data.email = form.email
    if (form.role !== user.role) data.role = form.role
    if (form.avatar_url !== (user.avatar_url || "")) data.avatar_url = form.avatar_url || null
    if (form.is_active !== !!user.is_active) data.is_active = form.is_active
    if (Object.keys(data).length === 0) { setEditing(false); return }
    const result = await updateAdminUser(id!, data)
    if (result.success) { setSuccess("User updated"); setEditing(false); loadUser() }
    else { setError(result.error || "Failed to update") }
  }

  async function handleDelete() {
    setError(null)
    const result = await deleteAdminUser(id!)
    if (result.success) navigate("/admin/users")
    else setError(result.error || "Failed to delete")
  }

  async function handleForceReset() {
    setError(null); setSuccess(null)
    const result = await forceResetPassword(id!)
    if ('tempPassword' in result) { setTempPwd(result.tempPassword); setSuccess("Password reset successfully") }
    else setError(result.error)
  }

  async function handleViewSessions() {
    setError(null); setSuccess(null)
    const s = await getAdminUserSessions(id!)
    setSessions(s); setShowSessions(true)
  }

  async function handleImpersonate() {
    setError(null); setSuccess(null); setImpersonating(true)
    const result = await impersonateUser(id!)
    if ('token' in result) setSuccess(`Impersonation token generated. User: ${result.user.name} (${result.user.email})`)
    else setError(result.error)
    setImpersonating(false)
  }

  async function handleBan() {
    setBanning(true); setError(null); setSuccess(null)
    const result = await banUser(id!, !user.is_active)
    if (result.success) { loadUser(); setSuccess(user.is_active ? "User banned" : "User unbanned") }
    else setError(result.error)
    setBanning(false)
  }

  async function handleViewTokens() {
    setError(null); setSuccess(null)
    const t = await getAdminUserTokens(id!)
    setTokens(t); setShowTokens(true)
  }

  async function handleViewFiles() {
    setError(null); setSuccess(null)
    const f = await getAdminUserStorageFiles(id!)
    setFiles(f); setShowFiles(true)
  }

  const initial = user.name?.charAt(0).toUpperCase() || "?"

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/admin/users")} className="text-muted-foreground">
        ← Back to users
      </Button>

      <div className="flex items-center gap-4">
        <Avatar className="size-14">
          <AvatarImage src={user.avatar_url} alt={user.name} />
          <AvatarFallback className="text-lg">{initial}</AvatarFallback>
        </Avatar>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{user.name}</h1>
            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
            <Badge variant={user.is_active ? 'default' : 'destructive'}>{user.is_active ? 'Active' : 'Banned'}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Connected Apps</p>
          <p className="text-lg font-semibold mt-1">{stats.connected_apps}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Sessions</p>
          <p className="text-lg font-semibold mt-1">{stats.sessions}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Owned Apps</p>
          <p className="text-lg font-semibold mt-1">{stats.owned_apps}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">OAuth Tokens</p>
          <p className="text-lg font-semibold mt-1">{stats.tokens}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Passkeys</p>
          <p className="text-lg font-semibold mt-1">{stats.passkeys}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Storage Files</p>
          <p className="text-lg font-semibold mt-1">{stats.storage_files}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Storage Used</p>
          <p className="text-lg font-semibold mt-1">{formatBytes(stats.storage_used)}</p>
        </div>
      </div>

      {!editing ? (
        <div className="rounded-2xl border border-border bg-card divide-y divide-border">
          {[
            { label: "User ID", value: user.id, mono: true },
            { label: "Name", value: user.name },
            { label: "Email", value: user.email },
            { label: "Role", value: user.role },
            { label: "Status", value: user.is_active ? "Active" : "Banned" },
            { label: "2FA", value: user.two_factor_enabled ? "Enabled" : "Disabled" },
            { label: "Last Login", value: user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "Never" },
            { label: "Joined", value: new Date(user.created_at).toLocaleString() },
            { label: "Password Changed", value: user.password_changed_at ? new Date(user.password_changed_at).toLocaleString() : "Never" },
          ].map((r) => (
            <div key={r.label} className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">{r.label}</span>
              <span className={`text-sm ${r.mono ? 'font-mono text-xs text-muted-foreground' : ''}`}>{r.value}</span>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 px-4 py-3">
            <Button size="sm" onClick={() => setEditing(true)}>Edit User</Button>
            <Button size="sm" variant="secondary" onClick={handleViewSessions}>Sessions ({stats.sessions})</Button>
            <Button size="sm" variant="secondary" onClick={handleViewTokens}>OAuth Tokens ({stats.tokens})</Button>
            <Button size="sm" variant="secondary" onClick={handleViewFiles}>Storage Files ({stats.storage_files})</Button>
            <Button size="sm" variant="secondary" onClick={() => setShowResetPwd(true)}>Reset Password</Button>
            <Button size="sm" variant="secondary" onClick={handleImpersonate} disabled={impersonating}>
              {impersonating ? "Generating..." : "Impersonate"}
            </Button>
            <Button size="sm" variant={user.is_active ? "destructive" : "default"} onClick={handleBan} disabled={banning}>
              {banning ? "Working..." : user.is_active ? "Ban User" : "Unban User"}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setShowDelete(true)}>Delete User</Button>
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
            <Label htmlFor="edit-email">Email</Label>
            <Input id="edit-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-role">Role</Label>
            <Select id="edit-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-avatar">Avatar URL</Label>
            <Input id="edit-avatar" value={form.avatar_url} onChange={(e) => setForm({ ...form, avatar_url: e.target.value })} placeholder="https://example.com/avatar.png" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="edit-active" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="rounded border-border" />
            <Label htmlFor="edit-active">Account active</Label>
          </div>
          <div className="flex gap-2 pt-2">
            <Button size="sm" onClick={handleSave}>Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      {showDelete && (
        <Dialog open={showDelete} onOpenChange={(v: boolean) => { if (!v) setShowDelete(false) }} title="Delete user" description={`Permanently delete ${user.name}? This cannot be undone.`}>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </div>
        </Dialog>
      )}

      {/* Reset password dialog */}
      {showResetPwd && (
        <Dialog open={showResetPwd} onOpenChange={(v: boolean) => { if (!v) { setShowResetPwd(false); setTempPwd(null) } }} title="Reset password" description={`Generate a new temporary password for ${user.name}?`}>
          <div className="space-y-3">
            {tempPwd ? (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Temporary password (copy now, it won't be shown again):</p>
                <div className="rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs break-all select-all">{tempPwd}</div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">The user's current password will be replaced. They will need to use the temporary password to log in.</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowResetPwd(false); setTempPwd(null) }}>Close</Button>
              {!tempPwd && <Button variant="destructive" onClick={handleForceReset}>Generate & Reset</Button>}
            </div>
          </div>
        </Dialog>
      )}

      {/* Sessions dialog */}
      {showSessions && (
        <Dialog open={showSessions} onOpenChange={(v: boolean) => { if (!v) setShowSessions(false) }} title="Active sessions" description={`Current sessions for ${user.name}:`}>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No active sessions.</p>
            ) : sessions.map((s: any) => (
              <div key={s.id} className="rounded-lg border border-border bg-background p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Session</span>
                  <span className="text-[10px] text-muted-foreground">{new Date(s.created_at).toLocaleString()}</span>
                </div>
                {s.ip_address && <p className="text-[10px] text-muted-foreground font-mono">IP: {s.ip_address}</p>}
                {s.user_agent && <p className="text-[10px] text-muted-foreground truncate">UA: {s.user_agent}</p>}
                <p className="text-[10px] text-muted-foreground">Expires: {new Date(s.expires_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={() => setShowSessions(false)}>Close</Button>
          </div>
        </Dialog>
      )}

      {/* OAuth Tokens dialog */}
      {showTokens && (
        <Dialog open={showTokens} onOpenChange={(v: boolean) => { if (!v) setShowTokens(false) }} title="OAuth Tokens" description={`OAuth tokens issued to ${user.name}:`} className="max-w-xl">
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {tokens.length === 0 ? (
              <p className="text-xs text-muted-foreground">No OAuth tokens.</p>
            ) : tokens.map((t: any) => (
              <div key={t.id} className="rounded-lg border border-border bg-background p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">{t.client_name}</span>
                  <Badge variant={t.revoked_at ? 'destructive' : 'default'} className="text-[10px]">
                    {t.revoked_at ? 'Revoked' : 'Active'}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono truncate">{t.access_token}</p>
                <p className="text-[10px] text-muted-foreground">Scope: {t.scope}</p>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Issued: {new Date(t.created_at).toLocaleString()}</span>
                  <span>Expires: {new Date(t.expires_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={() => setShowTokens(false)}>Close</Button>
          </div>
        </Dialog>
      )}

      {/* Storage Files dialog */}
      {showFiles && (
        <Dialog open={showFiles} onOpenChange={(v: boolean) => { if (!v) setShowFiles(false) }} title="Storage Files" description={`Files stored by ${user.name}:`} className="max-w-xl">
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {files.length === 0 ? (
              <p className="text-xs text-muted-foreground">No files stored.</p>
            ) : files.map((f: any) => (
              <div key={f.id} className="rounded-lg border border-border bg-background p-3 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{f.original_name}</p>
                  <p className="text-[10px] text-muted-foreground">{f.mime_type} · {formatBytes(f.size_bytes)}</p>
                  {f.client_name && <p className="text-[10px] text-muted-foreground">App: {f.client_name}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">{new Date(f.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={() => setShowFiles(false)}>Close</Button>
          </div>
        </Dialog>
      )}

      {!editing && error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</div>}
      {!editing && success && <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs font-medium text-green-600">{success}</div>}
    </div>
  )
}
