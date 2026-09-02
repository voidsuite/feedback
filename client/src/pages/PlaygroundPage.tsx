import { useState, useEffect, useCallback, useRef } from 'react'
import { Link } from 'react-router'
import { getDeveloperApps, updateDeveloperApp, type DeveloperApp } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { VoidLogo } from '@/components/VoidLogo'

interface ThemeConfig {
  borderRadius: number
  buttonStyle: 'filled' | 'outlined' | 'ghost'
  buttonText: string
  logoUrl: string
  bannerUrl: string
  bannerHeight: number
  showBranding: boolean
  consentLayout: 'card' | 'fullwidth' | 'minimal'
  darkMode: boolean
  fontFamily: string
  consentDescription: string
}

const DEFAULT_THEME: ThemeConfig = {
  borderRadius: 10,
  buttonStyle: 'filled',
  buttonText: 'Sign in with Void',
  logoUrl: '',
  bannerUrl: '',
  bannerHeight: 120,
  showBranding: true,
  consentLayout: 'card',
  darkMode: false,
  fontFamily: 'Inter, system-ui, sans-serif',
  consentDescription: 'wants to access your Void account',
}

const FONTS = [
  { name: 'System', value: 'Inter, system-ui, sans-serif' },
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Geist', value: 'Geist, system-ui, sans-serif' },
  { name: 'JetBrains Mono', value: 'JetBrains Mono, monospace' },
  { name: 'Fira Code', value: 'Fira Code, monospace' },
  { name: 'Space Grotesk', value: 'Space Grotesk, sans-serif' },
  { name: 'Plus Jakarta', value: 'Plus Jakarta Sans, sans-serif' },
  { name: 'Outfit', value: 'Outfit, sans-serif' },
  { name: 'Satoshi', value: 'Satoshi, sans-serif' },
  { name: 'Manrope', value: 'Manrope, sans-serif' },
]

const SCOPE_LABELS: Record<string, string> = {
  openid: 'OpenID Connect identity',
  profile: 'View your name, username, and profile picture',
  email: 'View your email address',
  read: 'Read access to your data',
  write: 'Write access to your data',
}

export function PlaygroundPage() {
  const [apps, setApps] = useState<DeveloperApp[]>([])
  const [selectedApp, setSelectedApp] = useState<DeveloperApp | null>(null)
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME)
  const [activeSection, setActiveSection] = useState<'theme' | 'button' | 'consent' | 'code' | 'sdk' | 'ai'>('theme')
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const [aiTab, setAiTab] = useState<'opencode' | 'codex' | 'claude' | 'cursor' | 'windsurf'>('opencode')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const result = await getDeveloperApps()
        if (cancelled) return
        setApps(result || [])
        if (result?.length > 0) {
          const savedId = localStorage.getItem('va_playground_app')
          const app = result.find((a: DeveloperApp) => a.id === savedId) || result[0]
          setSelectedApp(app)
          if (app.appTheme) {
            setTheme({ ...DEFAULT_THEME, ...app.appTheme })
          }
        }
      } catch {}
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (selectedApp) {
      localStorage.setItem('va_playground_app', selectedApp.id)
    }
  }, [selectedApp])

  const updateTheme = (patch: Partial<ThemeConfig>) => setTheme((prev) => ({ ...prev, ...patch }))

  const copyCodeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const saveTheme = useCallback(async () => {
    if (!selectedApp) return
    setSaving(true)
    const result = await updateDeveloperApp(selectedApp.id, { app_theme: theme })
    setSaving(false)
    if (result.success) {
      setSaved(true)
      setApps((prev) => prev.map((a) => a.id === selectedApp.id ? { ...a, appTheme: theme } : a))
      if (savedTimeout.current) clearTimeout(savedTimeout.current)
      savedTimeout.current = setTimeout(() => setSaved(false), 2000)
    }
  }, [theme, selectedApp])

  const resetTheme = useCallback(() => {
    setTheme(DEFAULT_THEME)
  }, [])

  const issuer = import.meta.env.VITE_API_URL || 'https://auth.stwupid.tech'
  const clientId = selectedApp?.clientId || 'YOUR_CLIENT_ID'
  const redirectUri = selectedApp?.redirectUris?.[0] || 'http://localhost:5173/callback'
  const scopes = (selectedApp?.allowedScopes || ['openid', 'profile', 'email'])
  const scopeString = scopes.join(' ')

  const sections = [
    { id: 'theme' as const, label: 'Theme' },
    { id: 'button' as const, label: 'Login Button' },
    { id: 'consent' as const, label: 'Consent Screen' },
    { id: 'code' as const, label: 'Export Code' },
    { id: 'sdk' as const, label: 'SDK' },
    { id: 'ai' as const, label: 'AI Agent' },
  ]

  const generateCSS = () => `:root {
  --void-radius: ${theme.borderRadius}px;
  --void-font: ${theme.fontFamily};
}

.void-login-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border-radius: var(--void-radius);
  font-family: var(--void-font);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.2s;
  text-decoration: none;
}
.void-login-btn:hover { opacity: 0.85; }
.void-login-btn--filled {
  background: #171717;
  color: #fff;
  border: none;
}
.void-login-btn--outlined {
  background: transparent;
  color: #171717;
  border: 1.5px solid #171717;
}
.void-login-btn--ghost {
  background: transparent;
  color: #171717;
  border: none;
}`

  const generateHTML = () => `<!-- VoidAuth Login Button -->
<link rel="stylesheet" href="voidauth-theme.css">
<a class="void-login-btn void-login-btn--${theme.buttonStyle}"
   href="${issuer}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopeString)}">
  ${theme.buttonText}
</a>

<!-- Hosted consent page -->
<a href="${issuer}/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopeString)}">
  Sign in with Void (hosted)
</a>

<!-- Iframe embed -->
<iframe title="Sign in with Void" style="border:0;width:220px;height:48px"
  src="${issuer}/oauth/button?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopeString)}">
</iframe>`

  const generateJS = () => `import { VoidAuth } from '@voidauth/client/browser'

const auth = new VoidAuth({
  issuer: '${issuer}',
  clientId: '${clientId}',
  redirectUri: '${redirectUri}',
  scopes: [${scopes.map((s: string) => `'${s}'`).join(', ')}],
})

// Start login (PKCE, redirects to authorize)
await auth.login()

// After redirect back, exchange code
const { user, tokens } = await auth.handleCallback()
console.log('Logged in:', user.name)

// Check auth
if (auth.isAuthenticated()) {
  const token = auth.getToken()
}

// Logout
await auth.logout()`

  const generateNodeJS = () => `import { VoidAuthServer } from '@voidauth/client/node'

const auth = new VoidAuthServer({
  issuer: '${issuer}',
  clientId: '${clientId}',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: '${redirectUri}',
})

// Exchange authorization code for tokens
const { tokens, user } = await auth.exchangeCode('AUTH_CODE_FROM_QUERY')

// Get user info with access token
const userInfo = await auth.getUserInfo(tokens.access_token)

// Refresh an expired token
const refreshed = await auth.refreshToken(tokens.refresh_token)

// Revoke a token
await auth.revokeToken(tokens.refresh_token)

// Verify an ID token (RS256)
const claims = await auth.verifyIdToken(tokens.id_token)`

  const generateCurl = () => `# 1. Start OAuth flow - redirect user to:
# ${issuer}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopeString)}

# 2. Exchange code for tokens
curl -X POST ${issuer}/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '{
    "grant_type": "authorization_code",
    "code": "AUTH_CODE",
    "redirect_uri": "${redirectUri}",
    "client_id": "${clientId}",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'

# 3. Get user info
curl ${issuer}/oauth/userinfo \\
  -H "Authorization: Bearer ACCESS_TOKEN"

# 4. OIDC Discovery
curl ${issuer}/.well-known/openid-configuration

# 5. Get JWKS
curl ${issuer}/oauth/jwks`

  const copyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    if (copyCodeTimeout.current) clearTimeout(copyCodeTimeout.current)
    copyCodeTimeout.current = setTimeout(() => setCopied(false), 2000)
  }, [])

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard" className="flex items-center gap-2"><VoidLogo size="sm" /></Link>
            <div className="h-4 w-px bg-border" />
            <h1 className="text-sm font-semibold">Playground</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={resetTheme}>Reset</Button>
            <Button size="sm" onClick={saveTheme} disabled={saving || !selectedApp}>
              {saving ? 'Saving...' : saved ? (
                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 mr-1.5"><path d="M20 6L9 17l-5-5"/></svg>Saved</>
              ) : (
                <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 mr-1.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>Save</>
              )}
            </Button>
            <Link to="/dashboard"><Button variant="ghost" size="sm">Dashboard</Button></Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* App Selector */}
        <div className="mb-6 flex items-center gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Application</p>
            {loading ? (
              <div className="h-9 w-64 rounded-xl bg-muted animate-pulse" />
            ) : apps.length === 0 ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">No apps yet</span>
                <Link to="/dashboard"><Button size="xs" variant="outline">Create one</Button></Link>
              </div>
            ) : (
              <select value={selectedApp?.id || ''} onChange={(e) => {
                const app = apps.find((a) => a.id === e.target.value) || null
                setSelectedApp(app)
                if (app?.appTheme) {
                  setTheme({ ...DEFAULT_THEME, ...app.appTheme })
                } else {
                  setTheme(DEFAULT_THEME)
                }
              }} className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium">
                {apps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
              </select>
            )}
          </div>
          {selectedApp && <div className="text-[10px] text-muted-foreground font-mono bg-muted rounded-lg px-2 py-1">{selectedApp.clientId}</div>}
        </div>

        {selectedApp ? (
          <div className="grid grid-cols-12 gap-6">
            {/* Left: Controls */}
            <div className="col-span-5 space-y-4">
              <div className="flex gap-1 border-b border-border overflow-x-auto tab-scrollbar">
                {sections.map((s) => (
                  <button key={s.id} onClick={() => setActiveSection(s.id)} className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${activeSection === s.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                    {s.label}
                  </button>
                ))}
              </div>

              {/* Theme */}
              {activeSection === 'theme' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Mode</h3>
                    <div className="flex gap-2">
                      <button onClick={() => updateTheme({ darkMode: false })} className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${!theme.darkMode ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-foreground/30'}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 mr-1.5 inline"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
                        Light
                      </button>
                      <button onClick={() => updateTheme({ darkMode: true })} className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${theme.darkMode ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-foreground/30'}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3.5 mr-1.5 inline"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                        Dark
                      </button>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Typography</h3>
                    <div className="space-y-2">
                      <Label className="text-xs">Font Family</Label>
                      <select value={theme.fontFamily} onChange={(e) => updateTheme({ fontFamily: e.target.value })} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium">
                        {FONTS.map((f) => <option key={f.value} value={f.value}>{f.name}</option>)}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Border Radius</span>
                        <span className="font-mono text-muted-foreground">{theme.borderRadius}px</span>
                      </label>
                      <input type="range" min={0} max={24} value={theme.borderRadius} onChange={(e) => updateTheme({ borderRadius: Number(e.target.value) })} className="w-full" />
                    </div>
                  </div>
                </div>
              )}

              {/* Button */}
              {activeSection === 'button' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Button Style</h3>
                    <div className="flex gap-2">
                      {(['filled', 'outlined', 'ghost'] as const).map((s) => (
                        <button key={s} onClick={() => updateTheme({ buttonStyle: s })} className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${theme.buttonStyle === s ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-foreground/30'}`}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Button Text</Label>
                    <Input value={theme.buttonText} onChange={(e) => updateTheme({ buttonText: e.target.value })} className="text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Logo URL (optional)</Label>
                    <Input value={theme.logoUrl} onChange={(e) => updateTheme({ logoUrl: e.target.value })} placeholder="https://..." className="text-xs" />
                  </div>
                </div>
              )}

              {/* Consent */}
              {activeSection === 'consent' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Layout</h3>
                    <div className="flex gap-2">
                      {(['card', 'fullwidth', 'minimal'] as const).map((l) => (
                        <button key={l} onClick={() => updateTheme({ consentLayout: l })} className={`flex-1 px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${theme.consentLayout === l ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground hover:border-foreground/30'}`}>
                          {l.charAt(0).toUpperCase() + l.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Description</Label>
                    <Input value={theme.consentDescription} onChange={(e) => updateTheme({ consentDescription: e.target.value })} className="text-xs" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">Banner Image URL (optional)</Label>
                    <Input value={theme.bannerUrl} onChange={(e) => updateTheme({ bannerUrl: e.target.value })} placeholder="https://..." className="text-xs" />
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Banner Height</span>
                      <span className="font-mono text-muted-foreground">{theme.bannerHeight}px</span>
                    </label>
                    <input type="range" min={60} max={240} value={theme.bannerHeight} onChange={(e) => updateTheme({ bannerHeight: Number(e.target.value) })} className="w-full" />
                  </div>
                  <label className="flex items-center justify-between text-xs cursor-pointer">
                    <span className="text-muted-foreground">Show "Secured by VoidAuth"</span>
                    <div onClick={() => updateTheme({ showBranding: !theme.showBranding })} className={`w-8 h-4 rounded-full transition-colors cursor-pointer relative ${theme.showBranding ? 'bg-primary' : 'bg-muted'}`}>
                      <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${theme.showBranding ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                  </label>
                </div>
              )}

              {/* Code */}
              {activeSection === 'code' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <CodeBlock label="CSS Variables" code={generateCSS()} onCopy={() => copyCode(generateCSS())} />
                  <CodeBlock label="HTML" code={generateHTML()} onCopy={() => copyCode(generateHTML())} />
                  <CodeBlock label="JavaScript (Browser SDK)" code={generateJS()} onCopy={() => copyCode(generateJS())} />
                </div>
              )}

              {/* SDK */}
              {activeSection === 'sdk' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Browser SDK</h3>
                    <div className="space-y-2">
                      <Label className="text-xs">Install</Label>
                      <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2">
                        <code className="text-[11px] font-mono flex-1">npm install @voidauth/client</code>
                        <button onClick={() => copyCode('npm install @voidauth/client')} className="text-[10px] text-muted-foreground hover:text-foreground">Copy</button>
                      </div>
                    </div>
                    <CodeBlock label="Quick Start (Browser)" code={`import { VoidAuth } from '@voidauth/client/browser'

const auth = new VoidAuth({
  issuer: '${issuer}',
  clientId: '${clientId}',
  redirectUri: '${redirectUri}',
  scopes: [${scopes.map((s: string) => `'${s}'`).join(', ')}],
})

// Login (PKCE, redirects)
await auth.login()

// Handle callback
const { user, tokens } = await auth.handleCallback()

// Check auth
if (auth.isAuthenticated()) {
  const token = auth.getToken()
}

// Logout
await auth.logout()}`} onCopy={() => copyCode(generateJS())} />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node.js SDK</h3>
                    <div className="space-y-2">
                      <Label className="text-xs">Install</Label>
                      <div className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2">
                        <code className="text-[11px] font-mono flex-1">npm install @voidauth/client</code>
                        <button onClick={() => copyCode('npm install @voidauth/client')} className="text-[10px] text-muted-foreground hover:text-foreground">Copy</button>
                      </div>
                    </div>
                    <CodeBlock label="Quick Start (Node.js)" code={`import { VoidAuthServer } from '@voidauth/client/node'

const auth = new VoidAuthServer({
  issuer: '${issuer}',
  clientId: '${clientId}',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: '${redirectUri}',
})

// Exchange code
const { tokens, user } = await auth.exchangeCode('AUTH_CODE')

// Get user info
const userInfo = await auth.getUserInfo(tokens.access_token)

// Refresh token
const refreshed = await auth.refreshToken(tokens.refresh_token)

// Revoke token
await auth.revokeToken(tokens.refresh_token)

// Verify ID token (RS256)
const claims = await auth.verifyIdToken(tokens.id_token)`} onCopy={() => copyCode(generateNodeJS())} />
                  </div>
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">cURL</h3>
                    <CodeBlock label="API Reference" code={generateCurl()} onCopy={() => copyCode(generateCurl())} />
                  </div>
                </div>
              )}

              {/* AI Agent */}
              {activeSection === 'ai' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI Agent Integration</h3>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Download the VoidAuth integration guide for your AI coding agent. Each file contains setup instructions, API reference, and usage examples that the agent can reference as a skill.
                    </p>
                  </div>
                  <div className="flex gap-1 border-b border-border overflow-x-auto tab-scrollbar">
                    {(['opencode', 'codex', 'claude', 'cursor', 'windsurf'] as const).map((a) => (
                      <button key={a} onClick={() => setAiTab(a)} className={`px-2.5 py-1.5 text-[10px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${aiTab === a ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                        {a === 'opencode' ? 'OpenCode' : a === 'codex' ? 'Codex' : a === 'claude' ? 'Claude Code' : a === 'cursor' ? 'Cursor' : 'Windsurf'}
                      </button>
                    ))}
                  </div>

                  {aiTab === 'opencode' && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">Copy the curl command below to download the VoidAuth skill file for OpenCode:</p>
                      <CodeBlock label="curl" code={`curl -o ~/.opencode/skills/voidauth.md \\
  https://auth.stwupid.tech/agents/opencode.md`} onCopy={() => copyCode(`curl -o ~/.opencode/skills/voidauth.md https://auth.stwupid.tech/agents/opencode.md`)} />
                      <p className="text-[10px] text-muted-foreground">Place the file in your OpenCode skills directory. The agent will auto-discover it.</p>
                    </div>
                  )}

                  {aiTab === 'codex' && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">Copy the curl command below to download the VoidAuth skill file for OpenAI Codex:</p>
                      <CodeBlock label="curl" code={`curl -o ~/.codex/instructions/voidauth.md \\
  https://auth.stwupid.tech/agents/codex.md`} onCopy={() => copyCode(`curl -o ~/.codex/instructions/voidauth.md https://auth.stwupid.tech/agents/codex.md`)} />
                      <p className="text-[10px] text-muted-foreground">Place the file in your Codex instructions directory. The agent will reference it automatically.</p>
                    </div>
                  )}

                  {aiTab === 'claude' && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">Copy the curl command below to download the VoidAuth skill file for Claude Code:</p>
                      <CodeBlock label="curl" code={`curl -o ~/.claude/commands/voidauth.md \\
  https://auth.stwupid.tech/agents/claude-code.md`} onCopy={() => copyCode(`curl -o ~/.claude/commands/voidauth.md https://auth.stwupid.tech/agents/claude-code.md`)} />
                      <p className="text-[10px] text-muted-foreground">Place the file in your Claude Code commands directory. It will appear as a slash command.</p>
                    </div>
                  )}

                  {aiTab === 'cursor' && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">Copy the curl command below to download the VoidAuth rules file for Cursor:</p>
                      <CodeBlock label="curl" code={`curl -o .cursor/rules/voidauth.mdc \\
  https://auth.stwupid.tech/agents/cursor.mdc`} onCopy={() => copyCode(`curl -o .cursor/rules/voidauth.mdc https://auth.stwupid.tech/agents/cursor.mdc`)} />
                      <p className="text-[10px] text-muted-foreground">Place the file in your project's .cursor/rules/ directory. Cursor will apply it to all chat sessions.</p>
                    </div>
                  )}

                  {aiTab === 'windsurf' && (
                    <div className="space-y-3">
                      <p className="text-[11px] text-muted-foreground">Copy the curl command below to download the VoidAuth rules file for Windsurf:</p>
                      <CodeBlock label="curl" code={`curl -o .windsurfrules \\
  https://auth.stwupid.tech/agents/windsurf.md`} onCopy={() => copyCode(`curl -o .windsurfrules https://auth.stwupid.tech/agents/windsurf.md`)} />
                      <p className="text-[10px] text-muted-foreground">Place the file in your project root. Windsurf will auto-detect it.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Live Preview */}
            <div className="col-span-7">
              <div className="sticky top-20 space-y-4">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Live Preview</h3>

                {/* Login Button */}
                <div className="rounded-2xl border border-border p-6">
                  <p className="text-[10px] uppercase tracking-wider font-medium mb-4 text-muted-foreground">Login Button</p>
                  <div className="flex justify-center">
                    <button
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-85"
                      style={{
                        fontFamily: theme.fontFamily,
                        borderRadius: theme.borderRadius,
                        background: theme.buttonStyle === 'filled' ? '#171717' : 'transparent',
                        color: theme.buttonStyle === 'filled' ? '#fff' : '#171717',
                        border: theme.buttonStyle === 'outlined' ? '1.5px solid #171717' : 'none',
                      }}
                    >
                      {theme.logoUrl ? (
                        <img src={theme.logoUrl} alt="" className="size-5 rounded" />
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
                      )}
                      {theme.buttonText}
                    </button>
                  </div>
                </div>

                {/* Consent Screen */}
                <div className="rounded-2xl border border-border overflow-hidden" style={{ fontFamily: theme.fontFamily }}>
                  <p className="text-[10px] uppercase tracking-wider font-medium px-5 pt-4 pb-2 text-muted-foreground">Consent Screen</p>

                  {theme.bannerUrl && (
                    <div className="w-full overflow-hidden" style={{ height: theme.bannerHeight }}>
                      <img src={theme.bannerUrl} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="px-5 pb-6 space-y-5" style={{ maxWidth: theme.consentLayout === 'fullwidth' ? '100%' : '380px', margin: '0 auto' }}>
                    {/* VoidAuth Logo */}
                    <div className="flex justify-center">
                      <VoidLogo />
                    </div>

                    {/* App Identity */}
                    <div className="space-y-1.5 text-center">
                      <div className="relative inline-flex justify-center">
                        {selectedApp.logoUrl ? (
                          <img src={selectedApp.logoUrl} alt={selectedApp.name} className="size-14 rounded-2xl border border-border" />
                        ) : (
                          <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted text-lg font-bold">
                            {selectedApp.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <h1 className="text-xl font-semibold">{selectedApp.name}</h1>
                      <p className="text-sm text-muted-foreground">{theme.consentDescription}</p>
                      {selectedApp.verificationStatus === 'unverified' && (
                        <p className="text-[10px] text-muted-foreground/60 mt-1">Unverified app. Proceed with caution.</p>
                      )}
                    </div>

                    {/* User Card */}
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Authorize as</p>
                      <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted p-3">
                        <div className="size-9 rounded-full flex items-center justify-center text-sm font-medium bg-border">U</div>
                        <div className="flex-1 space-y-0.5">
                          <p className="text-sm font-medium">User Name</p>
                          <p className="text-xs text-muted-foreground">user@example.com</p>
                        </div>
                      </div>
                    </div>

                    <div className="h-px bg-border" />

                    {/* Permissions */}
                    <div className="space-y-2.5">
                      <p className="text-xs font-medium text-muted-foreground">{selectedApp.name} will be able to:</p>
                      <ul className="space-y-2">
                        {scopes.map((s) => (
                          <li key={s} className="flex items-start gap-2 text-sm">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mt-0.5 size-3.5 shrink-0 text-green-500"><path d="M20 6L9 17l-5-5"/></svg>
                            <span>{SCOPE_LABELS[s] || s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="h-px bg-border" />

                    {/* Actions */}
                    <div className="space-y-2.5">
                      <button className="w-full py-2.5 text-sm font-medium rounded-xl bg-primary text-primary-foreground" style={{ borderRadius: theme.borderRadius }}>
                        Authorize
                      </button>
                      <button className="w-full py-2.5 text-sm font-medium rounded-xl text-muted-foreground" style={{ borderRadius: theme.borderRadius }}>
                        Cancel
                      </button>
                    </div>

                    <p className="text-center text-xs text-muted-foreground">
                      By authorizing, you allow this app to access your information according to the <span className="underline underline-offset-4">privacy policy</span>
                    </p>

                    {theme.showBranding && (
                      <div className="pt-2 border-t border-border text-center text-[10px] text-muted-foreground">
                        Secured by VoidAuth
                      </div>
                    )}
                  </div>
                </div>

                {/* Iframe Embed */}
                <div className="rounded-2xl border border-border p-6">
                  <p className="text-[10px] uppercase tracking-wider font-medium mb-4 text-muted-foreground">Iframe Embed</p>
                  <div className="flex justify-center">
                    <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-border text-sm font-medium" style={{ fontFamily: theme.fontFamily, borderRadius: theme.borderRadius }}>
                      {theme.logoUrl ? <img src={theme.logoUrl} alt="" className="size-5 rounded" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>}
                      {theme.buttonText}
                    </div>
                  </div>
                  <p className="text-center text-[10px] mt-3 text-muted-foreground">Renders in a 220x48 iframe</p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-12 text-muted-foreground mb-4">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
            <h2 className="text-lg font-semibold mb-1">No application selected</h2>
            <p className="text-sm text-muted-foreground max-w-sm">Create a developer app first, then come back to customize your integration.</p>
            <Link to="/dashboard" className="mt-4"><Button size="sm">Go to Dashboard</Button></Link>
          </div>
        )}
      </main>
    </div>
  )
}

function CodeBlock({ label, code, onCopy }: { label: string; code: string; onCopy: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium hover:bg-muted/30 transition-colors">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span onClick={(e) => { e.stopPropagation(); onCopy() }} className="text-[10px] text-muted-foreground hover:text-foreground">Copy</span>
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className={`size-3 transition-transform ${open ? 'rotate-180' : ''}`}><path d="M5 8l5 5 5-5" /></svg>
        </div>
      </button>
      {open && (
        <pre className="px-3 pb-3 font-mono text-[10px] text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap leading-relaxed bg-muted/10">
          {code}
        </pre>
      )}
    </div>
  )
}
