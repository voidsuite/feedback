import { Hono } from 'hono';
import { randomUUID, randomBytes, timingSafeEqual } from 'crypto';
import { query, queryOne } from '../db/connection.js';
import { generateSecureToken } from '../utils/crypto.js';
import { authMiddleware, getAuth, resolveSessionCookie } from '../middleware/auth.js';
import { oauthAuthorizeSchema, oauthTokenSchema, oauthConsentSchema, oauthIntrospectSchema, oauthRevokeSchema } from '../validators/index.js';
import { config } from '../config/index.js';
import { extractBearerToken, verifyToken, signJwt } from '../utils/jwt.js';
import { getClientIP } from '../utils/ip.js';
import { auditLog } from '../utils/audit.js';

const oauth = new Hono();

function safeSecretEqual(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

async function ensurePKCETable() {
  await query(`
    CREATE TABLE IF NOT EXISTS oauth_challenges (
      code VARCHAR(255) NOT NULL UNIQUE,
      code_challenge VARCHAR(255) NULL,
      code_challenge_method VARCHAR(16) NULL DEFAULT 'S256',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (code) REFERENCES oauth_codes(code) ON DELETE CASCADE,
      INDEX idx_code (code)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

function parseScopes(scope?: string | null): string[] {
  // Supports both `profile email` and `profile,email`
  if (!scope) return ['profile'];
  return scope
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function scopesToString(scopes: string[]): string {
  // Canonical storage format (space-separated)
  return scopes.join(' ');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

/**
 * GET /oauth/button
 * Returns a small embeddable "Sign in with Void" button (HTML).
 *
 * Usage (recommended): embed as an iframe:
 *   <iframe src="http://localhost:3001/oauth/button?client_id=...&redirect_uri=...&scope=profile,email"
 *           style="border:0;width:220px;height:48px" title="Sign in with Void"></iframe>
 */
oauth.get('/button', async (c) => {
  try {
    const rawParams = c.req.query();
    const params = {
      ...rawParams,
      response_type: rawParams.response_type ?? 'code',
    };

    const validated = oauthAuthorizeSchema.parse(params);

    // Verify client + redirect_uri + scopes (same rules as /authorize)
    const client = await queryOne<any>(
      `SELECT id, client_id, name, redirect_uris, allowed_scopes, is_active
       FROM oauth_clients WHERE client_id = ?`,
      [validated.client_id]
    );

    if (!client || !client.is_active) {
      return c.text('Invalid client_id', 400);
    }

    const redirectUris = JSON.parse(client.redirect_uris);
    if (!redirectUris.includes(validated.redirect_uri)) {
      return c.text('Invalid redirect_uri', 400);
    }

    const requestedScopes = parseScopes(validated.scope);
    const allowedScopes = JSON.parse(client.allowed_scopes);
    const invalidScopes = requestedScopes.filter((s) => !allowedScopes.includes(s));
    if (invalidScopes.length > 0) {
      return c.text(`Invalid scopes: ${invalidScopes.join(', ')}`, 400);
    }

    const btnText = typeof rawParams.text === 'string' && rawParams.text.trim()
      ? rawParams.text.trim()
      : 'Sign in with Void';

    const theme = rawParams.theme === 'light' ? 'light' : 'dark';

    const authorizeUrl = new URL(`/oauth/authorize`, c.req.url);
    authorizeUrl.searchParams.set('client_id', validated.client_id);
    authorizeUrl.searchParams.set('redirect_uri', validated.redirect_uri);
    authorizeUrl.searchParams.set('response_type', validated.response_type);
    if (validated.scope) authorizeUrl.searchParams.set('scope', validated.scope);
    if (validated.state) authorizeUrl.searchParams.set('state', validated.state);

    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sign in with Void</title>
    <style>
      :root {
        --bg: ${theme === 'light' ? '#ffffff' : '#0b0f1a'};
        --fg: ${theme === 'light' ? '#0b0f1a' : '#e6e8ef'};
        --border: ${theme === 'light' ? 'rgba(15, 23, 42, 0.18)' : 'rgba(148, 163, 184, 0.25)'};
        --hover: ${theme === 'light' ? 'rgba(2, 6, 23, 0.04)' : 'rgba(148, 163, 184, 0.08)'};
      }
      html, body { height: 100%; }
      body {
        margin: 0;
        display: grid;
        place-items: center;
        background: transparent;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      }
      a.btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        height: 42px;
        padding: 0 14px;
        border-radius: 14px;
        border: 1px solid var(--border);
        background: var(--bg);
        color: var(--fg);
        text-decoration: none;
        font-size: 13px;
        font-weight: 600;
        white-space: nowrap;
        box-sizing: border-box;
      }
      a.btn:hover { background: var(--hover); }
      .dot {
        width: 16px; height: 16px; border-radius: 999px;
        border: 2px solid currentColor;
        position: relative;
        box-sizing: border-box;
        opacity: .9;
      }
      .dot:after {
        content: "";
        position: absolute;
        inset: 4px;
        border-radius: 999px;
        background: currentColor;
      }
    </style>
  </head>
  <body>
    <a class="btn" href="${escapeHtml(authorizeUrl.toString())}" target="_top" rel="noreferrer">
      <span class="dot" aria-hidden="true"></span>
      <span>${escapeHtml(btnText)}</span>
    </a>
  </body>
</html>`;

    c.header('Content-Type', 'text/html; charset=utf-8');
    c.header('X-Frame-Options', 'SAMEORIGIN');
    c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors *");
    return c.body(html);
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      return c.text('Validation error', 400);
    }
    throw error;
  }
});

/**
 * GET /oauth/authorize
 * OAuth authorization endpoint - validate request and return client info
 */
oauth.get('/authorize', async (c) => {
  try {
    const rawParams = c.req.query();
    // Default response_type to `code` to make this endpoint drop-in friendly.
    const params = {
      ...rawParams,
      response_type: rawParams.response_type ?? 'code',
    };

    const validated = oauthAuthorizeSchema.parse(params);

    // Verify client
    const client = await queryOne<any>(
      `SELECT id, client_id, name, description, logo_url, redirect_uris, allowed_scopes, is_active, verification_status, app_theme
       FROM oauth_clients WHERE client_id = ?`,
      [validated.client_id]
    );

    if (!client || !client.is_active) {
      return c.json({ error: 'Invalid client_id' }, 400);
    }

    // Verify redirect_uri
    const redirectUris = JSON.parse(client.redirect_uris);
    if (!redirectUris.includes(validated.redirect_uri)) {
      return c.json({ error: 'Invalid redirect_uri' }, 400);
    }

    // Verify scopes
    const requestedScopes = parseScopes(validated.scope);
    let allowedScopes = JSON.parse(client.allowed_scopes);

    // If openid is requested, add profile and email automatically (OIDC requirement)
    if (requestedScopes.includes('openid')) {
      if (!allowedScopes.includes('profile')) allowedScopes = [...allowedScopes, 'profile'];
      if (!allowedScopes.includes('email')) allowedScopes = [...allowedScopes, 'email'];
    }

    const invalidScopes = requestedScopes.filter(s => s.startsWith('nonce:') ? false : !allowedScopes.includes(s));

    if (invalidScopes.length > 0) {
      return c.json({ error: `Invalid scopes: ${invalidScopes.join(', ')}` }, 400);
    }

    // Resolve user: try session cookie first, then Bearer token
    let userId: string | null = null;

    const sessionUser = await resolveSessionCookie(c);
    if (sessionUser) {
      userId = sessionUser.userId;
    } else {
      // Fallback to Bearer token
      const authHeader = c.req.header('Authorization');
      const token = extractBearerToken(authHeader);
      if (token) {
        const payload = await verifyToken(token);
        if (payload && payload.type === 'access') {
          userId = payload.userId;
        }
      }
    }

    // Not authenticated — redirect to VoidAuth login page
    if (!userId) {
      const oauthParams = new URLSearchParams();
      oauthParams.set('client_id', validated.client_id);
      oauthParams.set('redirect_uri', validated.redirect_uri);
      oauthParams.set('response_type', validated.response_type);
      if (validated.scope) oauthParams.set('scope', validated.scope);
      if (validated.state) oauthParams.set('state', validated.state);
      if (validated.nonce) oauthParams.set('nonce', validated.nonce);

      const frontendOrigin = config.cors.origin.replace(/\/$/, '');
      const target = new URL('/oauth', frontendOrigin);
      target.search = oauthParams.toString();

      return c.redirect(target.toString(), 302);
    }

    // Check if user has already authorized this app
    const existingAuth = await queryOne<any>(
      `SELECT id, scope FROM user_connected_apps
       WHERE user_id = ? AND client_id = ?`,
      [userId, client.id]
    );

    // If this is a browser navigation (no _api param), redirect to frontend SPA
    const isApiCall = c.req.query('_api') === '1';

    if (!isApiCall) {
      const frontendOrigin = config.cors.origin.replace(/\/$/, '');
      const frontendParams = new URLSearchParams();
      frontendParams.set('client_id', validated.client_id);
      frontendParams.set('redirect_uri', validated.redirect_uri);
      frontendParams.set('response_type', validated.response_type);
      if (validated.scope) frontendParams.set('scope', validated.scope);
      if (validated.state) frontendParams.set('state', validated.state);
      if (validated.nonce) frontendParams.set('nonce', validated.nonce);

      const frontendUrl = new URL('/oauth', frontendOrigin);
      frontendUrl.search = frontendParams.toString();
      return c.redirect(frontendUrl.toString(), 302);
    }

    // API call from frontend SPA — return JSON
    return c.json({
      client: {
        id: client.client_id,
        name: client.name,
        description: client.description,
        logo_url: client.logo_url,
        verification_status: client.verification_status,
        app_theme: client.app_theme ? JSON.parse(client.app_theme) : null,
      },
      requestedScopes,
      alreadyAuthorized: !!existingAuth,
      existingScopes: existingAuth ? parseScopes(existingAuth.scope) : [],
      nonce: validated.nonce || null,
    });
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      return c.json({ error: 'Validation error', details: error }, 400);
    }
    throw error;
  }
});

/**
 * POST /oauth/authorize
 * Handle user consent and generate authorization code
 */
oauth.post('/authorize', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const validated = oauthConsentSchema.parse(body);

    if (!validated.consent) {
      return c.json({ error: 'User denied authorization' }, 403);
    }

    // Verify client
    const client = await queryOne<any>(
      `SELECT id, client_id, redirect_uris, allowed_scopes FROM oauth_clients 
       WHERE client_id = ? AND is_active = true`,
      [validated.client_id]
    );

    if (!client) {
      return c.json({ error: 'Invalid client_id' }, 400);
    }

    // Verify redirect_uri
    const redirectUris = JSON.parse(client.redirect_uris);
    if (!redirectUris.includes(validated.redirect_uri)) {
      return c.json({ error: 'Invalid redirect_uri' }, 400);
    }

    // Verify scopes (defense in depth)
    const requestedScopes = parseScopes(validated.scope);
    const allowedScopes = JSON.parse(client.allowed_scopes);
    const invalidScopes = requestedScopes.filter(s => !allowedScopes.includes(s));
    if (invalidScopes.length > 0) {
      return c.json({ error: `Invalid scopes: ${invalidScopes.join(', ')}` }, 400);
    }
    const scopeString = scopesToString(requestedScopes);

    const { userId } = getAuth(c);

    // Generate authorization code
    const code = generateSecureToken(32);
    const codeId = randomUUID();
    const expiresAt = new Date(Date.now() + config.oauth.codeExpiresIn * 1000);

    // Include nonce in stored scope if provided
    const storedScope = validated.nonce
      ? scopeString + (scopeString ? ' ' : '') + 'nonce:' + validated.nonce
      : scopeString;

    await query(
      `INSERT INTO oauth_codes (id, code, user_id, client_id, redirect_uri, scope, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [codeId, code, userId, client.id, validated.redirect_uri, storedScope, expiresAt]
    );

    if (validated.code_challenge) {
      await ensurePKCETable();
      await query(
        `INSERT INTO oauth_challenges (code, code_challenge, code_challenge_method)
         VALUES (?, ?, ?)`,
        [code, validated.code_challenge, validated.code_challenge_method || 'S256']
      );
    }

    // Update or create user_connected_apps entry
    const existingAuth = await queryOne<any>(
      'SELECT id FROM user_connected_apps WHERE user_id = ? AND client_id = ?',
      [userId, client.id]
    );

    const isNewConnection = !existingAuth;
    if (existingAuth) {
      await query(
        'UPDATE user_connected_apps SET scope = ?, last_used_at = NOW() WHERE id = ?',
        [scopeString, existingAuth.id]
      );
    } else {
      await query(
        `INSERT INTO user_connected_apps (id, user_id, client_id, scope)
         VALUES (?, ?, ?, ?)`,
        [randomUUID(), userId, client.id, scopeString]
      );
    }

    if (isNewConnection) {
      import('../utils/email.js').then(async (m) => {
        if (m.isEmailConfigured()) {
          await m.sendNotificationEmail(userId, 'new_app_connection', `New application connected: ${client.name}`, (n) => m.buildNewAppConnectionEmail(n, client.name));
        }
      }).catch(() => {});
    }

    // Build redirect URL with authorization code
    const redirectUrl = new URL(validated.redirect_uri);
    redirectUrl.searchParams.set('code', code);
  if (validated.state) {
    redirectUrl.searchParams.set('state', validated.state);
  }

  const nonce = validated.nonce;

  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'oauth.consent_granted', 'oauth_client', client.client_id, { scopes: requestedScopes }, ip, ua);

  return c.json({
    redirectUrl: redirectUrl.toString(),
    code,
  });
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      return c.json({ error: 'Validation error', details: error }, 400);
    }
    throw error;
  }
});

/**
 * POST /oauth/token
 * Exchange authorization code, client credentials, or refresh token for access token
 */
oauth.post('/token', async (c) => {
  try {
    const body = await c.req.json();
    const validated = oauthTokenSchema.parse(body);

    // Verify client credentials
    const client = await queryOne<any>(
      `SELECT id, client_id, client_secret, allowed_scopes, is_active FROM oauth_clients 
       WHERE client_id = ?`,
      [validated.client_id]
    );

    if (!client || !client.is_active) {
      return c.json({ error: 'Invalid client credentials' }, 401);
    }

    const grantType = validated.grant_type;

    // Public (PKCE) clients may omit the secret for the authorization_code grant.
    // All other grants require a valid client secret.
    if (grantType === 'authorization_code') {
      let isPKCE = false;
      if (validated.code) {
        try {
          const challengeRow = await queryOne<any>(
            `SELECT code_challenge FROM oauth_challenges WHERE code = ?`,
            [validated.code]
          );
          isPKCE = !!challengeRow?.code_challenge;
        } catch {}
      }
      if (!isPKCE && !safeSecretEqual(client.client_secret, validated.client_secret)) {
        return c.json({ error: 'Invalid client credentials' }, 401);
      }
    } else if (!safeSecretEqual(client.client_secret, validated.client_secret)) {
      return c.json({ error: 'Invalid client credentials' }, 401);
    }

    // --- CLIENT CREDENTIALS GRANT ---
    if (grantType === 'client_credentials') {
      const clientAllowedScopes = JSON.parse(client.allowed_scopes || '[]');
      const requestedScopes = parseScopes(validated.scope || null);
      const grantedScopes = requestedScopes.filter(s => clientAllowedScopes.includes(s));
      const scopeStr = scopesToString(grantedScopes.length > 0 ? grantedScopes : clientAllowedScopes);

      const accessToken = generateSecureToken(64);
      const tokenId = randomUUID();
      const expiresAt = new Date(Date.now() + config.oauth.tokenExpiresIn * 1000);

      await query(
        `INSERT INTO oauth_tokens (id, access_token, user_id, client_id, scope, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tokenId, accessToken, null, client.id, scopeStr, expiresAt]
      );

      const ip = getClientIP(c);
      const ua = c.req.header('user-agent') || null;
      await auditLog(null, 'oauth.client_credentials', 'oauth_client', client.client_id, { scopes: scopeStr }, ip, ua);

      return c.json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: config.oauth.tokenExpiresIn,
        scope: scopeStr,
      });
    }

    // --- REFRESH TOKEN GRANT ---
    if (grantType === 'refresh_token') {
      if (!validated.refresh_token) {
        return c.json({ error: 'invalid_grant', error_description: 'refresh_token is required' }, 400);
      }

      const family = await queryOne<any>(
        `SELECT id, user_id, client_id, family_id, refresh_token, replaced_by, expires_at
         FROM refresh_token_families WHERE refresh_token = ?`,
        [validated.refresh_token]
      );

      if (!family) {
        return c.json({ error: 'invalid_grant', error_description: 'Invalid refresh token' }, 400);
      }

      // Refresh tokens are bound to the issuing client
      if (family.client_id && family.client_id !== client.id) {
        return c.json({ error: 'invalid_grant', error_description: 'Refresh token client mismatch' }, 400);
      }

      if (new Date() > new Date(family.expires_at)) {
        return c.json({ error: 'invalid_grant', error_description: 'Refresh token expired' }, 400);
      }

      // Replay detection
      if (family.replaced_by) {
        await query(
          `UPDATE refresh_token_families SET replaced_by = 'REVOKED' WHERE family_id = ?`,
          [family.family_id]
        );
        return c.json({ error: 'invalid_grant', error_description: 'Refresh token has been used; family revoked' }, 400);
      }

      const scopeStr = validated.scope || '';
      const scopes = parseScopes(scopeStr);
      const nonce = scopes.find(s => s.startsWith('nonce:'))?.replace('nonce:', '');

      const newAccessToken = generateSecureToken(64);
      const newRefreshToken = generateSecureToken(64);
      const tokenId = randomUUID();
      const accessExpiresAt = new Date(Date.now() + config.oauth.tokenExpiresIn * 1000);
      const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await query(
        `INSERT INTO oauth_tokens (id, access_token, user_id, client_id, scope, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tokenId, newAccessToken, family.user_id, family.client_id || client.id, scopeStr, accessExpiresAt]
      );

      await query(
        `UPDATE refresh_token_families SET replaced_by = ? WHERE id = ?`,
        [newRefreshToken, family.id]
      );

      const newFamilyId = randomUUID().replace(/-/g, '');
      await query(
        `INSERT INTO refresh_token_families (id, user_id, client_id, family_id, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), family.user_id, family.client_id || client.id, family.family_id, newRefreshToken, refreshExpiresAt]
      );

      const user = await queryOne<any>(
        'SELECT id, email, name, email_verified, role, avatar_url FROM users WHERE id = ?',
        [family.user_id]
      );

      let idToken = null;
      if (scopes.includes('openid') && user) {
        const nowSec = Math.floor(Date.now() / 1000);
        const idTokenPayload: any = {
          iss: config.cors.origin.replace(/\/$/, '') || 'http://localhost:3001',
          sub: user.id,
          aud: validated.client_id,
          exp: nowSec + 3600,
          iat: nowSec,
          auth_time: nowSec,
        };
        if (nonce) idTokenPayload.nonce = nonce;
        if (scopes.includes('profile')) {
          idTokenPayload.name = user.name;
          idTokenPayload.preferred_username = user.name;
          idTokenPayload.picture = user.avatar_url || null;
        }
        if (scopes.includes('email')) {
          idTokenPayload.email = user.email;
          idTokenPayload.email_verified = !!user.email_verified;
        }
        idTokenPayload.role = user.role || 'user';
        idToken = await signJwt(idTokenPayload, 3600, { subject: user.id });
      }

      const ip = getClientIP(c);
      const ua = c.req.header('user-agent') || null;
      await auditLog(family.user_id, 'oauth.token_refreshed', 'oauth_client', client.client_id, { scopes: scopeStr }, ip, ua);

      return c.json({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: config.oauth.tokenExpiresIn,
        scope: scopeStr || null,
        ...(idToken ? { id_token: idToken } : {}),
      });
    }

    // --- AUTHORIZATION CODE GRANT ---
    if (!validated.code) {
      return c.json({ error: 'invalid_grant', error_description: 'Authorization code is required' }, 400);
    }

    if (!validated.redirect_uri) {
      return c.json({ error: 'invalid_grant', error_description: 'redirect_uri is required' }, 400);
    }

    // Verify authorization code
    const authCode = await queryOne<any>(
      `SELECT id, user_id, client_id, redirect_uri, scope, expires_at, used_at
       FROM oauth_codes WHERE code = ?`,
      [validated.code]
    );

    if (!authCode) {
      return c.json({ error: 'Invalid authorization code' }, 400);
    }

    if (authCode.used_at) {
      return c.json({ error: 'Authorization code already used' }, 400);
    }

    if (new Date() > new Date(authCode.expires_at)) {
      return c.json({ error: 'Authorization code expired' }, 400);
    }

    if (authCode.client_id !== client.id) {
      return c.json({ error: 'Client mismatch' }, 400);
    }

    if (authCode.redirect_uri !== validated.redirect_uri) {
      return c.json({ error: 'Redirect URI mismatch' }, 400);
    }

    // PKCE verification
    const challenge = await queryOne<any>(
      `SELECT code_challenge, code_challenge_method FROM oauth_challenges WHERE code = ?`,
      [validated.code]
    );

    if (challenge) {
      if (!validated.code_verifier) {
        return c.json({ error: 'invalid_grant', error_description: 'code_verifier is required' }, 400);
      }

      const hasher = new Bun.CryptoHasher('sha256');
      hasher.update(validated.code_verifier);
      const hashHex = hasher.digest('hex');
      const computedChallenge = Buffer.from(hashHex, 'hex').toString('base64url');

      if (computedChallenge !== challenge.code_challenge) {
        return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
      }
    }

    // Mark code as used atomically
    const markResult = await query<any>('UPDATE oauth_codes SET used_at = NOW() WHERE id = ? AND used_at IS NULL', [authCode.id]);
    if (!markResult || (markResult as any).affectedRows !== 1) {
      return c.json({ error: 'Authorization code already used' }, 400);
    }

    // Generate access token
    const accessToken = generateSecureToken(64);
    const tokenId = randomUUID();
    const expiresAt = new Date(Date.now() + config.oauth.tokenExpiresIn * 1000);

    // Filter scope against client's allowed scopes
    const clientAllowedScopes = JSON.parse(client.allowed_scopes || '[]');
    const rawScopes = parseScopes(authCode.scope || '');
    const filteredScopes = rawScopes.filter(s => {
      if (s.startsWith('nonce:')) return true;
      return clientAllowedScopes.includes(s);
    });
    const grantedScopeStr = scopesToString(filteredScopes);

    await query(
      `INSERT INTO oauth_tokens (id, access_token, user_id, client_id, scope, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [tokenId, accessToken, authCode.user_id, client.id, grantedScopeStr, expiresAt]
    );

    // Also generate a refresh token in the family table
    const refreshToken = generateSecureToken(64);
    const refreshExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const familyId = randomUUID().replace(/-/g, '');

    await query(
      `INSERT INTO refresh_token_families (id, user_id, client_id, family_id, refresh_token, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), authCode.user_id, client.id, familyId, refreshToken, refreshExpiresAt]
    );

    // Get user info
    const user = await queryOne<any>(
      'SELECT id, email, name, email_verified, role, avatar_url FROM users WHERE id = ?',
      [authCode.user_id]
    );

    // Generate id_token for OIDC
    const scopeStr = authCode.scope || '';
    const scopes = parseScopes(scopeStr);
    const nonce = scopes.find(s => s.startsWith('nonce:'))?.replace('nonce:', '');

    const nowSec = Math.floor(Date.now() / 1000);
    const idTokenPayload: any = {
      iss: config.cors.origin.replace(/\/$/, '') || 'http://localhost:3001',
      sub: user.id,
      aud: validated.client_id,
      exp: nowSec + 3600,
      iat: nowSec,
      auth_time: nowSec,
    };

    if (nonce) idTokenPayload.nonce = nonce;
    if (scopes.includes('profile')) {
      idTokenPayload.name = user.name;
      idTokenPayload.preferred_username = user.name;
      idTokenPayload.picture = user.avatar_url || null;
    }
    if (scopes.includes('email')) {
      idTokenPayload.email = user.email;
      idTokenPayload.email_verified = !!user.email_verified;
    }
    idTokenPayload.role = user.role || 'user';

    const idToken = await signJwt(idTokenPayload, 3600, { subject: user.id });

    const tokenIp = getClientIP(c);
    const tokenUa = c.req.header('user-agent') || null;
    await auditLog(authCode.user_id, 'oauth.token_exchanged', 'oauth_client', client.client_id, { scopes: grantedScopeStr }, tokenIp, tokenUa);

    return c.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: config.oauth.tokenExpiresIn,
      scope: grantedScopeStr,
      id_token: idToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.avatar_url || null,
        role: user.role || 'user',
      },
    });
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      return c.json({ error: 'Validation error', details: error }, 400);
    }
    throw error;
  }
});

/**
 * GET /oauth/userinfo
 * Get user info with OAuth access token
 */
oauth.get('/userinfo', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return c.json({ error: 'No access token provided' }, 401);
  }

  // Verify access token
  const oauthToken = await queryOne<any>(
    `SELECT user_id, scope, expires_at, revoked_at 
     FROM oauth_tokens WHERE access_token = ?`,
    [token]
  );

  if (!oauthToken || oauthToken.revoked_at) {
    return c.json({ error: 'Invalid access token' }, 401);
  }

  if (new Date() > new Date(oauthToken.expires_at)) {
    return c.json({ error: 'Access token expired' }, 401);
  }

  // Get user info based on scopes
  const user = await queryOne<any>(
    'SELECT id, email, name, created_at, role, avatar_url FROM users WHERE id = ?',
    [oauthToken.user_id]
  );

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const scopes = parseScopes(oauthToken.scope);
  const response: any = {
    sub: user.id,
  };

  if (scopes.includes('profile')) {
    response.name = user.name;
    response.preferred_username = user.name;
    response.picture = user.avatar_url || null;
    response.updated_at = user.created_at ? Math.floor(new Date(user.created_at).getTime() / 1000) : undefined;
  }

  if (scopes.includes('email')) {
    response.email = user.email;
    response.email_verified = !!user.email_verified;
  }

  response.role = user.role || 'user';

  return c.json(response);
});

/**
 * POST /oauth/introspect
 * Token introspection (RFC 7662)
 */
oauth.post('/introspect', async (c) => {
   try {
     const body = await c.req.json();
     const validated = oauthIntrospectSchema.parse(body);

     // RFC 7662: client authentication is required for introspection.
     if (!validated.client_id || !validated.client_secret) {
       return c.json({ error: 'Client authentication required' }, 401);
     }
     const client = await queryOne<any>(
       `SELECT client_secret, is_active FROM oauth_clients WHERE client_id = ?`,
       [validated.client_id]
     );
     const secretOk = client && client.is_active
       && Buffer.from(client.client_secret).length === Buffer.from(validated.client_secret).length
       && timingSafeEqual(Buffer.from(client.client_secret), Buffer.from(validated.client_secret));
     if (!secretOk) {
       return c.json({ active: false }, 401);
     }

     const oauthToken = await queryOne<any>(
       `SELECT id, user_id, client_id, scope, expires_at, revoked_at
        FROM oauth_tokens WHERE access_token = ?`,
       [validated.token]
     );

     if (!oauthToken || oauthToken.revoked_at) {
       return c.json({ active: false });
     }

     if (new Date() > new Date(oauthToken.expires_at)) {
       return c.json({ active: false });
     }

     return c.json({
       active: true,
       sub: oauthToken.user_id,
       scope: oauthToken.scope,
       client_id: oauthToken.client_id,
       exp: Math.floor(new Date(oauthToken.expires_at).getTime() / 1000),
       iat: Math.floor((new Date(oauthToken.expires_at).getTime() - config.oauth.tokenExpiresIn * 1000) / 1000),
     });
   } catch (error) {
     if (error instanceof Error && 'issues' in error) {
       return c.json({ active: false });
     }
     return c.json({ active: false });
   }
 });

/**
 * POST /oauth/revoke
 * Token revocation (RFC 7009)
 */
oauth.post('/revoke', async (c) => {
   try {
     const body = await c.req.json();
     const validated = oauthRevokeSchema.parse(body);

     // RFC 7009: client authentication is required for revocation.
     if (!validated.client_id || !validated.client_secret) {
       return c.json({ error: 'Client authentication required' }, 401);
     }
     const client = await queryOne<any>(
       `SELECT client_secret, is_active FROM oauth_clients WHERE client_id = ?`,
       [validated.client_id]
     );
     const secretOk = client && client.is_active
       && Buffer.from(client.client_secret).length === Buffer.from(validated.client_secret).length
       && timingSafeEqual(Buffer.from(client.client_secret), Buffer.from(validated.client_secret));
     if (!secretOk) {
       return c.json({});
     }

     await query(
       `UPDATE oauth_tokens SET revoked_at = NOW() WHERE access_token = ? AND revoked_at IS NULL`,
       [validated.token]
     );

     return c.json({});
   } catch (error) {
     return c.json({});
   }
 });

export default oauth;
