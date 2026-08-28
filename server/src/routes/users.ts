import { Hono } from 'hono';
import { query, queryOne } from '../db/connection.js';
import { authMiddleware, getAuth } from '../middleware/auth.js';
import { hashPassword, verifyPassword } from '../utils/crypto.js';
import { auditLog } from '../utils/audit.js';
import { log } from '../utils/log.js';
import { getClientIP } from '../utils/ip.js';

const users = new Hono();

function parseScopes(scope?: string | null): string[] {
  // Supports both `profile email` and `profile,email`
  if (!scope) return ['profile'];
  return scope
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * GET /users/profile
 * Get current user profile
 */
users.get('/profile', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  const user = await queryOne<any>(
    `SELECT id, email, name, role, avatar_url, created_at, password_changed_at, last_login_at, two_factor_enabled 
     FROM users WHERE id = ?`,
    [userId]
  );

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  // Get statistics
  const stats = await queryOne<any>(
    `SELECT 
      (SELECT COUNT(*) FROM user_connected_apps WHERE user_id = ?) as connected_apps,
      (SELECT COUNT(*) FROM sessions WHERE user_id = ? AND expires_at > NOW()) as active_sessions
    `,
    [userId, userId]
  );

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at,
      passwordChangedAt: user.password_changed_at,
      lastLoginAt: user.last_login_at,
      twoFactorEnabled: !!user.two_factor_enabled,
    },
    stats: {
      connectedApps: stats.connected_apps || 0,
      activeSessions: stats.active_sessions || 0,
    },
  });
});

/**
 * GET /users/apps
 * Get user's connected OAuth applications
 */
users.get('/apps', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  const apps = await query<any[]>(
    `SELECT 
      uca.id,
      uca.scope,
      uca.connected_at,
      uca.last_used_at,
      oc.client_id,
      oc.name,
      oc.description,
      oc.logo_url
     FROM user_connected_apps uca
     JOIN oauth_clients oc ON uca.client_id = oc.id
     WHERE uca.user_id = ?
     ORDER BY uca.last_used_at DESC`,
    [userId]
  );

  return c.json({
    apps: apps.map(app => ({
      id: app.id,
      clientId: app.client_id,
      name: app.name,
      description: app.description,
      logoUrl: app.logo_url,
      scopes: parseScopes(app.scope),
      connectedAt: app.connected_at,
      lastUsedAt: app.last_used_at,
    })),
  });
});

/**
 * DELETE /users/apps/:appId
 * Revoke access for a connected app
 */
users.delete('/apps/:appId', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  const appId = c.req.param('appId');

  // Verify the app belongs to the user and get client_id
  const app = await queryOne<any>(
    'SELECT id, client_id FROM user_connected_apps WHERE id = ? AND user_id = ?',
    [appId, userId]
  );

  if (!app) {
    return c.json({ error: 'App not found' }, 404);
  }

  // Revoke all active tokens for this app
  // app.client_id is already the internal UUID from oauth_clients.id
  await query(
    `UPDATE oauth_tokens 
     SET revoked_at = NOW() 
     WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL`,
    [userId, app.client_id]
  );

  // Revoke all refresh tokens for this app
  await query(
    `UPDATE refresh_token_families 
     SET replaced_by = 'REVOKED' 
     WHERE user_id = ? AND client_id = ? AND replaced_by IS NULL`,
    [userId, app.client_id]
  );

  // Delete the connected app entry
  await query('DELETE FROM user_connected_apps WHERE id = ?', [appId]);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'user.app_revoked', 'user_connected_app', appId, null, ip, ua);

  return c.json({ message: 'App access revoked successfully' });
});

import { z } from 'zod';

const profileUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
  avatar_url: z.string().nullable().optional(),
});

/**
 * PATCH /users/profile
 * Update user profile (name, email, password)
 */
users.patch('/profile', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  
  try {
    const body = await c.req.json();
    const validated = profileUpdateSchema.parse(body);
    const { name, email, currentPassword, newPassword } = validated;

    // Get current user to verify password if needed and check email
    const user = await queryOne<any>(
      'SELECT id, email, name, password_hash FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // If email or password is being changed, we MUST have currentPassword
    if ((email && email !== user.email) || newPassword) {
      if (!currentPassword) {
        return c.json({ error: 'Current password is required to change email or password' }, 400);
      }

      const isValid = await verifyPassword(currentPassword, user.password_hash);
      if (!isValid) {
        return c.json({ error: 'Invalid current password' }, 401);
      }
    }

    // Update logic
    const updates: string[] = [];
    const params: any[] = [];

    if (name && name !== user.name) {
      updates.push('name = ?');
      params.push(name);
    }

    if (body.avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      params.push(body.avatar_url);
    }

    if (email && email !== user.email) {
      // Check if email already taken
      const existing = await queryOne<any>(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );
      if (existing) {
        return c.json({ error: 'Email already in use' }, 409);
      }
      updates.push('email = ?');
      params.push(email);
      // New email is not verified until the user confirms it.
      updates.push('email_verified = FALSE');
    }

    if (newPassword) {
      const hashedPassword = await hashPassword(newPassword);
      updates.push('password_hash = ?');
      params.push(hashedPassword);
      updates.push('password_changed_at = NOW()');
    }

    if (updates.length === 0) {
      return c.json({ message: 'No changes detected' });
    }

    params.push(userId);
    await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || null;
    await auditLog(userId, 'user.profile_updated', 'user', userId, { updates: updates.map(u => u.split(' =')[0]) }, ip, ua);

    if (newPassword) {
      import('../utils/email.js').then(async (m) => {
        if (m.isEmailConfigured()) {
          await m.sendNotificationEmail(userId, 'password_change', 'Your VoidAuth password has been changed', (n) => m.buildPasswordChangedEmail(n));
        }
      }).catch(() => {});
    }

    return c.json({ message: 'Profile updated successfully' });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.errors }, 400);
    }
    log.error('Profile update error', error as Error);
    return c.json({ error: 'Failed to update profile' }, 500);
  }
});

/**
 * DELETE /users/profile
 * Delete user account and all associated data
 */
users.delete('/profile', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  const { currentPassword } = await c.req.json();

  if (!currentPassword) {
    return c.json({ error: 'Current password is required to delete account' }, 400);
  }

  const user = await queryOne<any>(
    'SELECT password_hash FROM users WHERE id = ?',
    [userId]
  );

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const isValid = await verifyPassword(currentPassword, user.password_hash);
  if (!isValid) {
    return c.json({ error: 'Invalid current password' }, 401);
  }

  // Cascading deletes are handled by the database
  await query('DELETE FROM users WHERE id = ?', [userId]);
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'user.account_deleted', 'user', userId, null, ip, ua);

  return c.json({ message: 'Account deleted successfully' });
});

export default users;
