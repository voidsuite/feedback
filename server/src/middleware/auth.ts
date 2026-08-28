import { Context, Next } from 'hono';
import { verifyToken, extractBearerToken } from '../utils/jwt.js';
import { queryOne } from '../db/connection.js';
import { getSessionToken } from '../utils/session.js';

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
  /** Set when authenticated via an OAuth access token (scoped storage access). */
  clientId?: string;
}

/**
 * Resolve user from session cookie (primary auth method).
 * Returns AuthContext if valid session found, null otherwise.
 */
export async function resolveSessionCookie(c: Context): Promise<AuthContext | null> {
  const sessionToken = getSessionToken(c);
  if (!sessionToken) return null;

  const session = await queryOne<any>(
    `SELECT s.user_id, s.expires_at, u.role, u.email, u.is_active
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.session_token = ? AND s.expires_at > NOW()`,
    [sessionToken]
  );

  if (!session || !session.is_active) return null;

  return {
    userId: session.user_id,
    email: session.email,
    role: session.role || 'user',
  };
}

/**
 * Resolve user from Bearer token (first-party JWT only).
 * Returns AuthContext if valid, null otherwise.
 */
async function resolveBearerToken(c: Context): Promise<AuthContext | null> {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;

  // Only first-party JWT access tokens authenticate users here.
  // OAuth access tokens must NOT authenticate against first-party APIs
  // (that would let any OAuth app take over a user's account + admin).
  const payload = await verifyToken(token);
  if (payload && payload.type === 'access') {
    const user = await queryOne<any>('SELECT role, email_verified, is_active FROM users WHERE id = ?', [payload.userId]);
    if (!user || !user.is_active) return null;
    return {
      userId: payload.userId,
      email: payload.email,
      role: user?.role || 'user',
    };
  }

  return null;
}

/**
 * Resolve user from an OAuth access token (opaque, DB-backed).
 * Returns AuthContext with clientId set if valid, null otherwise.
 * OAuth tokens are ONLY accepted on storage routes (scoped to their own client).
 */
async function resolveOAuthToken(c: Context): Promise<AuthContext | null> {
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);
  if (!token) return null;

  const oauthToken = await queryOne<any>(
    `SELECT o.user_id, o.client_id, o.expires_at, o.revoked_at, u.role, u.email, u.is_active
     FROM oauth_tokens o
     JOIN users u ON u.id = o.user_id
     WHERE o.access_token = ?`,
    [token]
  );
  if (!oauthToken || oauthToken.revoked_at || !oauthToken.is_active) return null;
  if (!oauthToken.expires_at || new Date(oauthToken.expires_at) <= new Date()) return null;

  return {
    userId: oauthToken.user_id,
    email: oauthToken.email,
    role: oauthToken.role || 'user',
    clientId: oauthToken.client_id,
  };
}

/**
 * Middleware for the Storage API: accepts session cookie, first-party JWT,
 * or OAuth access token. OAuth tokens are scoped to their owning client,
 * so apps can only reach data that belongs to them.
 */
export async function storageAuthMiddleware(c: Context, next: Next) {
  let auth = await resolveSessionCookie(c);
  if (!auth) auth = await resolveBearerToken(c);
  if (!auth) auth = await resolveOAuthToken(c);

  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  c.set('auth', auth as AuthContext);
  await next();
}

/**
 * Middleware to verify authentication and attach user to context.
 * Auth order: session cookie → Bearer JWT → Bearer OAuth token
 */
export async function authMiddleware(c: Context, next: Next) {
  // 1. Try session cookie (primary)
  let auth = await resolveSessionCookie(c);

  // 2. Fallback: Bearer token
  if (!auth) {
    auth = await resolveBearerToken(c);
  }

  if (!auth) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check email verification requirement
  if (auth.email) {
    const requireVerification = await queryOne<any>(
      "SELECT setting_value FROM admin_settings WHERE setting_key = 'require_email_verification'"
    );
    if (requireVerification && requireVerification.setting_value === '1') {
      const user = await queryOne<any>('SELECT email_verified FROM users WHERE id = ?', [auth.userId]);
      if (!user?.email_verified && auth.role !== 'admin') {
        return c.json({ error: 'Email verification required', requireVerification: true }, 403);
      }
    }
  }

  // Attach user info to context
  c.set('auth', auth as AuthContext);

  await next();
}

/**
 * Get authenticated user from context
 */
export function getAuth(c: Context): AuthContext {
  return c.get('auth');
}

/**
 * Admin-only middleware (must be used after authMiddleware)
 */
export async function adminMiddleware(c: Context, next: Next) {
  const auth = c.get('auth') as AuthContext | undefined;
  if (!auth || auth.role !== 'admin') {
    return c.json({ error: 'Forbidden: Admin access required' }, 403);
  }
  await next();
}

/**
 * Step-up authentication middleware (must be used after authMiddleware)
 */
export async function stepUpMiddleware(c: Context, next: Next) {
  const stepUpToken = c.req.header('X-Step-Up-Token');
  if (!stepUpToken) {
    return c.json({ error: 'Re-authentication required' }, 403);
  }
  const payload = await verifyToken(stepUpToken);
  if (!payload || payload.type !== 'step_up') {
    return c.json({ error: 'Invalid or expired re-authentication token' }, 403);
  }
  c.set('stepUp', payload);
  await next();
}
