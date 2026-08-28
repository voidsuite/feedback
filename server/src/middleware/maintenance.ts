import { Context, Next } from 'hono';
import { queryOne } from '../db/connection.js';
import { extractBearerToken, verifyToken } from '../utils/jwt.js';
import { resolveSessionCookie } from './auth.js';

export async function maintenanceMode(c: Context, next: Next) {
  const path = c.req.path;

  // Always allow admin panel, docs, health, public auth endpoints
  if (
    path.startsWith('/admin') ||
    path.startsWith('/docs') ||
    path === '/health' ||
    path.startsWith('/auth/check-email') ||
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/magic-link') ||
    path.startsWith('/auth/otp') ||
    path.startsWith('/auth/2fa') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/forgot-password') ||
    path.startsWith('/auth/reset-password') ||
    path.startsWith('/auth/settings') ||
    path.startsWith('/oauth/') ||
    path.startsWith('/passkey/') ||
    path === '/.well-known/openid-configuration'
  ) {
    await next();
    return;
  }

  // Check if maintenance mode is enabled
  const row = await queryOne<any>(
    "SELECT setting_value FROM admin_settings WHERE setting_key = 'maintenance_mode'"
  );
  const isMaintenance = row?.setting_value === '1';

  if (!isMaintenance) {
    await next();
    return;
  }

  // Allow admins to bypass maintenance mode
  // Check Bearer token first
  const authHeader = c.req.header('Authorization');
  const token = extractBearerToken(authHeader);
  if (token) {
    try {
      const payload = await verifyToken(token);
      if (payload?.type === 'access') {
        const user = await queryOne<any>(
          "SELECT role FROM users WHERE id = ?",
          [payload.userId]
        );
        if (user?.role === 'admin') {
          await next();
          return;
        }
      }
    } catch {}
  }

  // Also check session cookie
  try {
    const sessionUser = await resolveSessionCookie(c);
    if (sessionUser) {
      const user = await queryOne<any>(
        "SELECT role FROM users WHERE id = ?",
        [sessionUser.userId]
      );
      if (user?.role === 'admin') {
        await next();
        return;
      }
    }
  } catch {}

  return c.json({
    error: 'Service temporarily unavailable',
    message: 'VoidAuth is currently undergoing maintenance. Please check back soon.',
    maintenance: true,
  }, 503);
}
