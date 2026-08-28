import { Context, Next } from 'hono';
import { queryOne } from '../db/connection.js';
import { getAuth } from './auth.js';
import { getClientIP } from '../utils/ip.js';

export async function ipAccessControl(c: Context, next: Next) {
  const ip = getClientIP(c);

  const globalBlock = await queryOne<any>(
    "SELECT id FROM ip_allow_block WHERE target_type = 'global' AND rule_type = 'block' AND ip_or_cidr = ?",
    [ip]
  );
  if (globalBlock) {
    return c.json({ error: 'Access denied' }, 403);
  }

  try {
    const auth = getAuth(c);
    if (auth?.userId) {
      const userBlock = await queryOne<any>(
        "SELECT id FROM ip_allow_block WHERE target_type = 'user' AND target_id = ? AND rule_type = 'block' AND ip_or_cidr = ?",
        [auth.userId, ip]
      );
      if (userBlock) {
        return c.json({ error: 'Access denied for your account' }, 403);
      }
    }
  } catch {}

  await next();
}
