import { Hono, Context } from 'hono';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname, resolve } from 'path';
import { query, queryOne } from '../db/connection.js';
import { storageAuthMiddleware, getAuth } from '../middleware/auth.js';
import { isAllowedImageType, matchesMagicBytes } from '../utils/validateFile.js';

const storage = new Hono();
const QUOTA = 104_857_600; // 100MB
const STORAGE_ROOT = resolve(process.cwd(), 'uploads', 'user-storage');

storage.use('*', storageAuthMiddleware);

// Helper to parse JSON values that may come back as strings from MySQL2
function parseJSON(value: any): any {
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return value }
  }
  return value
}

/**
 * Storage is isolated per OAuth client: requests authenticated with an OAuth
 * access token can only read/write data belonging to that token's client.
 * First-party callers (session / JWT) may specify any client_id.
 * Returns the effective clientId and whether the caller is first-party.
 */
function resolveClientScope(c: Context, requestedClientId: string | null | undefined): { clientId: string | null; isScoped: boolean } {
  const auth = getAuth(c);
  if (auth.clientId) {
    return { clientId: auth.clientId, isScoped: true };
  }
  return { clientId: requestedClientId ?? null, isScoped: false };
}

async function ensureStorageTable() {
  await query(`CREATE TABLE IF NOT EXISTS storage_files (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    client_id VARCHAR(36) NULL,
    storage_path VARCHAR(512) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(127) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_id (user_id),
    INDEX idx_client_id (client_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await query(`CREATE TABLE IF NOT EXISTS storage_app_data (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    client_id VARCHAR(36) NULL,
    data_key VARCHAR(255) NOT NULL,
    data_value JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_app_key (user_id, client_id, data_key),
    INDEX idx_user_id (user_id),
    INDEX idx_client_id (client_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

async function getUsage(userId: string) {
  const fileRow = await queryOne<any>('SELECT COALESCE(SUM(size_bytes), 0) as used FROM storage_files WHERE user_id = ?', [userId]);
  const fileCount = await queryOne<any>('SELECT COUNT(*) as count FROM storage_files WHERE user_id = ?', [userId]);
  const dataRow = await queryOne<any>('SELECT COUNT(*) as items, COALESCE(SUM(OCTET_LENGTH(data_value)), 0) as size FROM storage_app_data WHERE user_id = ?', [userId]);
  const fileSize = Number(fileRow?.used) || 0;
  const dataSize = Number(dataRow?.size) || 0;
  return { used: fileSize + dataSize, quota: QUOTA, files: Number(fileCount?.count) || 0, dataItems: Number(dataRow?.items) || 0 };
}

// GET /storage/usage
storage.get('/usage', async (c) => {
  const { userId } = getAuth(c);
  await ensureStorageTable();
  const usage = await getUsage(userId);
  return c.json(usage);
});

// POST /storage/files - upload
storage.post('/files', async (c) => {
  const { userId } = getAuth(c);
  await ensureStorageTable();

  const body = await c.req.parseBody();
  const file = body['file'];
  const requestedClientId = typeof body['client_id'] === 'string' ? body['client_id'] : null;
  const { clientId } = resolveClientScope(c, requestedClientId);

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400);
  }

  // SVG is never accepted: a stored SVG can execute script when opened in the auth origin
  if (file.type === 'image/svg+xml') {
    return c.json({ error: 'SVG files are not allowed' }, 400);
  }

  // Check quota
  const usage = await getUsage(userId);
  if (usage.used + file.size > usage.quota) {
    return c.json({ error: 'Storage quota exceeded' }, 413);
  }

  const extName = file.name ? extname(file.name) : '.bin';
  const id = randomUUID();
  const filename = `${id}${extName}`;
  const userDir = join(STORAGE_ROOT, userId);

  if (!existsSync(userDir)) {
    await mkdir(userDir, { recursive: true });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // For declared image types, verify the magic bytes match the declared type
  if (isAllowedImageType(file.type) && !matchesMagicBytes(file.type, buffer)) {
    return c.json({ error: 'File content does not match its declared type' }, 400);
  }
  await writeFile(join(userDir, filename), buffer);

  const storagePath = `${userId}/${filename}`;
  await query(
    `INSERT INTO storage_files (id, user_id, client_id, storage_path, original_name, mime_type, size_bytes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, clientId, storagePath, file.name || 'unnamed', file.type || 'application/octet-stream', file.size]
  );

  // Check if approaching quota and send warning
  const newUsage = await getUsage(userId);
  const pct = newUsage.used / newUsage.quota;
  if (pct >= 0.8) {
    import('../utils/email.js').then(async (m) => {
      if (m.isEmailConfigured()) {
        await m.sendNotificationEmail(userId, 'storage_warning', 'Storage quota nearly full', (n) => m.buildStorageWarningEmail(n, (newUsage.used / 1_048_576).toFixed(1), (newUsage.quota / 1_048_576).toFixed(1)));
      }
    }).catch(() => {});
  }

  const host = c.req.header('host') || 'localhost:3001';
  const protocol = c.req.protocol || 'http';

  return c.json({
    id,
    originalName: file.name || 'unnamed',
    mimeType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
    url: `${protocol}://${host}/uploads/user-storage/${storagePath}`,
    createdAt: new Date().toISOString(),
  }, 201);
});

// GET /storage/files - list files
storage.get('/files', async (c) => {
  const { userId } = getAuth(c);
  await ensureStorageTable();
  const requestedClientId = c.req.query('client_id');
  const { clientId } = resolveClientScope(c, requestedClientId);
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
  const offset = (page - 1) * limit;

  let where = 'WHERE sf.user_id = ?';
  const params: any[] = [userId];
  if (clientId) { where += ' AND sf.client_id = ?'; params.push(clientId); }

  const rows = await query<any[]>(
    `SELECT sf.id, sf.original_name, sf.mime_type, sf.size_bytes, sf.storage_path, sf.client_id, sf.created_at,
            oc.name as client_name
     FROM storage_files sf
     LEFT JOIN oauth_clients oc ON sf.client_id = oc.id
     ${where}
     ORDER BY sf.created_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const count = await queryOne<any>(`SELECT COUNT(*) as total FROM storage_files sf ${where}`, params);

  const host = c.req.header('host') || 'localhost:3001';
  const protocol = c.req.protocol || 'http';

  return c.json({
    files: (rows || []).map(r => ({
      id: r.id,
      originalName: r.original_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      url: `${protocol}://${host}/uploads/user-storage/${r.storage_path}`,
      clientId: r.client_id,
      clientName: r.client_name,
      createdAt: r.created_at,
    })),
    total: count?.total || 0,
    page,
    limit,
  });
});

// GET /storage/files/:id - file metadata
storage.get('/files/:id', async (c) => {
  const { userId } = getAuth(c);
  const id = c.req.param('id');
  await ensureStorageTable();

  const row = await queryOne<any>(
    `SELECT sf.*, oc.name as client_name FROM storage_files sf
     LEFT JOIN oauth_clients oc ON sf.client_id = oc.id
     WHERE sf.id = ? AND sf.user_id = ?`,
    [id, userId]
  );
  if (!row) return c.json({ error: 'File not found' }, 404);

  const host = c.req.header('host') || 'localhost:3001';
  const protocol = c.req.protocol || 'http';

  return c.json({
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    url: `${protocol}://${host}/uploads/user-storage/${row.storage_path}`,
    clientId: row.client_id,
    clientName: row.client_name,
    createdAt: row.created_at,
  });
});

// DELETE /storage/files/:id
storage.delete('/files/:id', async (c) => {
  const { userId } = getAuth(c);
  const id = c.req.param('id');
  await ensureStorageTable();

  const row = await queryOne<any>(
    'SELECT id, storage_path FROM storage_files WHERE id = ? AND user_id = ?',
    [id, userId]
  );
  if (!row) return c.json({ error: 'File not found' }, 404);

  const filePath = resolve(STORAGE_ROOT, row.storage_path);
  if (filePath.startsWith(STORAGE_ROOT)) {
    try { await unlink(filePath); } catch { /* file may not exist on disk */ }
  }

  await query('DELETE FROM storage_files WHERE id = ?', [id]);
  return c.json({ success: true });
});

// POST /storage/data - save app data
storage.post('/data', async (c) => {
  const { userId } = getAuth(c);
  await ensureStorageTable();

  const body = await c.req.json();
  const requestedClientId = body.client_id;
  const { clientId } = resolveClientScope(c, requestedClientId);
  const { key, value } = body;
  if (!clientId || !key || value === undefined) {
    return c.json({ error: 'client_id, key, and value are required' }, 400);
  }

  const id = randomUUID();
  await query(
    `INSERT INTO storage_app_data (id, user_id, client_id, data_key, data_value)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE data_value = VALUES(data_value)`,
    [id, userId, clientId, key, JSON.stringify(value)]
  );

  return c.json({ success: true });
});

// GET /storage/data - get app data
storage.get('/data', async (c) => {
  const { userId } = getAuth(c);
  await ensureStorageTable();

  const requestedClientId = c.req.query('client_id');
  const { clientId } = resolveClientScope(c, requestedClientId);
  const key = c.req.query('key');

  if (!clientId) return c.json({ error: 'client_id required' }, 400);

  if (key) {
    const row = await queryOne<any>(
      'SELECT data_key, data_value, created_at, updated_at FROM storage_app_data WHERE user_id = ? AND client_id = ? AND data_key = ?',
      [userId, clientId, key]
    );
    if (!row) return c.json({ error: 'Data not found' }, 404);
    return c.json({
      key: row.data_key,
      value: parseJSON(row.data_value),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  const rows = await query<any[]>(
    'SELECT data_key, data_value, created_at, updated_at FROM storage_app_data WHERE user_id = ? AND client_id = ?',
    [userId, clientId]
  );

  return c.json({
    items: (rows || []).map(r => ({
      key: r.data_key,
      value: parseJSON(r.data_value),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// GET /storage/data/all - list all app data across all clients for the user
// Only first-party callers (session/JWT) may list across all clients.
storage.get('/data/all', async (c) => {
  const { userId, clientId } = getAuth(c);
  if (clientId) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  await ensureStorageTable();

  const rows = await query<any[]>(
    `SELECT sad.id, sad.client_id, sad.data_key, sad.data_value, sad.created_at, sad.updated_at,
            oc.name as client_name
     FROM storage_app_data sad
     LEFT JOIN oauth_clients oc ON sad.client_id = oc.id
     WHERE sad.user_id = ?
     ORDER BY sad.updated_at DESC`,
    [userId]
  );

  return c.json({
    items: (rows || []).map(r => ({
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      key: r.data_key,
      value: r.data_value,
      valueSize: typeof r.data_value === 'string' ? new Blob([r.data_value]).size : JSON.stringify(r.data_value).length,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
  });
});

// DELETE /storage/data
storage.delete('/data', async (c) => {
  const { userId } = getAuth(c);
  await ensureStorageTable();

  const requestedClientId = c.req.query('client_id');
  const { clientId } = resolveClientScope(c, requestedClientId);
  const key = c.req.query('key');
  if (!clientId || !key) return c.json({ error: 'client_id and key required' }, 400);

  await query('DELETE FROM storage_app_data WHERE user_id = ? AND client_id = ? AND data_key = ?', [userId, clientId, key]);
  return c.json({ success: true });
});

export default storage;
