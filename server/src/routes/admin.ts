import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { query, queryOne } from '../db/connection.js';
import { hashPassword } from '../utils/crypto.js';
import { generateAccessToken } from '../utils/jwt.js';
import { authMiddleware, adminMiddleware, getAuth } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { auditLog } from '../utils/audit.js';
import { getClientIP } from '../utils/ip.js';

const admin = new Hono();

admin.use('*', authMiddleware);
admin.use('*', adminMiddleware);

// ── Dashboard ──────────────────────────────────────────────
admin.get('/dashboard', async (c) => {
  const range = c.req.query('range') || 'all';
  let rangeClause = '';
  if (range === 'd') rangeClause = ' AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)';
  else if (range === '7d') rangeClause = ' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
  else if (range === '30d') rangeClause = ' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';

  const totalUsers = await queryOne<any>('SELECT COUNT(*) as count FROM users');
  const activeUsers = await queryOne<any>('SELECT COUNT(*) as count FROM users WHERE is_active = true');
  const totalApps = await queryOne<any>('SELECT COUNT(*) as count FROM oauth_clients');
  const totalTokens = await queryOne<any>('SELECT COUNT(*) as count FROM oauth_tokens');
  const tokensToday = await queryOne<any>(
    range === 'all'
      ? "SELECT COUNT(*) as count FROM oauth_tokens WHERE DATE(created_at) = CURDATE()"
      : `SELECT COUNT(*) as count FROM oauth_tokens WHERE 1=1${rangeClause}`
  );
  const totalStorage = await queryOne<any>('SELECT COALESCE(SUM(size_bytes), 0) as total FROM storage_files');
  const usersWith2FA = await queryOne<any>('SELECT COUNT(*) as count FROM users WHERE two_factor_enabled = true');
  const passkeyCount = await queryOne<any>('SELECT COUNT(*) as count FROM user_passkeys');
  const sessionsActive = await queryOne<any>('SELECT COUNT(*) as count FROM sessions WHERE expires_at > NOW()');
  const totalFiles = await queryOne<any>('SELECT COUNT(*) as count FROM storage_files');

  const recentUsers = await query<any[]>(
    range === 'all'
      ? 'SELECT id, email, name, role, created_at, last_login_at, is_active FROM users ORDER BY created_at DESC LIMIT 5'
      : `SELECT id, email, name, role, created_at, last_login_at, is_active FROM users WHERE 1=1${rangeClause} ORDER BY created_at DESC LIMIT 5`
  );
  const appsByStatus = await query<any[]>(
    'SELECT verification_status, COUNT(*) as count FROM oauth_clients GROUP BY verification_status'
  );
  const recentTokens = await query<any[]>(
    range === 'all'
      ? `SELECT ot.id, ot.created_at, ot.client_id, oc.name as client_name, u.email as user_email
         FROM oauth_tokens ot
         JOIN oauth_clients oc ON ot.client_id = oc.id
         JOIN users u ON ot.user_id = u.id
         ORDER BY ot.created_at DESC LIMIT 5`
      : `SELECT ot.id, ot.created_at, ot.client_id, oc.name as client_name, u.email as user_email
         FROM oauth_tokens ot
         JOIN oauth_clients oc ON ot.client_id = oc.id
         JOIN users u ON ot.user_id = u.id
         WHERE ot.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
         ORDER BY ot.created_at DESC LIMIT 5`,
      [range === 'd' ? 1 : range === '7d' ? 7 : 30]
  );
  const storageLeaders = await query<any[]>(
    `SELECT u.id, u.email, u.name, COALESCE(SUM(sf.size_bytes), 0) as total_bytes
     FROM users u
     LEFT JOIN storage_files sf ON sf.user_id = u.id
     GROUP BY u.id, u.email, u.name
     ORDER BY total_bytes DESC LIMIT 5`
  );

  return c.json({
    stats: {
      totalUsers: Number(totalUsers?.count) || 0,
      activeUsers: Number(activeUsers?.count) || 0,
      totalApps: Number(totalApps?.count) || 0,
      totalTokens: Number(totalTokens?.count) || 0,
      tokensToday: Number(tokensToday?.count) || 0,
      totalStorage: Number(totalStorage?.total) || 0,
      twoFactorEnabled: Number(usersWith2FA?.count) || 0,
      passkeyCount: Number(passkeyCount?.count) || 0,
      activeSessions: Number(sessionsActive?.count) || 0,
      totalFiles: Number(totalFiles?.count) || 0,
    },
    recentUsers: recentUsers || [],
    appsByStatus: appsByStatus || [],
    recentTokens: recentTokens || [],
    storageLeaders: (storageLeaders || []).map(u => ({ ...u, total_bytes: Number(u.total_bytes) || 0 })),
  });
});

// ── Users ──────────────────────────────────────────────────
admin.get('/users', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const search = c.req.query('search') || '';
  const offset = (page - 1) * limit;

  let where = '';
  const params: any[] = [];
  if (search) {
    where = 'WHERE email LIKE ? OR name LIKE ?';
    params.push(`%${search}%`, `%${search}%`);
  }

  const total = await queryOne<any>(
    `SELECT COUNT(*) as count FROM users ${where}`, params.length ? params : undefined
  );

  const users = await query<any[]>(
    `SELECT id, email, name, role, avatar_url, is_active, created_at, updated_at, last_login_at, two_factor_enabled
     FROM users ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const totalCount = Number(total?.count) || 0;
  return c.json({
    users: users || [],
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  });
});

admin.get('/users/:id', async (c) => {
  const id = c.req.param('id');
  const user = await queryOne<any>(
    `SELECT id, email, name, role, avatar_url, is_active, created_at, updated_at, last_login_at,
            two_factor_enabled, password_changed_at
     FROM users WHERE id = ?`,
    [id]
  );
  if (!user) return c.json({ error: 'User not found' }, 404);

  const stats = await queryOne<any>(
    `SELECT
      (SELECT COUNT(*) FROM user_connected_apps WHERE user_id = ?) as connected_apps,
      (SELECT COUNT(*) FROM sessions WHERE user_id = ?) as sessions,
      (SELECT COUNT(*) FROM oauth_clients WHERE owner_id = ?) as owned_apps,
      (SELECT COUNT(*) FROM oauth_tokens WHERE user_id = ?) as tokens,
      (SELECT COUNT(*) FROM user_passkeys WHERE user_id = ?) as passkeys,
      (SELECT COUNT(*) FROM storage_files WHERE user_id = ?) as storage_files,
      (SELECT COALESCE(SUM(size_bytes), 0) FROM storage_files WHERE user_id = ?) as storage_used`,
    [id, id, id, id, id, id, id]
  );

  return c.json({
    user,
    stats: {
      connected_apps: Number(stats?.connected_apps) || 0,
      sessions: Number(stats?.sessions) || 0,
      owned_apps: Number(stats?.owned_apps) || 0,
      tokens: Number(stats?.tokens) || 0,
      passkeys: Number(stats?.passkeys) || 0,
      storage_files: Number(stats?.storage_files) || 0,
      storage_used: Number(stats?.storage_used) || 0,
    },
  });
});

admin.patch('/users/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name, email, role, avatar_url, is_active } = body;

  const user = await queryOne<any>('SELECT id FROM users WHERE id = ?', [id]);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (email !== undefined) {
    const existing = await queryOne<any>('SELECT id FROM users WHERE email = ? AND id != ?', [email, id]);
    if (existing) return c.json({ error: 'Email already in use' }, 409);
    updates.push('email = ?'); params.push(email);
  }
  if (role !== undefined) {
    if (!['user', 'admin'].includes(role)) return c.json({ error: 'Invalid role' }, 400);
    updates.push('role = ?'); params.push(role);
  }
  if (avatar_url !== undefined) { updates.push('avatar_url = ?'); params.push(avatar_url); }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

  if (updates.length === 0) return c.json({ message: 'No changes' });

  params.push(id);
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(adminUserId, 'user.updated', 'user', id, { changes: Object.keys(body).filter(k => body[k] !== undefined) }, ip, ua);
  return c.json({ message: 'User updated successfully' });
});

admin.delete('/users/:id', async (c) => {
  const id = c.req.param('id');
  const user = await queryOne<any>('SELECT id, role FROM users WHERE id = ?', [id]);
  if (!user) return c.json({ error: 'User not found' }, 404);
  if (user.role === 'admin') {
    const adminCount = await queryOne<any>('SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin']);
    if (Number(adminCount?.count) <= 1) return c.json({ error: 'Cannot delete the last admin' }, 400);
  }
  const { userId: deleterUserId } = getAuth(c);
  const ip2 = getClientIP(c);
  const ua2 = c.req.header('user-agent') || null;
  await auditLog(deleterUserId, 'user.deleted', 'user', id, null, ip2, ua2);
  await query('DELETE FROM users WHERE id = ?', [id]);
  return c.json({ message: 'User deleted successfully' });
});

// Ban/unban user (toggles is_active, also revokes active sessions)
admin.post('/users/:id/ban', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const banned = body.banned === true || body.banned === false ? body.banned : null;
  if (banned === null) return c.json({ error: 'banned (boolean) is required' }, 400);

  const user = await queryOne<any>('SELECT id, role, is_active FROM users WHERE id = ?', [id]);
  if (!user) return c.json({ error: 'User not found' }, 404);
  if (user.role === 'admin') return c.json({ error: 'Cannot ban an admin' }, 400);

  await query('UPDATE users SET is_active = ? WHERE id = ?', [banned ? 1 : 0, id]);
  if (banned) {
    await query('DELETE FROM sessions WHERE user_id = ?', [id]);
  }
  const { userId: bannerUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(bannerUserId, banned ? 'user.banned' : 'user.unbanned', 'user', id, { banned }, ip, ua);
  return c.json({ message: banned ? 'User banned successfully' : 'User unbanned successfully' });
});

// Force password reset
admin.post('/users/:id/force-reset-password', async (c) => {
  const id = c.req.param('id');
  const user = await queryOne<any>('SELECT id FROM users WHERE id = ?', [id]);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const tempPassword = randomUUID() + randomUUID().slice(0, 8);
  const hashedPassword = await hashPassword(tempPassword);
  await query(
    'UPDATE users SET password_hash = ?, password_changed_at = NOW() WHERE id = ?',
    [hashedPassword, id]
  );

  const { userId: resetterUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(resetterUserId, 'user.password.force_reset', 'user', id, null, ip, ua);
  return c.json({ message: 'Password reset successfully', tempPassword });
});

// View active sessions for a user
admin.get('/users/:id/sessions', async (c) => {
  const id = c.req.param('id');
  const sessions = await query<any[]>(
    `SELECT id, created_at, expires_at, ip_address, user_agent 
     FROM sessions WHERE user_id = ? ORDER BY created_at DESC`,
    [id]
  );
  return c.json({ sessions: sessions || [] });
});

// Impersonate a user
admin.post('/users/:id/impersonate', async (c) => {
  const id = c.req.param('id');
  const user = await queryOne<any>('SELECT id, email, name, role FROM users WHERE id = ?', [id]);
  if (!user) return c.json({ error: 'User not found' }, 404);
  if (user.role === 'admin') return c.json({ error: 'Cannot impersonate other admins' }, 403);

  const token = await generateAccessToken(user.id, user.email);

  const { userId: impersonatorId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(impersonatorId, 'user.impersonated', 'user', id, null, ip, ua);
  return c.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

// View user's OAuth tokens
admin.get('/users/:id/tokens', async (c) => {
  const id = c.req.param('id');
  const tokens = await query<any[]>(
    `SELECT ot.id, ot.access_token, ot.client_id, oc.name as client_name, ot.scope, ot.created_at, ot.expires_at, ot.revoked_at
     FROM oauth_tokens ot
     JOIN oauth_clients oc ON ot.client_id = oc.id
     WHERE ot.user_id = ?
     ORDER BY ot.created_at DESC LIMIT 50`,
    [id]
  );
  return c.json({ tokens: tokens || [] });
});

// View user's storage files
admin.get('/users/:id/storage-files', async (c) => {
  const id = c.req.param('id');
  const files = await query<any[]>(
    `SELECT sf.id, sf.original_name, sf.mime_type, sf.size_bytes, sf.created_at,
            oc.name as client_name
     FROM storage_files sf
     LEFT JOIN oauth_clients oc ON sf.client_id = oc.id
     WHERE sf.user_id = ?
     ORDER BY sf.created_at DESC LIMIT 50`,
    [id]
  );
  return c.json({ files: files || [] });
});

// ── OAuth Apps ─────────────────────────────────────────────
admin.get('/apps', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const search = c.req.query('search') || '';
  const status = c.req.query('status') || '';
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push('(oc.name LIKE ? OR oc.client_id LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    conditions.push('oc.verification_status = ?');
    params.push(status);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const totalAppsCount = await queryOne<any>(
    `SELECT COUNT(*) as count FROM oauth_clients oc ${where}`, params.length ? params : undefined
  );

  const apps = await query<any[]>(
    `SELECT oc.id, oc.client_id, oc.name, oc.description, oc.redirect_uris, oc.allowed_scopes,
            oc.verification_status, oc.is_active, oc.owner_id, oc.created_at, oc.updated_at,
            u.name as owner_name, u.email as owner_email,
            (SELECT COUNT(*) FROM oauth_tokens WHERE client_id = oc.id) as token_count
     FROM oauth_clients oc
     LEFT JOIN users u ON oc.owner_id = u.id
     ${where}
     ORDER BY oc.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const appsTotal = Number(totalAppsCount?.count) || 0;
  return c.json({
    apps: (apps || []).map(a => ({ ...a, token_count: Number(a.token_count) || 0 })),
    pagination: {
      page, limit,
      total: appsTotal,
      totalPages: Math.ceil(appsTotal / limit),
    },
  });
});

admin.get('/apps/:id', async (c) => {
  const id = c.req.param('id');
  const app = await queryOne<any>(
    `SELECT oc.id, oc.client_id, oc.client_secret, oc.name, oc.description, oc.redirect_uris,
            oc.allowed_scopes, oc.verification_status, oc.is_active, oc.owner_id, oc.created_at, oc.updated_at,
            u.name as owner_name, u.email as owner_email,
            (SELECT COUNT(*) FROM oauth_tokens WHERE client_id = oc.id) as token_count,
            (SELECT COUNT(*) FROM storage_files WHERE client_id = oc.id) as storage_file_count,
            (SELECT COALESCE(SUM(size_bytes), 0) FROM storage_files WHERE client_id = oc.id) as storage_bytes
     FROM oauth_clients oc
     LEFT JOIN users u ON oc.owner_id = u.id
     WHERE oc.id = ?`,
    [id]
  );
  if (!app) return c.json({ error: 'App not found' }, 404);
  return c.json({
    app: {
      ...app,
      token_count: Number(app.token_count) || 0,
      storage_file_count: Number(app.storage_file_count) || 0,
      storage_bytes: Number(app.storage_bytes) || 0,
    },
  });
});

admin.patch('/apps/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { name, description, verification_status, is_active, redirect_uris, allowed_scopes } = body;

  const app = await queryOne<any>('SELECT id FROM oauth_clients WHERE id = ?', [id]);
  if (!app) return c.json({ error: 'App not found' }, 404);

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (description !== undefined) { updates.push('description = ?'); params.push(description); }
  if (verification_status !== undefined) {
    if (!['unverified', 'verified', 'official'].includes(verification_status)) {
      return c.json({ error: 'Invalid verification status' }, 400);
    }
    updates.push('verification_status = ?');
    params.push(verification_status);
  }
  if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
  if (redirect_uris !== undefined) { updates.push('redirect_uris = ?'); params.push(JSON.stringify(redirect_uris)); }
  if (allowed_scopes !== undefined) { updates.push('allowed_scopes = ?'); params.push(JSON.stringify(allowed_scopes)); }

  if (updates.length === 0) return c.json({ message: 'No changes' });

  params.push(id);
  await query(`UPDATE oauth_clients SET ${updates.join(', ')} WHERE id = ?`, params);
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(adminUserId, 'app.updated', 'oauth_client', id, { changes: Object.keys(body).filter(k => body[k] !== undefined) }, ip, ua);
  return c.json({ message: 'App updated successfully' });
});

admin.delete('/apps/:id', async (c) => {
  const id = c.req.param('id');
  const app = await queryOne<any>('SELECT id, name FROM oauth_clients WHERE id = ?', [id]);
  if (!app) return c.json({ error: 'App not found' }, 404);
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(adminUserId, 'app.deleted', 'oauth_client', id, { name: app.name }, ip, ua);
  await query('DELETE FROM oauth_clients WHERE id = ?', [id]);
  return c.json({ message: 'App deleted successfully' });
});

// Regenerate app client secret (admin)
admin.post('/apps/:id/regenerate-secret', async (c) => {
  const id = c.req.param('id');
  const app = await queryOne<any>('SELECT id FROM oauth_clients WHERE id = ?', [id]);
  if (!app) return c.json({ error: 'App not found' }, 404);

  const newSecret = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '').slice(0, 16);
  await query('UPDATE oauth_clients SET client_secret = ? WHERE id = ?', [newSecret, id]);
  const { userId: secretRegenUserId } = getAuth(c);
  await auditLog(secretRegenUserId, 'app.secret.regenerated', 'oauth_client', id, null, null, null);
  return c.json({ clientSecret: newSecret });
});

// ── OAuth Tokens ─────────────────────────────────────────
admin.get('/tokens', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const search = c.req.query('search') || '';
  const clientId = c.req.query('client_id') || '';
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const params: any[] = [];

  if (search) {
    conditions.push('(u.email LIKE ? OR oc.name LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  if (clientId) {
    conditions.push('ot.client_id = ?');
    params.push(clientId);
  }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const totalTokensCount = await queryOne<any>(
    `SELECT COUNT(*) as count FROM oauth_tokens ot
     JOIN users u ON ot.user_id = u.id
     JOIN oauth_clients oc ON ot.client_id = oc.id
     ${where}`,
    params.length ? params : undefined
  );

  const tokens = await query<any[]>(
    `SELECT ot.id, ot.access_token, ot.scope, ot.created_at, ot.expires_at, ot.revoked_at,
            u.id as user_id, u.email as user_email, u.name as user_name,
            oc.id as client_db_id, oc.client_id, oc.name as client_name
     FROM oauth_tokens ot
     JOIN users u ON ot.user_id = u.id
     JOIN oauth_clients oc ON ot.client_id = oc.id
     ${where}
     ORDER BY ot.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const tokensTotal = Number(totalTokensCount?.count) || 0;
  return c.json({
    tokens: tokens || [],
    pagination: {
      page, limit,
      total: tokensTotal,
      totalPages: Math.ceil(tokensTotal / limit),
    },
  });
});

admin.post('/tokens/:id/revoke', async (c) => {
  const id = c.req.param('id');
  const token = await queryOne<any>('SELECT id, revoked_at FROM oauth_tokens WHERE id = ?', [id]);
  if (!token) return c.json({ error: 'Token not found' }, 404);
  if (token.revoked_at) return c.json({ message: 'Token already revoked' });
  await query('UPDATE oauth_tokens SET revoked_at = NOW() WHERE id = ?', [id]);
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(adminUserId, 'token.revoked', 'oauth_token', id, null, ip, ua);
  return c.json({ message: 'Token revoked successfully' });
});

// ── Storage Overview ─────────────────────────────────────
admin.get('/storage', async (c) => {
  const totalStorage = await queryOne<any>('SELECT COALESCE(SUM(size_bytes), 0) as total, COUNT(*) as files FROM storage_files');
  const totalQuota = await queryOne<any>('SELECT COUNT(*) * 104857600 as total_quota FROM users');
  const topUsers = await query<any[]>(
    `SELECT u.id, u.email, u.name, COALESCE(SUM(sf.size_bytes), 0) as used_bytes,
            COUNT(sf.id) as file_count
     FROM users u
     LEFT JOIN storage_files sf ON sf.user_id = u.id
     GROUP BY u.id, u.email, u.name
     ORDER BY used_bytes DESC LIMIT 20`
  );
  const topApps = await query<any[]>(
    `SELECT oc.id, oc.client_id, oc.name, COALESCE(SUM(sf.size_bytes), 0) as used_bytes,
            COUNT(sf.id) as file_count
     FROM oauth_clients oc
     LEFT JOIN storage_files sf ON sf.client_id = oc.id
     GROUP BY oc.id, oc.client_id, oc.name
     HAVING used_bytes > 0
     ORDER BY used_bytes DESC LIMIT 10`
  );
  const mimeBreakdown = await query<any[]>(
    `SELECT mime_type, COUNT(*) as count, SUM(size_bytes) as total_bytes
     FROM storage_files
     GROUP BY mime_type ORDER BY total_bytes DESC LIMIT 10`
  );

  const totalBytes = Number(totalStorage?.total) || 0;
  const totalFiles = Number(totalStorage?.files) || 0;
  const totalQuotaVal = Number(totalQuota?.total_quota) || 0;

  return c.json({
    summary: {
      totalBytes,
      totalFiles,
      totalQuota: totalQuotaVal,
      usedPercent: totalQuotaVal > 0
        ? Math.round((totalBytes / totalQuotaVal) * 10000) / 100
        : 0,
    },
    topUsers: (topUsers || []).map(u => ({ ...u, used_bytes: Number(u.used_bytes) || 0, file_count: Number(u.file_count) || 0 })),
    topApps: (topApps || []).map(a => ({ ...a, used_bytes: Number(a.used_bytes) || 0, file_count: Number(a.file_count) || 0 })),
    mimeBreakdown: (mimeBreakdown || []).map(m => ({ ...m, count: Number(m.count) || 0, total_bytes: Number(m.total_bytes) || 0 })),
  });
});

// ── System Health ─────────────────────────────────────────
admin.get('/health', async (c) => {
  const dbStatus = await queryOne<any>('SELECT 1 as ok');
  const userCount = await queryOne<any>('SELECT COUNT(*) as count FROM users');
  const tokenCount = await queryOne<any>('SELECT COUNT(*) as count FROM oauth_tokens WHERE revoked_at IS NULL');
  const fileCount = await queryOne<any>('SELECT COUNT(*) as count FROM storage_files');
  const uptime = process.uptime();
  const mem = process.memoryUsage();

  return c.json({
    status: 'healthy',
    db: !!dbStatus,
    uptime: Math.floor(uptime),
    memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024), heapTotal: Math.round(mem.heapTotal / 1024 / 1024), rss: Math.round(mem.rss / 1024 / 1024) },
    counts: { users: Number(userCount?.count) || 0, activeTokens: Number(tokenCount?.count) || 0, files: Number(fileCount?.count) || 0 },
    version: '1.0.0',
    nodeEnv: config.server.nodeEnv,
  });
});

// ── Audit Log ─────────────────────────────────────────────
admin.get('/audit-log', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = (page - 1) * limit;
  const action = c.req.query('action') || '';
  const uId = c.req.query('user_id') || '';

  let where = '';
  const params: any[] = [];
  if (action) { where += ' AND action = ?'; params.push(action); }
  if (uId) { where += ' AND user_id = ?'; params.push(uId); }

  const rows = await query<any[]>(`SELECT al.*, u.email as user_email FROM audit_log al LEFT JOIN users u ON al.user_id = u.id WHERE 1=1${where} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const total = await queryOne<any>(`SELECT COUNT(*) as count FROM audit_log WHERE 1=1${where}`, params);

  return c.json({ entries: rows || [], total: Number(total?.count) || 0, page, limit });
});

// ── Email Templates ───────────────────────────────────────
admin.get('/email-templates', async (c) => {
  const templates = await query<any[]>('SELECT * FROM email_templates ORDER BY template_key');
  return c.json({ templates: templates || [] });
});

admin.patch('/email-templates/:key', async (c) => {
  const key = c.req.param('key');
  const body = await c.req.json();
  const { subject, body_html, body_text } = body;
  const existing = await queryOne<any>('SELECT id FROM email_templates WHERE template_key = ?', [key]);
  if (existing) {
    const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(adminUserId, 'email_template.updated', 'email_template', key, null, ip, ua);
  await query('UPDATE email_templates SET subject = ?, body_html = ?, body_text = ? WHERE template_key = ?', [subject, body_html, body_text || null, key]);
  } else {
    await query('INSERT INTO email_templates (id, template_key, subject, body_html, body_text) VALUES (?, ?, ?, ?, ?)', [randomUUID(), key, subject, body_html, body_text || null]);
  }
  return c.json({ success: true });
});

admin.delete('/email-templates/:key', async (c) => {
  const key = c.req.param('key');
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(adminUserId, 'email_template.deleted', 'email_template', key, null, ip, ua);
  await query('DELETE FROM email_templates WHERE template_key = ?', [key]);
  return c.json({ success: true });
});

// ── Bulk User Operations ──────────────────────────────────
admin.post('/users/bulk-delete', async (c) => {
  const { userIds } = await c.req.json();
  if (!Array.isArray(userIds) || userIds.length === 0) return c.json({ error: 'No user IDs provided' }, 400);
  const { userId } = getAuth(c);
  for (const id of userIds) {
    const u = await queryOne<any>('SELECT role FROM users WHERE id = ?', [id]);
    if (!u) continue;
    if (u.role === 'admin') continue;
    await query('DELETE FROM users WHERE id = ?', [id]);
    await auditLog(userId, 'user.deleted', 'user', id, { bulk: true }, null, null);
  }
  return c.json({ success: true });
});

admin.post('/users/bulk-disable', async (c) => {
  const { userIds } = await c.req.json();
  if (!Array.isArray(userIds) || userIds.length === 0) return c.json({ error: 'No user IDs provided' }, 400);
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  let disabledCount = 0;
  for (const id of userIds) {
    const u = await queryOne<any>('SELECT role FROM users WHERE id = ?', [id]);
    if (!u || u.role === 'admin') continue;
    await query('UPDATE users SET is_active = 0 WHERE id = ?', [id]);
    disabledCount++;
  }
  await auditLog(adminUserId, 'users.bulk_disabled', 'user', null, { count: disabledCount }, ip, ua);
  return c.json({ success: true });
});

function escapeCsvCell(value: string): string {
  const v = String(value ?? '');
  // Neutralize spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(v)) return "'" + v;
  if (/[",\n\r]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

admin.get('/users/export', async (c) => {
  const users = await query<any[]>('SELECT id, email, name, role, is_active, created_at, last_login_at, two_factor_enabled FROM users ORDER BY created_at DESC');
  const csv = ['id,email,name,role,is_active,created_at,last_login_at,two_factor_enabled',
    ...(users || []).map(u => [u.id, u.email, u.name, u.role, u.is_active, u.created_at, u.last_login_at || '', u.two_factor_enabled].map(escapeCsvCell).join(','))].join('\n');
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', 'attachment; filename="users.csv"');
  return c.body(csv);
});

// ── Feature Flags ─────────────────────────────────────────
admin.get('/feature-flags', async (c) => {
  const flags = await query<any[]>('SELECT setting_key, setting_value FROM admin_settings WHERE setting_key LIKE "feature_%"');
  return c.json({ flags: flags || [] });
});

admin.patch('/feature-flags', async (c) => {
  const body = await c.req.json();
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(adminUserId, 'feature_flags.updated', 'config', null, { flags: Object.keys(body).filter(k => k.startsWith('feature_')) }, ip, ua);
  for (const [key, value] of Object.entries(body)) {
    if (!key.startsWith('feature_')) continue;
    await query('INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [key, String(value)]);
  }
  return c.json({ success: true });
});

// ── Maintenance Mode ──────────────────────────────────────
admin.post('/maintenance-mode', async (c) => {
  const { enabled } = await c.req.json();
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(adminUserId, enabled ? 'maintenance_mode.enabled' : 'maintenance_mode.disabled', 'config', null, null, ip, ua);
  await query('INSERT INTO admin_settings (setting_key, setting_value) VALUES ("maintenance_mode", ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [enabled ? '1' : '0']);
  return c.json({ maintenanceMode: !!enabled });
});

admin.get('/maintenance-mode', async (c) => {
  const row = await queryOne<any>('SELECT setting_value FROM admin_settings WHERE setting_key = "maintenance_mode"');
  return c.json({ enabled: row?.setting_value === '1' });
});

// ── Scheduled Tasks ───────────────────────────────────────
admin.get('/scheduled-tasks', async (c) => {
  const tasks = await query<any[]>('SELECT * FROM scheduled_tasks ORDER BY name');
  return c.json({ tasks: tasks || [] });
});

admin.post('/scheduled-tasks/run', async (c) => {
  const { name } = await c.req.json();
  const { userId: adminUserId } = getAuth(c);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  if (name === 'prune_expired_tokens') {
    await query("DELETE FROM oauth_tokens WHERE expires_at < NOW() OR revoked_at IS NOT NULL");
    await query("DELETE FROM oauth_codes WHERE expires_at < NOW() OR used_at IS NOT NULL");
    await query('UPDATE scheduled_tasks SET last_run = NOW(), next_run = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE name = "prune_expired_tokens"');
    await auditLog(adminUserId, 'scheduled_task.run', 'scheduled_task', 'prune_expired_tokens', null, ip, ua);
    return c.json({ success: true, message: 'Expired tokens pruned' });
  }
  if (name === 'prune_audit_logs') {
    await query('DELETE FROM audit_log WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)');
    await query('UPDATE scheduled_tasks SET last_run = NOW(), next_run = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE name = "prune_audit_logs"');
    await auditLog(adminUserId, 'scheduled_task.run', 'scheduled_task', 'prune_audit_logs', null, ip, ua);
    return c.json({ success: true, message: 'Old audit logs pruned' });
  }
  if (name === 'clear_login_attempts') {
    await query('DELETE FROM login_attempts WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)');
    await query('DELETE FROM login_lockouts WHERE locked_until < NOW() AND attempt_count < 3');
    await query('UPDATE scheduled_tasks SET last_run = NOW(), next_run = DATE_ADD(NOW(), INTERVAL 1 HOUR) WHERE name = "clear_login_attempts"');
    await auditLog(adminUserId, 'scheduled_task.run', 'scheduled_task', 'clear_login_attempts', null, ip, ua);
    return c.json({ success: true, message: 'Old login attempts cleared' });
  }
  return c.json({ error: 'Unknown task' }, 400);
});

export default admin;
