import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { readFile } from 'fs/promises';
import { join, extname, resolve } from 'path';
import { config, validateConfig } from './config/index.js';
import { testConnection, closePool } from './db/connection.js';
import { logger, errorHandler, corsConfig } from './middleware/index.js';
import { rateLimit } from './middleware/rateLimit.js';
import { securityHeaders } from './middleware/security.js';
import { ipAccessControl } from './middleware/geoBlock.js';
import { maintenanceMode } from './middleware/maintenance.js';
import { originGuard, isTrustedOrigin } from './middleware/originGuard.js';
import { internalOnly } from './middleware/internalOnly.js';
import authRoutes from './routes/auth.js';
import oauthRoutes from './routes/oauth.js';
import userRoutes from './routes/users.js';
import passkeyRoutes from './routes/passkey.js';
import adminRoutes from './routes/admin.js';
import oidcRoutes from './routes/oidc.js';
import devAppRoutes from './routes/developer-apps.js';
import uploadRoutes from './routes/upload.js';
import adminSettingsRoutes from './routes/admin-settings.js';
import storageRoutes from './routes/storage.js';
import docsRoutes from './routes/docs.js';
import forwardAuthRoutes from './routes/forwardauth.js';
import healthRoutes from './routes/health.js';
import metricsRoutes, { incrementRequestCount, incrementErrorCount } from './routes/metrics.js';
import { runMigrations } from './db/migrate.js';
import { query } from './db/connection.js';
import { log } from './utils/log.js';
import { initRedis, closeRedis } from './utils/redis.js';

// Validate configuration
try {
  validateConfig();
} catch (error) {
  log.error('Configuration error', error as Error);
  process.exit(1);
}

// Create Hono app
const app = new Hono();

// Global middleware
app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    return isTrustedOrigin(origin) ? origin : undefined;
  },
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use('*', logger);
app.use('*', errorHandler);
app.use('*', securityHeaders);
app.use('*', ipAccessControl);
// Lightweight rate limiter for sensitive endpoints (per-IP)
app.use('*', rateLimit({ windowMs: 60_000, max: 120 }));

// Health check (must be before maintenanceMode so it always responds)
app.get('/health', async (c) => {
  const maintenance = await import('./db/connection.js').then(m =>
    m.queryOne<any>("SELECT setting_value FROM admin_settings WHERE setting_key = 'maintenance_mode'")
  );
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    maintenance: maintenance?.setting_value === '1',
  });
});

// Maintenance mode check — blocks non-admin users when enabled
app.use('*', maintenanceMode);

// Origin guard — restrict SPA-only endpoints to frontend origin
app.use('/auth/*', originGuard());
app.use('/users/*', originGuard());
app.use('/passkey/*', originGuard());
app.use('/users/apps/manage/*', originGuard());
app.use('/admin/*', originGuard());
app.use('/admin/settings/*', originGuard());

// Internal-only API — blocked for external clients unless they carry the
// internal API key, a valid session cookie, or come from the trusted origin.
// The official SPA is same-origin and its users have session cookies, so this
// only affects direct API consumers (curl, other origins, server scripts).
app.use('/auth/*', internalOnly());
app.use('/users/*', internalOnly());
app.use('/passkey/*', internalOnly());
app.use('/users/apps/manage/*', internalOnly());
app.use('/admin/*', internalOnly());
app.use('/admin/settings/*', internalOnly());
app.use('/docs/*', internalOnly());
app.use('/metrics', internalOnly());

// Mount routes
app.route('/', forwardAuthRoutes);   // /forwardauth/verify, /forwardauth/redirect
app.route('/auth', authRoutes);
app.route('/oauth', oauthRoutes);
app.route('/users', userRoutes);
app.route('/passkey', passkeyRoutes);
app.route('/admin', adminRoutes);
app.route('/', oidcRoutes);
app.route('/users/apps/manage', devAppRoutes);
app.route('/users', uploadRoutes);
app.route('/admin/settings', adminSettingsRoutes);
app.route('/storage', storageRoutes);
app.route('/docs', docsRoutes);
app.route('/health', healthRoutes);
app.route('/metrics', metricsRoutes);

// Request tracking middleware
app.use('*', async (c, next) => {
  incrementRequestCount();
  await next();
  if (c.res.status >= 400) {
    incrementErrorCount();
  }
});

// Serve uploaded files
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};
const UPLOADS_ROOT = resolve(process.cwd(), 'uploads');
app.get('/uploads/*', async (c) => {
  const relativePath = c.req.path.replace('/uploads/', '').replace(/^\//, '');
  const normalized = relativePath.split('/').filter(p => p !== '..' && p !== '.').join('/');
  const filePath = resolve(UPLOADS_ROOT, normalized);
  if (!filePath.startsWith(UPLOADS_ROOT) || filePath.includes('..')) {
    return c.json({ error: 'Invalid path' }, 400);
  }
  try {
    const file = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    c.header('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    c.header('Cache-Control', 'public, max-age=31536000');
    // Uploaded files are not trusted documents: block script execution and
    // external embeds so a stored SVG cannot run in the auth origin.
    c.header('Content-Security-Policy', "default-src 'none'; script-src 'none'; style-src 'none'; img-src 'self' data:; connect-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; sandbox");
    c.header('X-Content-Type-Options', 'nosniff');
    return c.body(file);
  } catch {
    return c.json({ error: 'File not found' }, 404);
  }
});

// In production, serve built frontend as SPA
if (config.server.nodeEnv === 'production') {
  const FRONTEND_DIST = resolve(process.cwd(), '..', 'frontend', 'dist');
  const MIME: Record<string, string> = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
    '.mdc': 'text/markdown', '.md': 'text/markdown',
  };
  app.get('/*', async (c) => {
    const reqPath = c.req.path;

    // OAuth consent page + callback are SPA routes (the API lives under /oauth/* subpaths)
    if (reqPath === '/oauth' || reqPath === '/oauth/callback') {
      try {
        const index = await readFile(join(FRONTEND_DIST, 'index.html'));
        c.header('Content-Type', 'text/html');
        return c.body(index);
      } catch { return c.json({ error: 'Not found' }, 404); }
    }

    // Skip SPA for API routes
    if (reqPath.startsWith('/health') || reqPath.startsWith('/metrics') || reqPath.startsWith('/docs') ||
        reqPath.startsWith('/auth') || reqPath.startsWith('/oauth') || reqPath.startsWith('/admin') ||
        reqPath.startsWith('/users') || reqPath.startsWith('/passkey') || reqPath.startsWith('/storage') ||
        reqPath.startsWith('/forwardauth') || reqPath.startsWith('/uploads') ||
        reqPath.startsWith('/.well-known')) {
      return c.json({ error: 'Not found' }, 404);
    }

    const filePath = join(FRONTEND_DIST, reqPath === '/' ? 'index.html' : reqPath);
    const resolved = resolve(filePath);
    if (!resolved.startsWith(FRONTEND_DIST)) return c.json({ error: 'Invalid path' }, 400);
    try {
      const file = await readFile(resolved);
      const ext = extname(resolved).toLowerCase();
      c.header('Content-Type', MIME[ext] || 'application/octet-stream');
      if (ext === '.html') c.header('Cache-Control', 'no-cache');
      else c.header('Cache-Control', 'public, max-age=31536000');
      return c.body(file);
    } catch {
      try {
        const index = await readFile(join(FRONTEND_DIST, 'index.html'));
        c.header('Content-Type', 'text/html');
        return c.body(index);
      } catch { return c.json({ error: 'Not found' }, 404); }
    }
  });
}

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404);
});

// Start server
async function startServer() {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    log.error('Failed to connect to database');
    process.exit(1);
  }

  // Run migrations to ensure required tables/columns exist
  try {
    await runMigrations();
  } catch (e) {
    log.error('Failed to run migrations', e as Error);
    process.exit(1);
  }

  // Initialize Redis (optional, falls back to in-memory if not available)
  await initRedis(config.redis.url || undefined);

  // Load email config from database
  try {
    const rows = await query<any>('SELECT setting_key, setting_value FROM admin_settings');
    const map: Record<string, string> = {};
    for (const row of rows) map[row.setting_key] = row.setting_value;
    if (map.smtp_host && map.smtp_user && map.smtp_pass && map.smtp_from) {
      const { setEmailConfig } = await import('./utils/email.js');
      setEmailConfig({
        host: map.smtp_host,
        port: parseInt(map.smtp_port || '587'),
        user: map.smtp_user,
        pass: map.smtp_pass,
        from: map.smtp_from,
        fromName: map.smtp_from_name || 'VoidAuth',
      });
      log.ok('Email config loaded');
    }
  } catch { /* settings table may not exist yet */ }

  // Start HTTP server
  const port = config.server.port;
  log.startup('VoidAuth', port, config.server.nodeEnv);

  serve({
    fetch: (req) => {
      const url = new URL(req.url);
      const proto = req.headers.get('x-forwarded-proto');
      if (proto === 'http' || proto === 'https') {
        url.protocol = proto + ':';
      }
      return app.fetch(new Request(url, req));
    },
    port,
    // Bind to localhost only — the public API is exposed through nginx, which
    // proxies the official frontend and the OAuth endpoints. Direct external
    // access to the API port is not needed and reduces the attack surface.
    hostname: config.server.host,
  });

  log.ok(`Server running at http://localhost:${port}`);
}

// Graceful shutdown
process.on('SIGINT', async () => {
  log.shutdown();
  await closeRedis();
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log.shutdown();
  await closeRedis();
  await closePool();
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  log.error('Failed to start server', error);
  process.exit(1);
});
