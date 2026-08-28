# VoidAuth — Codex Integration Guide

## Overview
VoidAuth is a self-hosted OAuth 2.0 / OpenID Connect identity server. Use this guide to authenticate users, exchange tokens, manage sessions, and use the Storage API.

## Issuer
- Production: `https://auth.stwupid.tech`
- Local: `http://localhost:3001`

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

### 2. Browser SDK (PKCE)
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

### 3. Node.js SDK (session-aware, recommended)
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

### 4. Node.js SDK (low-level)
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

### 5. Manual Token Exchange
```bash
curl -X POST https://auth.stwupid.tech/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "authorization_code",
    "code": "<AUTH_CODE>",
    "redirect_uri": "<REDIRECT_URI>",
    "client_id": "<CLIENT_ID>",
    "client_secret": "<CLIENT_SECRET>"
  }'

curl https://auth.stwupid.tech/oauth/userinfo \
  -H "Authorization: Bearer <ACCESS_TOKEN>"
```

## API Reference

### OAuth Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/oauth/authorize` | GET | Start authorization flow |
| `/oauth/token` | POST | Exchange code or refresh |
| `/oauth/userinfo` | GET | Get user info |
| `/oauth/jwks` | GET | JSON Web Key Set |
| `/.well-known/openid-configuration` | GET | OIDC discovery |

### Storage API
```bash
# Usage
curl https://auth.stwupid.tech/storage/usage -H "Authorization: Bearer <TOKEN>"

# Files
curl -X POST https://auth.stwupid.tech/storage/files \
  -H "Authorization: Bearer <TOKEN>" -F "file=@image.png" -F "client_id=<ID>"

curl "https://auth.stwupid.tech/storage/files?page=1&limit=20" -H "Authorization: Bearer <TOKEN>"

# App Data (JSON)
curl -X POST https://auth.stwupid.tech/storage/data \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \
  -d '{"client_id": "<ID>", "key": "notes", "value": []}'
```

## Scopes
- `openid` — OpenID Connect identity (required)
- `profile` — Name, username, avatar
- `email` — Email address
- `read` — Read access
- `write` — Write access

## Notes
- Access tokens: 15min expiry
- Refresh tokens: 7day expiry
- OAuth codes: 10min expiry
- PKCE supported (use `code_verifier` + `code_challenge`)
- RS256 for ID tokens
- Rate limit: 120 req/min
