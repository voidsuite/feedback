import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

const API_BASE = import.meta.env.VITE_API_URL || "https://auth.stwupid.tech"

interface DevApp {
  id: string
  clientId: string
  clientSecret: string
  name: string
  redirectUris: string[]
  allowedScopes: string[]
  verificationStatus: string
}

interface Props {
  app: DevApp
}

type Tab = "oauth" | "api" | "examples" | "decode"

const tabs: { id: Tab; label: string }[] = [
  { id: "oauth", label: "OAuth Flow" },
  { id: "api", label: "API Tester" },
  { id: "examples", label: "Code Examples" },
  { id: "decode", label: "Token Decoder" },
]

const sampleEndpoints = [
  { method: "GET", path: "/oauth/userinfo", desc: "Get current user info" },
  { method: "GET", path: "/storage/usage", desc: "Check storage quota" },
  { method: "GET", path: "/storage/files", desc: "List stored files" },
  { method: "GET", path: "/storage/data?client_id={id}", desc: "List app data keys" },
]

export function DeveloperPlayground({ app }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("oauth")
  const [apiToken, setApiToken] = useState("")
  const [apiResponse, setApiResponse] = useState<string>("")
  const [apiLoading, setApiLoading] = useState(false)
  const [selectedEndpoint, setSelectedEndpoint] = useState(0)
  const [jwtInput, setJwtInput] = useState("")
  const [decodedJwt, setDecodedJwt] = useState<{ header: any; payload: any; error?: string } | null>(null)

  const state = crypto.randomUUID().slice(0, 8)
  const nonce = crypto.randomUUID().slice(0, 16)
  const redirectUri = app.redirectUris[0] || "http://localhost:5173/callback"
  const scopes = app.allowedScopes.length > 0 ? app.allowedScopes.join(" ") : "profile email"

  const authorizeUrl = `${API_BASE}/oauth/authorize?client_id=${encodeURIComponent(app.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}&nonce=${nonce}`

  const testApi = async () => {
    const ep = sampleEndpoints[selectedEndpoint]
    const path = ep.path.replace("{id}", app.clientId)
    setApiLoading(true)
    setApiResponse("")
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: apiToken ? { Authorization: `Bearer ${apiToken}` } : {},
      })
      const data = await res.text()
      setApiResponse(`HTTP ${res.status}\n${data}`)
    } catch (e: any) {
      setApiResponse(`Error: ${e.message}`)
    } finally {
      setApiLoading(false)
    }
  }

  const decodeJwt = () => {
    try {
      const parts = jwtInput.trim().split(".")
      if (parts.length < 2) {
        setDecodedJwt({ header: null, payload: null, error: "Invalid JWT format" })
        return
      }
      const header = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")))
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")))
      setDecodedJwt({ header, payload })
    } catch (e: any) {
      setDecodedJwt({ header: null, payload: null, error: e.message })
    }
  }

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code)
  }

  const curlTokenExample = `curl -X POST ${API_BASE}/oauth/token \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify({
    grant_type: "authorization_code",
    code: "YOUR_AUTH_CODE",
    redirect_uri: redirectUri,
    client_id: app.clientId,
    client_secret: "YOUR_CLIENT_SECRET",
  }, null, 2)}'`

  const curlUserinfoExample = `curl ${API_BASE}/oauth/userinfo \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"`

  const nodeExample = `const VOIDAUTH = "${API_BASE}"
const CLIENT_ID = "${app.clientId}"
const REDIRECT_URI = "${redirectUri}"

// Step 1: Redirect user to authorize
const authUrl = new URL(\`\${VOIDAUTH}/oauth/authorize\`)
authUrl.searchParams.set("client_id", CLIENT_ID)
authUrl.searchParams.set("redirect_uri", REDIRECT_URI)
authUrl.searchParams.set("response_type", "code")
authUrl.searchParams.set("scope", "${scopes}")
authUrl.searchParams.set("state", crypto.randomUUID().slice(0, 8))
// window.location.href = authUrl.toString()

// Step 2: Exchange code for tokens
const exchangeRes = await fetch(\`\${VOIDAUTH}/oauth/token\`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    grant_type: "authorization_code",
    code: "AUTH_CODE_FROM_CALLBACK",
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: "YOUR_CLIENT_SECRET",
  }),
})
const { access_token, id_token, user } = await exchangeRes.json()

// Step 3: Get user info
const userRes = await fetch(\`\${VOIDAUTH}/oauth/userinfo\`, {
  headers: { Authorization: \`Bearer \${access_token}\` },
})
const profile = await userRes.json()
console.log("User:", profile)`

  const pythonExample = `import requests

VOIDAUTH = "${API_BASE}"
CLIENT_ID = "${app.clientId}"
REDIRECT_URI = "${redirectUri}"

# Step 1: Build authorize URL
auth_url = (
    f"{VOIDAUTH}/oauth/authorize"
    f"?client_id={CLIENT_ID}"
    f"&redirect_uri={REDIRECT_URI}"
    f"&response_type=code"
    f"&scope=${scopes}"
    f"&state=random_state"
)
# Open auth_url in browser

# Step 2: Exchange code for tokens
token_res = requests.post(f"{VOIDAUTH}/oauth/token", json={
    "grant_type": "authorization_code",
    "code": "AUTH_CODE_FROM_CALLBACK",
    "redirect_uri": REDIRECT_URI,
    "client_id": CLIENT_ID,
    "client_secret": "YOUR_CLIENT_SECRET",
})
tokens = token_res.json()
access_token = tokens["access_token"]

# Step 3: Get user info
user_res = requests.get(
    f"{VOIDAUTH}/oauth/userinfo",
    headers={"Authorization": f"Bearer {access_token}"},
)
print("User:", user_res.json())`

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === t.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "oauth" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 1: Authorize</h4>
            <p className="text-xs text-muted-foreground">Redirect the user to this URL to grant consent:</p>
            <div className="relative">
              <code className="block rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                {authorizeUrl}
              </code>
              <Button size="xs" variant="ghost" className="absolute top-1 right-1" onClick={() => copyCode(authorizeUrl)}>Copy</Button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 2: Exchange Code</h4>
            <p className="text-xs text-muted-foreground">After the user approves, exchange the authorization code for tokens:</p>
            <div className="relative">
              <code className="block rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                {curlTokenExample}
              </code>
              <Button size="xs" variant="ghost" className="absolute top-1 right-1" onClick={() => copyCode(curlTokenExample)}>Copy</Button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Step 3: Get User Info</h4>
            <p className="text-xs text-muted-foreground">Use the access token to fetch the user's profile:</p>
            <div className="relative">
              <code className="block rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground overflow-x-auto whitespace-pre-wrap">
                {curlUserinfoExample}
              </code>
              <Button size="xs" variant="ghost" className="absolute top-1 right-1" onClick={() => copyCode(curlUserinfoExample)}>Copy</Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">OIDC Discovery:</span>{" "}
              <code className="text-[11px]">{API_BASE}/.well-known/openid-configuration</code>
            </p>
          </div>
        </div>
      )}

      {activeTab === "api" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Bearer Token</Label>
            <Input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Paste an access token to test authenticated endpoints"
              className="font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Endpoint</Label>
            <div className="flex gap-2">
              <select
                value={selectedEndpoint}
                onChange={(e) => setSelectedEndpoint(Number(e.target.value))}
                className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono"
              >
                {sampleEndpoints.map((ep, i) => (
                  <option key={i} value={i}>
                    {ep.method} {ep.path} — {ep.desc}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={testApi} disabled={apiLoading}>
                {apiLoading ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>

          {apiResponse && (
            <div className="space-y-1">
              <Label className="text-xs">Response</Label>
              <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
                {apiResponse}
              </pre>
            </div>
          )}
        </div>
      )}

      {activeTab === "examples" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Node.js / Bun</h4>
              <Button size="xs" variant="ghost" onClick={() => copyCode(nodeExample)}>Copy</Button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
              {nodeExample}
            </pre>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Python</h4>
              <Button size="xs" variant="ghost" onClick={() => copyCode(pythonExample)}>Copy</Button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground whitespace-pre-wrap">
              {pythonExample}
            </pre>
          </div>
        </div>
      )}

      {activeTab === "decode" && (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Paste a JWT (access token or id_token)</Label>
            <Textarea
              value={jwtInput}
              onChange={(e) => setJwtInput(e.target.value)}
              placeholder="eyJhbGciOiJSUzI1NiIs..."
              rows={3}
              className="font-mono text-[11px]"
            />
            <Button size="sm" onClick={decodeJwt}>Decode</Button>
          </div>

          {decodedJwt && (
            <div className="space-y-3">
              {decodedJwt.error ? (
                <div className="rounded-xl bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{decodedJwt.error}</div>
              ) : (
                <>
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Header</h4>
                    <pre className="rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground overflow-auto max-h-32 whitespace-pre-wrap">
                      {JSON.stringify(decodedJwt.header, null, 2)}
                    </pre>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payload</h4>
                    <pre className="rounded-xl border border-border bg-background px-3 py-2.5 font-mono text-[11px] text-muted-foreground overflow-auto max-h-48 whitespace-pre-wrap">
                      {JSON.stringify(decodedJwt.payload, null, 2)}
                    </pre>
                  </div>
                  {decodedJwt.payload.exp && (
                    <div className="flex gap-4 text-[11px] text-muted-foreground">
                      <span>Expires: {new Date(decodedJwt.payload.exp * 1000).toLocaleString()}</span>
                      {decodedJwt.payload.iat && (
                        <span>Issued: {new Date(decodedJwt.payload.iat * 1000).toLocaleString()}</span>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
