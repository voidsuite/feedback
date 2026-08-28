import { useState, useEffect } from "react"
import { apiClient } from "@/lib/api"
import { Button } from "@/components/ui/button"

interface FeatureFlag {
  setting_key: string
  setting_value: string
}

const KNOWN_FLAGS = [
  { key: "feature_signups", label: "Allow new user registrations" },
  { key: "feature_magic_link", label: "Magic link (passwordless) login" },
  { key: "feature_email_verification", label: "Require email verification" },
  { key: "feature_passkeys", label: "WebAuthn / Passkey support" },
  { key: "feature_otp_login", label: "Email OTP login" },
]

export function AdminFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiClient.get<{ flags: FeatureFlag[] }>('/admin/feature-flags').then(res => setFlags(res.flags || []))
  }, [])

  function isEnabled(key: string) {
    const f = flags.find(f => f.setting_key === key)
    return f?.setting_value === "1"
  }

  async function toggle(key: string) {
    const next = !isEnabled(key)
    setSaving(true)
    try {
      await apiClient.patch('/admin/feature-flags', { [key]: next })
      setFlags(prev => {
        const existing = prev.find(f => f.setting_key === key)
        if (existing) return prev.map(f => f.setting_key === key ? { ...f, setting_value: next ? "1" : "0" } : f)
        return [...prev, { setting_key: key, setting_value: next ? "1" : "0" }]
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-semibold tracking-tight">Feature Flags</h1><p className="mt-1 text-sm text-muted-foreground">Enable or disable platform features globally.</p></div>
      <div className="rounded-xl border border-border divide-y divide-border">
        {KNOWN_FLAGS.map(flag => (
          <div key={flag.key} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium">{flag.label}</p>
              <p className="text-xs text-muted-foreground font-mono">{flag.key}</p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={() => toggle(flag.key)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${isEnabled(flag.key) ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${isEnabled(flag.key) ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
