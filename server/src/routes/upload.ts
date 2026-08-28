import { Hono } from 'hono';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, extname } from 'path';
import { randomUUID } from 'crypto';
import { authMiddleware, getAuth } from '../middleware/auth.js';
import { query } from '../db/connection.js';
import { config } from '../config/index.js';
import { isAllowedImageType, matchesMagicBytes } from '../utils/validateFile.js';

const upload = new Hono();

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'avatars');

upload.post('/avatar', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || !(file instanceof File)) {
    return c.json({ error: 'No file provided' }, 400);
  }

  if (!isAllowedImageType(file.type)) {
    return c.json({ error: 'Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.' }, 400);
  }

  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }

  const extName = file.name ? extname(file.name) : '.png';
  const filename = `${randomUUID()}${extName}`;
  const filepath = join(UPLOAD_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!matchesMagicBytes(file.type, buffer)) {
    return c.json({ error: 'File content does not match its declared image type' }, 400);
  }
  await writeFile(filepath, buffer);

  // Build URL from the configured origin — never trust X-Forwarded-* headers
  const base = (config.cors.origin || `http://localhost:${config.server.port}`).replace(/\/$/, '');
  const avatarUrl = `${base}/uploads/avatars/${filename}`;

  await query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, userId]);

  return c.json({ avatarUrl });
});

export default upload;
