import { Context, Next } from 'hono';
import { log } from '../utils/log.js';

/**
 * Request logging middleware
 */
export async function logger(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  log.request(method, path, status, duration);
}

/**
 * Error handling middleware
 */
export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (error) {
    log.error('Unhandled error', error as Error);

    if (error instanceof Error) {
      return c.json(
        {
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : undefined,
        },
        500
      );
    }

    return c.json({ error: 'Internal server error' }, 500);
  }
}

/**
 * CORS middleware configuration
 */
export function corsConfig(origin: string) {
  return {
    origin,
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  };
}
