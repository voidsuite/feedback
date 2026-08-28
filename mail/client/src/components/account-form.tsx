import { useEffect, useState } from "react"
import { Check, Loader2, Plus, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { testAccount } from "@/lib/api"
import { cn } from "@/lib/utils"
import type { MailAccount, TlsMode } from "@/lib/types"

const COLORS = ["#64748b", "#8b5cf6", "#10b981", "#f59e0b", "#0ea5e9", "#f43f5e"]

interface Preset {
  name: string
  smtp: { host: string; port: number; tls: TlsMode }
  pop3: { host: string; port: number; tls: TlsMode }
}

const PRESETS: Record<string, Preset> = {
  custom: { name: "Custom", smtp: { host: "", port: 465, tls: "ssl" }, pop3: { host: "", port: 995, tls: "ssl" } },
  gmail: {
    name: "Gmail",
    smtp: { host: "smtp.gmail.com", port: 465, tls: "ssl" },
    pop3: { host: "pop.gmail.com", port: 995, tls: "ssl" },
  },
  outlook: {
    name: "Outlook / Microsoft 365",
    smtp: { host: "smtp.office365.com", port: 587, tls: "starttls" },
    pop3: { host: "outlook.office365.com", port: 995, tls: "ssl" },
  },
  icloud: {
    name: "iCloud Mail",
    smtp: { host: "smtp.mail.me.com", port: 587, tls: "starttls" },
    pop3: { host: "mail.me.com", port: 995, tls: "ssl" },
  },
  yahoo: {
    name: "Yahoo Mail",
    smtp: { host: "smtp.mail.yahoo.com", port: 465, tls: "ssl" },
    pop3: { host: "pop.mail.yahoo.com", port: 995, tls: "ssl" },
  },
  zoho: {
    name: "Zoho Mail",
    smtp: { host: "smtp.zoho.com", port: 465, tls: "ssl" },
    pop3: { host: "pop.zoho.com", port: 995, tls: "ssl" },
  },
  proton: {
    name: "Proton Mail Bridge",
    smtp: { host: "127.0.0.1", port: 1025, tls: "none" },
    pop3: { host: "127.0.0.1", port: 1114, tls: "none" },
  },
}

const SMTP_PORT_BY_TLS: Record<TlsMode, number> = { ssl: 465, starttls: 587, none: 25 }
const POP3_PORT_BY_TLS: Record<TlsMode, number> = { ssl: 995, starttls: 110, none: 110 }

function emptyAccount(): MailAccount {
  return {
    id: "",
    label: "",
    email: "",
    name: "",
    color: COLORS[1],
    smtp: { host: "", port: 465, tls: "ssl", user: "", pass: "" },
    pop3: { host: "", port: 995, tls: "ssl", user: "", pass: "" },
    createdAt: Date.now(),
  }
}

interface TestResult {
  smtp: { ok: boolean; error?: string }
  pop3: { ok: boolean; error?: string }
}

interface AccountFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: MailAccount | null
  onSave: (account: MailAccount) => void
  onRemove?: (id: string) => void
}

export function AccountForm({ open, onOpenChange, editing, onSave, onRemove }: AccountFormProps) {
  const [account, setAccount] = useState<MailAccount>(emptyAccount)
  const [preset, setPreset] = useState("custom")
  const [test, setTest] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    if (!open) return
    setAccount(editing ? { ...editing } : emptyAccount())
    setPreset("custom")
    setTest(null)
  }, [open, editing])

  const set = <K extends keyof MailAccount>(key: K, value: MailAccount[K]) =>
    setAccount((prev) => ({ ...prev, [key]: value }))

  const setServer = (side: "smtp" | "pop3", key: "host" | "port" | "tls" | "user" | "pass", value: string | number | TlsMode) =>
    setAccount((prev) => ({ ...prev, [side]: { ...prev[side], [key]: value } }))

  function applyPreset(name: string) {
    const p = PRESETS[name]
    if (!p) return
    setPreset(name)
    const user = account.email || account.smtp.user
    setAccount((prev) => ({
      ...prev,
      smtp: { ...p.smtp, user, pass: prev.smtp.pass || "" },
      pop3: { ...p.pop3, user, pass: prev.pop3.pass || "" },
    }))
  }

  function changeTls(side: "smtp" | "pop3", tls: TlsMode) {
    const port = side === "smtp" ? SMTP_PORT_BY_TLS[tls] : POP3_PORT_BY_TLS[tls]
    setServer(side, "tls", tls)
    setServer(side, "port", port)
  }

  async function runTest() {
    setTesting(true)
    setTest(null)
    try {
      const result = await testAccount(account)
      setTest(result)
    } catch (err) {
      setTest({ smtp: { ok: false, error: String(err) }, pop3: { ok: false } })
    } finally {
      setTesting(false)
    }
  }

  function save() {
    const final: MailAccount = {
      ...account,
      id: account.id || `acct-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label: account.label || account.email,
    }
    onSave(final)
  }

  const canSave = account.email.trim() && account.smtp.host.trim() && account.pop3.host.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit account" : "Add mail account"}</DialogTitle>
          <DialogDescription>
            Credentials are stored encrypted on this device and sent only to your mail providers.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Identity */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="acct-email">Email address</Label>
              <Input
                id="acct-email"
                type="email"
                placeholder="you@example.com"
                value={account.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-label">Label (optional)</Label>
              <Input id="acct-label" placeholder="Work" value={account.label} onChange={(e) => set("label", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acct-name">Your name (optional)</Label>
              <Input id="acct-name" placeholder="Ada Lovelace" value={account.name || ""} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => set("color", c)}
                    className={cn(
                      "size-7 rounded-full transition-transform hover:scale-110",
                      account.color === c && "ring-2 ring-ring ring-offset-2 ring-offset-background"
                    )}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* Preset + servers */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Provider preset</Label>
              <Select value={preset} onValueChange={(v) => applyPreset(v ?? "custom")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRESETS).map(([id, p]) => (
                    <SelectItem key={id} value={id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(["smtp", "pop3"] as const).map((side) => {
              const cfg = account[side]
              const title = side === "smtp" ? "SMTP (send)" : "POP3 (receive)"
              return (
                <div key={side} className="space-y-3 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</Label>
                    <Select value={cfg.tls} onValueChange={(v) => changeTls(side, v as TlsMode)}>
                      <SelectTrigger size="sm" className="h-7">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ssl">SSL / TLS (implicit)</SelectItem>
                        <SelectItem value="starttls">STARTTLS (upgrade)</SelectItem>
                        <SelectItem value="none">No encryption</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="space-y-1.5">
                      <Label className="sr-only">{title} host</Label>
                      <Input
                        placeholder="smtp.example.com"
                        value={cfg.host}
                        onChange={(e) => setServer(side, "host", e.target.value)}
                      />
                    </div>
                    <div className="w-20 space-y-1.5">
                      <Label className="sr-only">{title} port</Label>
                      <Input
                        type="number"
                        value={cfg.port}
                        onChange={(e) => setServer(side, "port", parseInt(e.target.value, 10) || 0)}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Username"
                      value={cfg.user}
                      onChange={(e) => setServer(side, "user", e.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="Password / app password"
                      value={cfg.pass}
                      onChange={(e) => setServer(side, "pass", e.target.value)}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* Test result */}
          {test ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={test.smtp.ok ? "default" : "destructive"}>
                {test.smtp.ok ? <Check className="size-3" /> : <X className="size-3" />} SMTP{" "}
                {test.smtp.error ? `— ${test.smtp.error.slice(0, 60)}` : ""}
              </Badge>
              <Badge variant={test.pop3.ok ? "default" : "destructive"}>
                {test.pop3.ok ? <Check className="size-3" /> : <X className="size-3" />} POP3{" "}
                {test.pop3.error ? `— ${test.pop3.error.slice(0, 60)}` : ""}
              </Badge>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            {editing && onRemove ? (
              <Button variant="ghost" className="gap-1.5 text-destructive" onClick={() => onRemove(editing.id)}>
                <Trash2 className="size-4" />
                Remove
              </Button>
            ) : null}
            <Button variant="outline" onClick={runTest} disabled={testing || !canSave}>
              {testing ? <Loader2 className="size-4 animate-spin" /> : null}
              Test connection
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave} className="gap-1.5">
              <Plus className="size-4" />
              {editing ? "Save changes" : "Add account"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}