# VoidAuth — Integration Skill

## Overview
VoidAuth is a self-hosted OAuth 2.0 / OpenID Connect identity server. Use this guide to authenticate users, exchange tokens, manage sessions, and use the Storage API.

## Issuer
- Production: `https://auth.stwupid.tech`
- Local: `http://localhost:3001`

## Install
```bash
npm install @voidauth/client
```

## Quick Start

### 1. Create an OAuth App
```bash
curl -X POST https://auth.stwupid.tech/users/apps/manage \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App",
    "redirect_uris": ["http://localhost:3000/callback"],
    "allowed_scopes": ["openid", "profile", "email"]
  }'
```
Response: `{ id, clientId, clientSecret, name, ... }`

### 2. Authorization Code Flow (Browser)
```javascript
import { VoidAuth } from '@voidauth/client/browser'

const auth = new VoidAuth({
  issuer: 'https://auth.stwupid.tech',
  clientId: '<CLIENT_ID>',
  redirectUri: 'http://localhost:3000/callback',
  scopes: ['openid', 'profile', 'email'],
})

// Redirects to VoidAuth authorize page
await auth.login()

// After redirect back, exchange code for tokens
const { user, tokens } = await auth.handleCallback()
// tokens.idToken, tokens.accessToken, tokens.refreshToken

// Check if authenticated (local token expiry only)
if (auth.isAuthenticated()) {
  const token = auth.getToken()
}

// Validate session against the server (detects revoked access)
const valid = await auth.validateSession()

// Logout
await auth.logout()
```

### 3. Node.js (Express — session-aware)
```javascript
import express from 'express'
import { VoidAuthClient } from '@voidauth/client/node'

const app = express()

const voidauth = new VoidAuthClient({
  issuer: 'https://auth.stwupid.tech',
  clientId: '<CLIENT_ID>',
  clientSecret: '<CLIENT_SECRET>',
  redirectUri: 'http://localhost:3000/callback',
  sessionSecret: process.env.SESSION_SECRET, // optional — ephemeral if omitted
  cookieSecure: process.env.NODE_ENV === 'production',
})

app.get('/', async (req, res) => {
  const session = await voidauth.getSession(req.headers.cookie)
  if (!session) {
    const { url, stateCookie } = voidauth.buildLoginUrl('/')
    res.setHeader('set-cookie', stateCookie)
    res.redirect(url)
    return
  }
  res.send(`<h1>Hello ${session.user.email}</h1>`)
})

app.get('/callback', async (req, res) => {
  try {
    const result = await voidauth.handleCallback(
      `${req.protocol}://${req.get('host')}${req.originalUrl}`,
      req.headers.cookie
    )
    res.setHeader('set-cookie', [result.setCookie, result.clearStateCookie!])
    res.redirect(result.returnTo)
  } catch (err) {
    res.status(400).send((err as Error).message)
  }
})

app.get('/logout', (_req, res) => {
  res.setHeader('set-cookie', voidauth.destroySession())
  res.redirect('/')
})

app.listen(3000, () => console.log('Listening on http://localhost:3000'))
```

### 4. Node.js (low-level)
```javascript
import { VoidAuthServer } from '@voidauth/client/node'

const auth = new VoidAuthServer({
  issuer: 'https://auth.stwupid.tech',
  clientId: '<CLIENT_ID>',
  clientSecret: '<CLIENT_SECRET>',
  redirectUri: 'http://localhost:3000/callback',
})

// Exchange authorization code
const tokens = await auth.exchangeCode('AUTH_CODE_FROM_QUERY')

// Get user info
const userInfo = await auth.getUserInfo(tokens.accessToken)

// Refresh expired token
const refreshed = await auth.refreshToken(tokens.refreshToken)

// Revoke a token
await auth.revokeToken(tokens.refreshToken)

// Verify ID token
const claims = await auth.verifyIdToken(tokens.idToken!)
```

### 5. Manual Token Exchange (cURL)
```bash
# Exchange code for tokens
curl -X POST https://auth.stwupid.tech/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "<AUTH_CODE>",
    "redirect_uri": "<REDIRECT_URI>",
    "client_id": "<CLIENT_ID>",
    "client_secret": "<CLIENT_SECRET>"
  }'

# Response: { access_token, id_token, refresh_token, expires_in, user }

# Get user info
curl https://auth.stwupid.tech/oauth/userinfo \
  -H "Authorization: Bearer <ACCESS_TOKEN>"

# OIDC Discovery
curl https://auth.stwupid.tech/.well-known/openid-configuration

# JWKS
curl https://auth.stwupid.tech/oauth/jwks
```

## OAuth Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/oauth/authorize` | GET | Start authorization flow |
| `/oauth/token` | POST | Exchange code or refresh token |
| `/oauth/userinfo` | GET | Get authenticated user info |
| `/oauth/jwks` | GET | JSON Web Key Set |
| `/.well-known/openid-configuration` | GET | OIDC discovery |

## Storage API
All endpoints require `Authorization: Bearer <ACCESS_TOKEN>`. Tokens are scoped to the OAuth client that issued them — an app can only access its own data.

### Usage
```bash
curl https://auth.stwupid.tech/storage/usage \
  -H "Authorization: Bearer <TOKEN>"
# { used: 1024, quota: 104857600, files: 3 }
```

### Files
```bash
# Upload
curl -X POST https://auth.stwupid.tech/storage/files \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@image.png" \
  -F "client_id=<CLIENT_ID>"

# List
curl "https://auth.stwupid.tech/storage/files?page=1&limit=20" \
  -H "Authorization: Bearer <TOKEN>"

# Delete
curl -X DELETE https://auth.stwupid.tech/storage/files/<FILE_ID> \
  -H "Authorization: Bearer <TOKEN>"
```

### App Data (JSON)
```bash
# Save
curl -X POST https://auth.stwupid.tech/storage/data \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"client_id": "<CLIENT_ID>", "key": "notes", "value": [{"id": 1, "content": "Hello"}]}'

# Read
curl "https://auth.stwupid.tech/storage/data?client_id=<CLIENT_ID>&key=notes" \
  -H "Authorization: Bearer <TOKEN>"

# Delete
curl -X DELETE "https://auth.stwupid.tech/storage/data?client_id=<CLIENT_ID>&key=notes" \
  -H "Authorization: Bearer <TOKEN>"
```

## Scopes
| Scope | Description |
|---|---|
| `openid` | OpenID Connect identity (required) |
| `profile` | Name, username, avatar |
| `email` | Email address |
| `read` | Read access to user data |
| `write` | Write access to user data |

## User Roles
- `user` — standard user
- `admin` — full access to admin panel

## Notes
- Access tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- OAuth authorization codes expire in 10 minutes
- PKCE is supported (use `code_verifier` + `code_challenge`)
- The server uses RS256 for ID tokens
- Rate limit: 120 requests/minute global
