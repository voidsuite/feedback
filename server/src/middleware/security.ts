import { Context, Next } from 'hono';

export async function securityHeaders(c: Context, next: Next) {
  await next();

  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

  // Allow Swagger UI CDN + API self-connections
  const isDocs = c.req.path.startsWith('/docs');
  if (isDocs) {
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; connect-src 'self' http://localhost:* https://localhost:*; base-uri 'self'; form-action 'self'; frame-ancestors *");
  } else {
    c.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  }

  c.header('X-Content-Type-Options', 'nosniff');

  if (!c.req.path.startsWith('/oauth/button') && !isDocs) {
    c.header('X-Frame-Options', 'DENY');
  }

  c.header('X-XSS-Protection', '0');

  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export async function csrfProtection(c: Context, next: Next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    await next();
    return;
  }

  const cookieHeader = c.req.header('Cookie') || '';
  const csrfCookie = cookieHeader.match(/csrf_token=([^;]+)/)?.[1];
  const csrfHeader = c.req.header('X-CSRF-Token');

  if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
    return c.json({ error: 'CSRF token mismatch' }, 403);
  }

  await next();
}
