import { createMiddleware } from 'hono/factory';
import { config } from '../config/index.js';
import { isTrustedOrigin } from './originGuard.js';
import { resolveSessionCookie } from './auth.js';

/**
 * Gate for internal-only API routes. Requests are allowed when any of:
 *   1. They carry the internal API key (server-to-server / nginx-injected).
 *   2. They carry a valid session cookie (official frontend user).
 *   3. They come from a trusted Origin (official frontend browser).
 * Everything else (scripts, curl, unauthenticated crawlers) is rejected.
 */
export function internalOnly() {
  return createMiddleware(async (c, next) => {
    // 1. Internal API key
    const key = c.req.header('X-Internal-Key');
    if (config.internal.apiKey && key === config.internal.apiKey) {
      return next();
    }

    // 2. Valid session cookie
    const session = await resolveSessionCookie(c);
    if (session) {
      return next();
    }

    // 3. Trusted Origin
    const origin = c.req.header('Origin');
    if (origin && isTrustedOrigin(origin)) {
      return next();
    }

    return c.json({ error: 'Forbidden' }, 403);
  });
}
