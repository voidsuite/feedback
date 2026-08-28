import { useState } from 'react'

interface CodeOutputProps {
  selectedApp: any
  flowSteps?: any[]
  canvasComponents?: any[]
  config?: any
}

type Tab = 'browser' | 'node' | 'curl' | 'html'

export function CodeOutput({ selectedApp, flowSteps = [], canvasComponents = [], config = {} }: CodeOutputProps) {
  const [activeTab, setActiveTab] = useState<Tab>('browser')
  const [copied, setCopied] = useState(false)

  const clientId = selectedApp?.clientId || 'YOUR_CLIENT_ID'
  const issuer = import.meta.env.VITE_API_URL || 'https://auth.stwupid.tech'
  const redirectUri = config.redirectUri || selectedApp?.redirectUris?.[0] || 'http://localhost:5173/callback'
  const scopes = (config.scopes || selectedApp?.allowedScopes || ['openid', 'profile', 'email']).join(' ')
  const pkce = config.pkce !== false

  const browserCode = `import { VoidAuth } from '@voidauth/client/browser'

const auth = new VoidAuth({
  issuer: '${issuer}',
  clientId: '${clientId}',
  redirectUri: '${redirectUri}',
  scopes: [${scopes.split(' ').map((s: string) => `'${s}'`).join(', ')}],
})

// Start login (PKCE enabled, redirects to authorize)
await auth.login()

// After redirect back, exchange code for tokens
const { user, tokens } = await auth.handleCallback()
console.log('Logged in as:', user.name)

// Get user anytime
const user = auth.getUser()

// Check auth state
if (auth.isAuthenticated()) {
  const token = auth.getToken()
}

// Logout
await auth.logout()`

  const nodeCode = `import { VoidAuthServer } from '@voidauth/client/node'

const auth = new VoidAuthServer({
  issuer: '${issuer}',
  clientId: '${clientId}',
  clientSecret: 'YOUR_CLIENT_SECRET',
  redirectUri: '${redirectUri}',
})

// Generate authorization URL
const codeVerifier = auth.generateCodeVerifier()
const codeChallenge = auth.generateCodeChallenge(codeVerifier)
const authUrl = auth.generateAuthorizationUrl({
  scopes: [${scopes.split(' ').map((s: string) => `'${s}'`).join(', ')}],
  codeChallenge,
})

// After user authorizes, exchange code for tokens
const tokens = await auth.exchangeCode('AUTH_CODE', codeVerifier)
console.log('Access token:', tokens.accessToken)

// Get user info
const user = await auth.getUserInfo(tokens.accessToken)

// Refresh token
const refreshed = await auth.refreshToken(tokens.refreshToken)

// Verify ID token
const payload = await auth.verifyIdToken(tokens.idToken)

// Revoke token
await auth.revokeToken(tokens.refreshToken)`

  const curlCode = `# 1. Redirect user to authorize
open "${issuer}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=random"

# 2. Exchange code for tokens
curl -X POST ${issuer}/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    grant_type: 'authorization_code',
    code: 'AUTH_CODE',
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: 'YOUR_CLIENT_SECRET',
  }, null, 2)}'

# 3. Get user info
curl ${issuer}/oauth/userinfo \\
  -H "Authorization: Bearer ACCESS_TOKEN"

# 4. OIDC Discovery
curl ${issuer}/.well-known/openid-configuration

# 5. JWKS
curl ${issuer}/oauth/jwks`

  const htmlCode = `<!-- VoidAuth Login Button (iframe) -->
<iframe
  title="Sign in with Void"
  style="border:0;width:220px;height:48px"
  src="${issuer}/oauth/button?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}"
></iframe>

<!-- Or build your own button -->
<a href="${issuer}/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}">
  Sign in with Void
</a>

<!-- VoidAuth hosted consent page -->
<a href="${issuer}/oauth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}">
  Sign in with Void (hosted)
</a>`

  const codes: Record<Tab, string> = {
    browser: browserCode,
    node: nodeCode,
    curl: curlCode,
    html: htmlCode,
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'browser', label: 'Browser SDK' },
    { id: 'node', label: 'Node.js SDK' },
    { id: 'curl', label: 'cURL' },
    { id: 'html', label: 'HTML' },
  ]

  const copyCode = () => {
    navigator.clipboard.writeText(codes[activeTab])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                activeTab === t.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={copyCode}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3 text-green-500">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="max-h-[400px] overflow-auto rounded-xl border border-border bg-background px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">
        {codes[activeTab]}
      </pre>
    </div>
  )
}
