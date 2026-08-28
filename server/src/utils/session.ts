import { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { randomBytes } from 'crypto';
import { config } from '../config/index.js';

/**
 * Generate a cryptographically secure random session token
 */
export function generateSessionToken(): string {
  return randomBytes(48).toString('base64url');
}

/**
 * Cookie domain. Only set when explicitly configured via SESSION_DOMAIN.
 * By default the cookie is host-only (never widened to the parent domain),
 * so sibling subdomains cannot read the auth session cookie.
 */
function getCookieDomain(): string | undefined {
  return config.session?.domain || undefined;
}

function isSecure(): boolean {
  if (config.session?.secure !== undefined) return config.session.secure;
  const origin = config.cors.origin || '';
  return origin.startsWith('https://');
}

function getCookieName(): string {
  return config.session?.name || 'va_session';
}

function getMaxAge(keepMeLoggedIn?: boolean): number {
  if (keepMeLoggedIn) {
    return config.session?.maxAgeRememberMe || 90 * 24 * 60 * 60; // 90 days
  }
  return config.session?.maxAge || 30 * 24 * 60 * 60; // 30 days
}

/**
 * Set the session cookie on the response.
 * `ttlSeconds` (when provided) overrides the default so the cookie always
 * expires in lockstep with the DB session row.
 */
export function setSessionCookie(c: Context, token: string, keepMeLoggedIn?: boolean, ttlSeconds?: number): void {
  setCookie(c, getCookieName(), token, {
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
    path: '/',
    domain: getCookieDomain(),
    maxAge: ttlSeconds ?? getMaxAge(keepMeLoggedIn),
  });
}

/**
 * Clear the session cookie (on logout)
 */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, getCookieName(), {
    path: '/',
    domain: getCookieDomain(),
    httpOnly: true,
    secure: isSecure(),
    sameSite: 'lax',
  });
}

/**
 * Read the session token from the request cookie
 */
export function getSessionToken(c: Context): string | null {
  return getCookie(c, getCookieName()) || null;
}

/**
 * Get the session cookie name (for external use)
 */
export function getSessionCookieName(): string {
  return getCookieName();
}
