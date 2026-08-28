import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { query, queryOne } from '../db/connection.js';
import { generateSecureToken } from '../utils/crypto.js';
import { authMiddleware, getAuth } from '../middleware/auth.js';
import { auditLog } from '../utils/audit.js';
import { config } from '../config/index.js';
import { matchesMagicBytes } from '../utils/validateFile.js';
import { getClientIP } from '../utils/ip.js';

const devApps = new Hono();
const LOGO_DIR = join(process.cwd(), 'uploads', 'app-logos');

// Validate redirect URIs: must be absolute http/https URLs, no fragments
export function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.hash;
  } catch {
    return false;
  }
}

devApps.use('*', authMiddleware);

devApps.post('/', async (c) => {
  const { userId } = getAuth(c);
  const body = await c.req.json();
  const { name, description, redirect_uris, allowed_scopes } = body;

  if (!name || !redirect_uris || !Array.isArray(redirect_uris) || redirect_uris.length === 0) {
    return c.json({ error: 'Name and at least one redirect URI are required' }, 400);
  }
  if (!redirect_uris.every(isValidRedirectUri)) {
    return c.json({ error: 'Redirect URIs must be absolute http:// or https:// URLs without fragments' }, 400);
  }

  const scopes = allowed_scopes || ['profile', 'email'];
  const validScopes = scopes.filter((s: string) => ['profile', 'email', 'openid', 'read', 'write'].includes(s));
  if (validScopes.length === 0) {
    return c.json({ error: 'No valid scopes provided' }, 400);
  }

  const id = randomUUID();
  const clientId = generateSecureToken(16);
  const clientSecret = generateSecureToken(32);

  await query(
    `INSERT INTO oauth_clients (id, client_id, client_secret, name, description, logo_url, redirect_uris, allowed_scopes, owner_id, is_active)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, true)`,
    [id, clientId, clientSecret, name, description || '', JSON.stringify(redirect_uris), JSON.stringify(validScopes), userId]
  );

  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'app.created', 'oauth_client', clientId, { name, scopes: validScopes }, ip, ua);

  return c.json({
    id,
    clientId,
    clientSecret,
    name,
    description: description || '',
    redirectUris: redirect_uris,
    allowedScopes: validScopes,
    logoUrl: null,
    verificationStatus: 'unverified',
  }, 201);
});

devApps.get('/', async (c) => {
  const { userId } = getAuth(c);

  const apps = await query<any[]>(
    `SELECT id, client_id, name, description, logo_url, redirect_uris, allowed_scopes, verification_status, is_active, created_at, updated_at
     FROM oauth_clients WHERE owner_id = ? ORDER BY created_at DESC`,
    [userId]
  );

  return c.json({
    apps: (apps || []).map((a: any) => ({
      id: a.id,
      clientId: a.client_id,
      name: a.name,
      description: a.description,
      logoUrl: a.logo_url,
      redirectUris: JSON.parse(a.redirect_uris || '[]'),
      allowedScopes: JSON.parse(a.allowed_scopes || '[]'),
      verificationStatus: a.verification_status,
      isActive: !!a.is_active,
      appTheme: a.app_theme ? JSON.parse(a.app_theme) : null,
      createdAt: a.created_at,
      updatedAt: a.updated_at,
    })),
  });
});

devApps.get('/:id', async (c) => {
  const { userId } = getAuth(c);
  const id = c.req.param('id');

  const app = await queryOne<any>(
    `SELECT id, client_id, client_secret, name, description, logo_url, redirect_uris, allowed_scopes,
            verification_status, is_active, app_theme, created_at, updated_at
     FROM oauth_clients WHERE id = ? AND owner_id = ?`,
    [id, userId]
  );

  if (!app) return c.json({ error: 'App not found' }, 404);

  return c.json({
    id: app.id,
    clientId: app.client_id,
    clientSecret: app.client_secret,
    name: app.name,
    description: app.description,
    logoUrl: app.logo_url,
    redirectUris: JSON.parse(app.redirect_uris || '[]'),
    allowedScopes: JSON.parse(app.allowed_scopes || '[]'),
    verificationStatus: app.verification_status,
    isActive: !!app.is_active,
    appTheme: app.app_theme ? JSON.parse(app.app_theme) : null,
    createdAt: app.created_at,
    updatedAt: app.updated_at,
  });
});

devApps.patch('/:id', async (c) => {
  const { userId } = getAuth(c);
  const id = c.req.param('id');
  const body = await c.req.json();

  const app = await queryOne<any>(
    'SELECT id, name FROM oauth_clients WHERE id = ? AND owner_id = ?',
    [id, userId]
  );
  if (!app) return c.json({ error: 'App not found' }, 404);

  const { name, description, redirect_uris, allowed_scopes, logo_url, app_theme } = body;
  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (logo_url !== undefined) { updates.push('logo_url = ?'); params.push(logo_url); }
  if (app_theme !== undefined) {
    updates.push('app_theme = ?');
    params.push(app_theme ? JSON.stringify(app_theme) : null);
  }
  if (redirect_uris !== undefined) {
    if (!Array.isArray(redirect_uris) || !redirect_uris.every(isValidRedirectUri)) {
      return c.json({ error: 'Redirect URIs must be absolute http:// or https:// URLs without fragments' }, 400);
    }
    updates.push('redirect_uris = ?');
    params.push(JSON.stringify(redirect_uris));
  }
  if (allowed_scopes !== undefined) {
    const validScopes = allowed_scopes.filter((s: string) => ['profile', 'email', 'openid', 'read', 'write'].includes(s));
    updates.push('allowed_scopes = ?');
    params.push(JSON.stringify(validScopes));
  }

  if (updates.length === 0) return c.json({ message: 'No changes' });

  params.push(id);
  await query(`UPDATE oauth_clients SET ${updates.join(', ')} WHERE id = ?`, params);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'app.updated', 'oauth_client', id, { updates: updates.map(u => u.split(' =')[0]) }, ip, ua);
  return c.json({ message: 'App updated successfully' });
});

devApps.delete('/:id', async (c) => {
  const { userId } = getAuth(c);
  const id = c.req.param('id');

  const app = await queryOne<any>(
    'SELECT id FROM oauth_clients WHERE id = ? AND owner_id = ?',
    [id, userId]
  );
  if (!app) return c.json({ error: 'App not found' }, 404);

  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'app.deleted', 'oauth_client', id, null, ip, ua);
  await query('DELETE FROM oauth_clients WHERE id = ?', [id]);
  return c.json({ message: 'App deleted successfully' });
});

devApps.post('/:id/regenerate-secret', async (c) => {
  const { userId } = getAuth(c);
  const id = c.req.param('id');

  const app = await queryOne<any>(
    'SELECT id FROM oauth_clients WHERE id = ? AND owner_id = ?',
    [id, userId]
  );
  if (!app) return c.json({ error: 'App not found' }, 404);

  const newSecret = generateSecureToken(32);
  await query('UPDATE oauth_clients SET client_secret = ? WHERE id = ?', [newSecret, id]);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'app.secret.regenerated', 'oauth_client', id, null, ip, ua);
  return c.json({ clientSecret: newSecret });
});

devApps.post('/:id/logo', async (c) => {
  const { userId } = getAuth(c);
  const id = c.req.param('id');

  const app = await queryOne<any>(
    'SELECT id FROM oauth_clients WHERE id = ? AND owner_id = ?',
    [id, userId]
  );
  if (!app) return c.json({ error: 'App not found' }, 404);

  const body = await c.req.parseBody();
  const file = body['file'];
  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (!validTypes.includes(file.type)) {
    return c.json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' }, 400);
  }

  if (!existsSync(LOGO_DIR)) {
    await mkdir(LOGO_DIR, { recursive: true });
  }

  const extName = file.name ? extname(file.name) : '.png';
  const filename = `${randomUUID()}${extName}`;
  const filepath = join(LOGO_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesMagicBytes(file.type, buffer)) {
    return c.json({ error: 'File content does not match its declared image type' }, 400);
  }
  await writeFile(filepath, buffer);

  const base = (config.cors.origin || `http://localhost:${config.server.port}`).replace(/\/$/, '');
  const logoUrl = `${base}/uploads/app-logos/${filename}`;

  await query('UPDATE oauth_clients SET logo_url = ? WHERE id = ?', [logoUrl, id]);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'app.logo_uploaded', 'oauth_client', id, { filename }, ip, ua);

  return c.json({ logoUrl });
});

export default devApps;
