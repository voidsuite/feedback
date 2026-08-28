import { Hono } from 'hono';
import { query, queryOne } from '../db/connection.js';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { setEmailConfig, isEmailConfigured } from '../utils/email.js';

const settings = new Hono();

settings.use('*', authMiddleware);
settings.use('*', adminMiddleware);

// GET /admin/settings — all settings
settings.get('/', async (c) => {
  const rows = await query<any>('SELECT setting_key, setting_value FROM admin_settings');
  const map: Record<string, string> = {};
  for (const row of rows) map[row.setting_key] = row.setting_value;
  return c.json({
    smtp_host: map.smtp_host || '',
    smtp_port: map.smtp_port || '587',
    smtp_user: map.smtp_user || '',
    smtp_pass: map.smtp_pass ? '••••••••' : '',
    smtp_from: map.smtp_from || '',
    smtp_from_name: map.smtp_from_name || 'VoidAuth',
    allow_signups: map.allow_signups !== '0',
  });
});

// PATCH /admin/settings — update settings
settings.patch('/', async (c) => {
  const body = await c.req.json();
  const allowed = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from', 'smtp_from_name', 'allow_signups'];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      const val = typeof body[key] === 'boolean' ? (body[key] ? '1' : '0') : String(body[key]);
      await query(
        'INSERT INTO admin_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, val, val]
      );
    }
  }

  // Reload email config into memory
  const rows = await query<any>('SELECT setting_key, setting_value FROM admin_settings');
  const map: Record<string, string> = {};
  for (const row of rows) map[row.setting_key] = row.setting_value;

  if (map.smtp_host && map.smtp_user && map.smtp_pass && map.smtp_from) {
    setEmailConfig({
      host: map.smtp_host,
      port: parseInt(map.smtp_port || '587'),
      user: map.smtp_user,
      pass: map.smtp_pass,
      from: map.smtp_from,
      fromName: map.smtp_from_name || 'VoidAuth',
    });
  }

  return c.json({ success: true });
});

// POST /admin/settings/email-test — test email config
settings.post('/email-test', async (c) => {
  const { sendEmail, isEmailConfigured } = await import('../utils/email.js');
  try {
    if (!isEmailConfigured()) return c.json({ error: 'Email not fully configured' }, 400);
    const body = await c.req.json().catch(() => ({}));
    await sendEmail(body.to || 'test@voidauth.local', 'VoidAuth — Test Email', '<h1>Test</h1><p>If you received this, email is configured correctly.</p>');
    return c.json({ success: true });
  } catch (err: any) {
    const msg = err.message || '';
    if (msg.includes('getaddrinfo') || msg.includes('ENOTFOUND')) {
      return c.json({ error: 'Could not resolve SMTP hostname. Please check the SMTP Host address and your DNS settings.' }, 500);
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('connect ECONNREFUSED')) {
      return c.json({ error: 'Connection refused by SMTP server. Check the port and whether the server is reachable.' }, 500);
    }
    if (msg.includes('Invalid login') || msg.includes('535') || msg.includes('authentication')) {
      return c.json({ error: 'SMTP authentication failed. Check your username and password.' }, 500);
    }
    return c.json({ error: msg || 'Failed to send test email' }, 500);
  }
});

export default settings;
