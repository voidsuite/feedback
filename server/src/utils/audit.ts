import { randomUUID } from 'crypto';
import { query } from '../db/connection.js';

export async function auditLog(
  userId: string | null,
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: any,
  ip?: string,
  userAgent?: string
) {
  await query(
    `INSERT INTO audit_log (id, user_id, action, resource_type, resource_id, details, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      userId,
      action,
      resourceType || null,
      resourceId || null,
      details ? JSON.stringify(details) : null,
      ip || null,
      userAgent || null,
    ]
  );
}
