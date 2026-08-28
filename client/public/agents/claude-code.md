# VoidAuth — Claude Code Integration Skill

## Overview
VoidAuth is a self-hosted OAuth 2.0 / OpenID Connect identity server. This skill covers authentication flows, token management, and the Storage API.

## Issuer
- Production: `https://auth.stwupid.tech`
- Local: `http://localhost:3001`

## Setup

### 1. Create OAuth App
```bash
curl -X POST https://auth.stwupid.tech/users/apps/manage \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My App",
    "redirect_uris": ["http://localhost:3000/callback"],
    "allowed_scopes": ["openid", "profile", "email"]
  }'
```

### 2. Install SDK
```bash
npm install @voidauth/client
```

### 3. Browser Usage
```javascript
import { VoidAuth } from '@voidauth/client/browser'

const auth = new VoidAuth({
  issuer: 'https://auth.stwupid.tech',
  clientId: '<CLIENT_ID>',
  redirectUri: 'http://localhost:3000/callback',
  scopes: ['openid', 'profile', 'email'],
})

await auth.login()
const { user, tokens } = await auth.handleCallback()
if (auth.isAuthenticated()) { const t = auth.getToken() }
await auth.logout()
```

### 4. Node.js Usage (session-aware, recommended)
```javascript
import express from 'express'
import { VoidAuthClient } from '@voidauth/client/node'

const app = express()
const auth = new VoidAuthClient({
  issuer: 'https://auth.stwupid.tech',
  clientId: '<CLIENT_ID>',
  clientSecret: '<CLIENT_SECRET>',
  redirectUri: 'http://localhost:3000/callback',
  sessionSecret: process.env.SESSION_SECRET, // optional — ephemeral if omitted
  cookieSecure: process.env.NODE_ENV === 'production',
})

app.get('/', async (req, res) => {
  const session = await auth.getSession(req.headers.cookie)
  if (!session) {
    const { url, stateCookie } = auth.buildLoginUrl('/')
    res.setHeader('set-cookie', stateCookie)
    return res.redirect(url)
  }
  res.send(`<h1>Hello ${session.user.email}</h1>`)
})

app.get('/callback', async (req, res) => {
  try {
    const result = await auth.handleCallback(
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
  res.setHeader('set-cookie', auth.destroySession())
  res.redirect('/')
})

app.listen(3000, () => console.log('Listening on http://localhost:3000'))
```

### 5. Node.js Usage (low-level)
```javascript
import { VoidAuthServer } from '@voidauth/client/node'

const auth = new VoidAuthServer({
  issuer: 'https://auth.stwupid.tech',
  clientId: '<CLIENT_ID>',
  clientSecret: '<CLIENT_SECRET>',
  redirectUri: 'http://localhost:3000/callback',
})

const tokens = await auth.exchangeCode('AUTH_CODE')
const userInfo = await auth.getUserInfo(tokens.accessToken)
const refreshed = await auth.refreshToken(tokens.refreshToken)
await auth.revokeToken(tokens.refreshToken)
const claims = await auth.verifyIdToken(tokens.idToken!)
```

## OAuth Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/oauth/authorize` | GET | Authorization redirect |
| `/oauth/token` | POST | Code exchange + refresh |
| `/oauth/userinfo` | GET | User profile |
| `/oauth/jwks` | GET | JWKS (RS256 keys) |
| `/.well-known/openid-configuration` | GET | OIDC discovery |

## Storage API

### Usage
```bash
curl https://auth.stwupid.tech/storage/usage -H "Authorization: Bearer <TOKEN>"
# { used: 1024, quota: 104857600, files: 3 }
```

### Files
```bash
# Upload
curl -X POST https://auth.stwupid.tech/storage/files \
  -H "Authorization: Bearer <TOKEN>" \
  -F "file=@photo.jpg" -F "client_id=<ID>"

# List (paginated)
curl "https://auth.stwupid.tech/storage/files?page=1&limit=20" \
  -H "Authorization: Bearer <TOKEN>"

# Delete
curl -X DELETE https://auth.stwupid.tech/storage/files/<ID> \
  -H "Authorization: Bearer <TOKEN>"
```

### App Data (JSON)
```bash
# Save
curl -X POST https://auth.stwupid.tech/storage/data \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"client_id": "<ID>", "key": "config", "value": {"theme": "dark"}}'

# Read
curl "https://auth.stwupid.tech/storage/data?client_id=<ID>&key=config" \
  -H "Authorization: Bearer <TOKEN>"

# Delete
curl -X DELETE "https://auth.stwupid.tech/storage/data?client_id=<ID>&key=config" \
  -H "Authorization: Bearer <TOKEN>"
```

## Scopes
| Scope | Access |
|---|---|
| `openid` | Identity (required) |
| `profile` | Name, username, avatar |
| `email` | Email address |
| `read` | Read user data |
| `write` | Write user data |

## Token Expiry
- Access token: 15 minutes
- Refresh token: 7 days
- Auth code: 10 minutes

## Notes
- PKCE supported for public clients
- RS256 for ID token signing
- Rate limit: 120 req/min global
- User roles: `user`, `admin`
