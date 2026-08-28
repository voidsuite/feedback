import { Hono } from 'hono';
import { query } from '../db/connection.js';
import { config } from '../config/index.js';

/**
 * ForwardAuth — SSO verify endpoint for nginx auth_request.
 *
 * Flow:
 *   1. nginx auth_request to GET /forwardauth/verify
 *   2. This endpoint checks the session cookie (va_session)
 *   3. Valid session → 200 + X-Auth-User-* headers (set by nginx sub_filter)
 *   4. Invalid session → 401
 *
 * Example nginx config:
 *   location /protected/ {
 *     auth_request /auth;
 *     proxy_pass http://my-app;
 *   }
 *   location = /auth {
 *     internal;
 *     proxy_pass http://auth.stwupid.tech:3001/forwardauth/verify;
 *     proxy_pass_request_body off;
 *     proxy_set_header Content-Length "";
 *     proxy_set_header Cookie $http_cookie;
 *     proxy_set_header X-Original-URI $request_uri;
 *     proxy_set_header X-Original-Method $request_method;
 *     proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
 *   }
 *   location /auth-redirect {
 *     auth_request /auth;
 *     error_page 401 = @login_redirect;
 *   }
 *   location @login_redirect {
 *     return 302 https://auth.stwupid.tech/login?redirect=$scheme://$host$request_uri;
 *   }
 *
 *   # After auth_request succeeds, inject user headers:
 *   location /protected/ {
 *     auth_request /auth;
 *     auth_request_set $auth_user $upstream_http_x_auth_user;
 *     auth_request_set $auth_email $upstream_http_x_auth_email;
 *     auth_request_set $auth_roles $upstream_http_x_auth_roles;
 *     proxy_set_header X-Auth-User $auth_user;
 *     proxy_set_header X-Auth-Email $auth_email;
 *     proxy_set_header X-Auth-Roles $auth_roles;
 *     proxy_pass http://my-app;
 *   }
 */

const forwardAuth = new Hono();

forwardAuth.get('/forwardauth/verify', async (c) => {
  // Read session token from cookie
  const cookieName = config.session.name || 'va_session';
  const cookieHeader = c.req.header('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]*)`));

  if (!match) {
    return c.text('Unauthorized', 401);
  }

  const sessionToken = decodeURIComponent(match[1]);

  // Look up session in database
  const sessions = await query<any>(
    `SELECT s.user_id, s.expires_at, u.email, u.name, u.role, u.is_active
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.session_token = ? AND s.expires_at > NOW() AND u.is_active = 1
     LIMIT 1`,
    [sessionToken]
  );

  if (!sessions.length) {
    return c.text('Unauthorized', 401);
  }

  const session = sessions[0];

  // Set headers that nginx can read with auth_request_set
  c.header('X-Auth-User', session.user_id);
  c.header('X-Auth-Email', session.email);
  c.header('X-Auth-Name', session.name || '');
  c.header('X-Auth-Roles', session.role);

  return c.text('OK', 200);
});

// Optional: redirect to login (for non-proxy setups)
forwardAuth.get('/forwardauth/redirect', (c) => {
  const originalUri = c.req.header('X-Original-URI') || '/';
  // Only allow same-origin relative paths to prevent open redirect
  const safeUri = originalUri.startsWith('/') && !originalUri.startsWith('//') ? originalUri : '/';
  return c.redirect(`/login?redirect=${encodeURIComponent(safeUri)}`, 302);
});

export default forwardAuth;
