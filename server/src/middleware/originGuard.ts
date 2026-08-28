import { createMiddleware } from 'hono/factory';
import { config } from '../config/index.js';

const DEV_ORIGINS = new Set([
  'http://localhost:4000',
  'http://127.0.0.1:4000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5175',
]);

export function isTrustedOrigin(origin: string): boolean {
  if (config.server.nodeEnv !== 'production' && DEV_ORIGINS.has(origin)) return true;
  const trusted = (config.cors.origin || '').replace(/\/$/, '');
  return origin === trusted;
}

export function originGuard() {
  return createMiddleware(async (c, next) => {
    const origin = c.req.header('Origin');
    if (origin && !isTrustedOrigin(origin)) {
      return c.json({ error: 'Forbidden' }, 403);
    }
    await next();
  });
}
