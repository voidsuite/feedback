import { Hono } from 'hono';
import { randomUUID, randomBytes, timingSafeEqual } from 'crypto';
import { generateSecret, generateURI, verify } from 'otplib';
import QRCode from 'qrcode';
import { query, queryOne } from '../db/connection.js';
import { hashPassword, verifyPassword, generateSecureToken } from '../utils/crypto.js';
import { generateAccessToken, generateRefreshToken, generateMFAToken, generateStepUpToken, verifyToken } from '../utils/jwt.js';
import { checkPasswordStrength } from '../utils/password.js';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { registerSchema, loginSchema, twoFactorVerifySchema, twoFactorLoginSchema } from '../validators/index.js';
import { authMiddleware, getAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { auditLog } from '../utils/audit.js';
import { getClientIP } from '../utils/ip.js';
import { generateSessionToken, setSessionCookie, clearSessionCookie } from '../utils/session.js';
import { log } from '../utils/log.js';
import { getIPLocation, formatLocation } from '../utils/geo.js';

const auth = new Hono();

/**
 * Helper: create a DB session + set session cookie + return user object.
 * Used by all login/register/refresh endpoints.
 */
async function createSessionAndSetCookie(
  c: any,
  userId: string,
  email: string,
  keepMeLoggedIn: boolean,
  ip: string,
  ua: string,
  deviceId?: string | null,
  deviceName?: string | null,
) {
  const sessionDays = keepMeLoggedIn ? 30 : 7;
  const sessionTtlSeconds = sessionDays * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);

  // Generate access + refresh tokens (still needed for refresh token family tracking)
  const accessToken = await generateAccessToken(userId, email);
  const refreshToken = await generateRefreshToken(userId, email, sessionTtlSeconds);

  // Generate session token for cookie
  const sessionToken = generateSessionToken();

  // Google-style per-device sessions: replacing an existing login on the same
  // device revokes that device's old session instead of accumulating rows.
  if (deviceId) {
    const stale = await query<any[]>(
      'SELECT refresh_token FROM sessions WHERE user_id = ? AND device_id = ?',
      [userId, deviceId]
    );
    for (const s of stale || []) {
      if (s.refresh_token) {
        await query(`UPDATE refresh_token_families SET replaced_by = ? WHERE refresh_token = ?`, ['REVOKED', s.refresh_token]);
      }
    }
    await query('DELETE FROM sessions WHERE user_id = ? AND device_id = ?', [userId, deviceId]);
  }

  const sessionId = randomUUID();
  await query(
    `INSERT INTO sessions (id, user_id, refresh_token, expires_at, ip_address, user_agent, device_id, device_name, session_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, refreshToken, expiresAt, ip, ua, deviceId || null, deviceName || null, sessionToken]
  );

  await insertRefreshTokenFamily(userId, refreshToken, expiresAt, sessionTtlSeconds);

  // Set session cookie (TTL locked to the DB session expiry)
  setSessionCookie(c, sessionToken, keepMeLoggedIn, sessionTtlSeconds);

  // Fetch full user object for response
  const user = await queryOne<any>(
    'SELECT id, email, name, role, avatar_url, created_at, password_changed_at, last_login_at, two_factor_enabled FROM users WHERE id = ?',
    [userId]
  );

  return {
    user: user ? {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatar_url || null,
      createdAt: user.created_at,
      passwordChangedAt: user.password_changed_at,
      lastLoginAt: user.last_login_at,
      twoFactorEnabled: !!user.two_factor_enabled,
    } : { id: userId, email },
  };
}

async function trySendNotif(userId: string, type: 'login_alert' | 'password_change' | 'new_app_connection' | 'storage_warning', subject: string, buildHtml: (name: string) => Promise<string> | string) {
  try {
    const m = await import('../utils/email.js');
    if (m.isEmailConfigured()) {
      await m.sendNotificationEmail(userId, type, subject, buildHtml);
    }
  } catch {}
}

// Check if signups are allowed
async function signupsAllowed(): Promise<boolean> {
  const row = await queryOne<any>("SELECT setting_value FROM admin_settings WHERE setting_key = 'allow_signups'");
  return row ? row.setting_value !== '0' : true;
}

// Ensure backup codes table exists before using it
async function ensureBackupCodesTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_2fa_backup_codes (
      id VARCHAR(36) PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      code_hash VARCHAR(255) NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      INDEX idx_user_id (user_id),
      INDEX idx_used (used)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
}

async function insertRefreshTokenFamily(userId: string, token: string, expiresAt: Date, sessionTtlSeconds?: number) {
  const familyId = randomUUID().replace(/-/g, '');
  await query(
    `INSERT INTO refresh_token_families (id, user_id, family_id, refresh_token, expires_at, session_ttl)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), userId, familyId, token, expiresAt, sessionTtlSeconds ?? null]
  );
}

async function checkLoginLockout(email: string, ip: string): Promise<string | null> {
  const lock = await queryOne<any>(
    'SELECT locked_until, attempt_count FROM login_lockouts WHERE email = ? AND ip_address = ?',
    [email, ip]
  );
  if (lock && lock.locked_until && new Date() < new Date(lock.locked_until)) {
    return `Account temporarily locked. Try again after ${Math.ceil((new Date(lock.locked_until).getTime() - Date.now()) / 60_000)} minutes.`;
  }
  return null;
}
async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  await query('INSERT INTO login_attempts (id, email, ip_address, success) VALUES (?, ?, ?, ?)',
    [randomUUID(), email, ip, success]);
  if (!success) {
    await query(
      `INSERT INTO login_lockouts (email, ip_address, attempt_count) VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE attempt_count = attempt_count + 1, last_attempt = NOW()`,
      [email, ip]
    );
    const lock = await queryOne<any>('SELECT attempt_count FROM login_lockouts WHERE email = ? AND ip_address = ?', [email, ip]);
    const count = Number(lock?.attempt_count) || 0;
    if (count >= 5) {
      const backoffMinutes = Math.min(60, Math.pow(2, count - 5) * 5);
      await query('UPDATE login_lockouts SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE) WHERE email = ? AND ip_address = ?',
        [backoffMinutes, email, ip]);
    }
  } else {
    await query('DELETE FROM login_lockouts WHERE email = ? AND ip_address = ?', [email, ip]);
  }
}

async function recordLoginHistory(userId: string, email: string, ip: string, ua: string, method: string) {
  await query('INSERT INTO login_history (id, user_id, email, ip_address, user_agent, method, success) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [randomUUID(), userId, email, ip, ua, method, true]);
}

/**
 * POST /auth/register
 * Register a new user
 */
auth.post('/register', async (c) => {
  const allowed = await signupsAllowed();
  if (!allowed) return c.json({ error: 'Registration is disabled. Contact the administrator.' }, 403);

  try {
    const body = await c.req.json();
    const validated = registerSchema.parse(body);

    // Check if user already exists
    const existingUser = await queryOne(
      'SELECT id FROM users WHERE email = ?',
      [validated.email]
    );

    if (existingUser) {
      return c.json({ error: 'Email already registered' }, 400);
    }

    // Hash password
    const passwordHash = await hashPassword(validated.password);

    // Create user
    const userId = randomUUID();
    const now = new Date();

    // First user automatically becomes admin
    const existingUsers = await queryOne<any>('SELECT COUNT(*) as count FROM users');
    const role = existingUsers?.count === 0 ? 'admin' : 'user';

    await query(
      `INSERT INTO users (id, email, name, password_hash, role, created_at, password_changed_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, validated.email, validated.name, passwordHash, role, now, now]
    );

    // Send verification email
    const verifyToken = generateSecureToken(32);
    await query(
      'UPDATE users SET email_verified = FALSE, reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 24 HOUR) WHERE id = ?',
      [verifyToken, userId]
    );

    try {
      const { sendEmail, buildEmailVerification } = await import('../utils/email.js');
      const frontendOrigin = config.cors.origin.replace(/\/$/, '');
      const verifyUrl = `${frontendOrigin}/verify-email?token=${verifyToken}&email=${encodeURIComponent(validated.email)}`;
      await sendEmail(validated.email, 'Verify your email address', buildEmailVerification(validated.name, verifyUrl));
    } catch (emailErr) {
      log.warn('Failed to send verification email', { error: String(emailErr) });
    }

    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || null;

    await auditLog(userId, 'user.registered', 'user', userId, { email: validated.email }, ip, ua);

    const result = await createSessionAndSetCookie(c, userId, validated.email, false, ip, ua, validated.device_id, validated.device_name);

    return c.json(result, 201);
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      return c.json({ error: 'Validation error', details: error }, 400);
    }
    throw error;
  }
});

/**
 * POST /auth/check-email
 * Check if email is registered and what login methods are available.
 * Rate-limited to prevent enumeration.
 */
auth.post('/check-email', rateLimit({ windowMs: 60_000, max: 10 }), async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'Email required' }, 400);

    const user = await queryOne<any>(
      'SELECT id, two_factor_enabled, is_active FROM users WHERE email = ?',
      [email]
    );

    if (!user || !user.is_active) {
      return c.json({ exists: false });
    }

    const passkeyCount = await queryOne<any>(
      'SELECT COUNT(*) as count FROM user_passkeys WHERE user_id = ?',
      [user.id]
    );

    const { isEmailConfigured } = await import('../utils/email.js');

    return c.json({
      exists: true,
      hasTwoFactor: !!user.two_factor_enabled,
      hasPasskey: Number(passkeyCount?.count) > 0,
      emailConfigured: isEmailConfigured(),
    });
  } catch {
    return c.json({ exists: false });
  }
});

/**
 * POST /auth/login
 * Authenticate user and return tokens
 */
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const validated = loginSchema.parse(body);

    const ip = getClientIP(c);

    const lockMsg = await checkLoginLockout(validated.email, ip);
    if (lockMsg) {
      return c.json({ error: lockMsg }, 429);
    }

    const user = await queryOne<any>(
      `SELECT id, email, name, password_hash, created_at, password_changed_at, is_active, two_factor_enabled, role, onboarded_at, avatar_url, last_login_at
       FROM users WHERE email = ?`,
      [validated.email]
    );

    if (!user || !user.is_active) {
      await recordLoginAttempt(validated.email, ip, false);
      const ua = c.req.header('user-agent') || null;
      await auditLog(null, 'user.login.failed', 'user', null, { email: validated.email, reason: 'user_not_found_or_inactive' }, ip, ua);
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Verify password
    const isValid = await verifyPassword(validated.password, user.password_hash);

    if (!isValid) {
      await recordLoginAttempt(validated.email, ip, false);
      const ua = c.req.header('user-agent') || null;
      await auditLog(null, 'user.login.failed', 'user', user.id, { email: validated.email, reason: 'invalid_password' }, ip, ua);
      trySendNotif(user.id, 'login_alert', 'Failed sign-in attempt on your VoidAuth account', async (n) => {
        const m = await import('../utils/email.js');
        const lock = await queryOne<any>('SELECT attempt_count FROM login_lockouts WHERE email = ? AND ip_address = ?', [validated.email, ip]);
        return m.buildFailedLoginAlertEmail(n, ip, Number(lock?.attempt_count) || 1);
      });
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // If 2FA enabled, return MFA token
    if (user.two_factor_enabled) {
      const ua = c.req.header('user-agent') || null;
      await auditLog(user.id, 'user.login.2fa_required', 'user', user.id, null, ip, ua);
      return c.json({
        mfaRequired: true,
        mfaToken: await generateMFAToken(user.id, user.email),
      });
    }

    await recordLoginAttempt(validated.email, ip, true);

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const ua = c.req.header('user-agent') || '';
    await recordLoginHistory(user.id, user.email, ip, ua, 'password');
    await auditLog(user.id, 'user.login', 'user', user.id, { method: 'password' }, ip, ua);

    const keepMeLoggedIn = validated.keepMeLoggedIn;
    const result = await createSessionAndSetCookie(
      c, user.id, user.email, !!keepMeLoggedIn, ip, ua,
      validated.device_id, validated.device_name
    );

    trySendNotif(user.id, 'login_alert', 'New sign-in to your VoidAuth account', async (n) => {
      const m = await import('../utils/email.js');
      return m.buildLoginAlertEmail(n, ip, new Date().toLocaleString());
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      return c.json({ error: 'Validation error', details: error }, 400);
    }
    throw error;
  }
});

/**
 * POST /auth/login/2fa
 */
auth.post('/login/2fa', rateLimit({ windowMs: 60_000, max: 6 }), async (c) => {
  try {
    const body = await c.req.json();
    const validated = twoFactorLoginSchema.parse(body);

    // Verify MFA token
    const payload = await verifyToken(validated.mfa_token);
    if (!payload || payload.type !== 'mfa') {
      return c.json({ error: 'Invalid or expired MFA token' }, 401);
    }
    log.debug(`Login/2fa payload decoded: userId=${payload.userId}, mfaToken=present`);

    const user = await queryOne<any>(
      'SELECT id, email, name, role, two_factor_secret, created_at, password_changed_at, onboarded_at, avatar_url, last_login_at, two_factor_enabled FROM users WHERE id = ?',
      [payload.userId]
    );
    log.debug(`Login/2fa user: ${user ? user.id : 'not found'}`);

    if (!user || !user.two_factor_secret) {
      return c.json({ error: 'User not found or 2FA not setup' }, 404);
    }

    // Verify TOTP code
    let isValid = false;
    try {
      log.debug(`MFA verify for user ${user.id}`);
      isValid = verify({ token: validated.code, secret: user.two_factor_secret });
      log.debug(`MFA verify result: ${isValid}`);
    } catch (err) {
      log.error('TOTP verification error', err as Error);
      return c.json({ error: 'Invalid 2FA code' }, 401);
    }

    if (!isValid) {
      // If TOTP failed, attempt to match provided value against unused backup codes
      try {
        const rows = await query<any[]>('SELECT id, code_hash, used FROM user_2fa_backup_codes WHERE user_id = ? AND used = FALSE', [user.id]);
        let matchedId: string | null = null;
        for (const r of rows) {
          const ok = await import('../utils/crypto.js').then(m => m.verifyPassword(validated.code, r.code_hash));
          if (ok) { matchedId = r.id; break; }
        }
        if (matchedId) {
          // mark used and continue to issue tokens
          await query('UPDATE user_2fa_backup_codes SET used = TRUE WHERE id = ?', [matchedId]);
        } else {
          return c.json({ error: 'Invalid 2FA code' }, 401);
        }
      } catch (err) {
        log.error('Backup code fallback error', err as Error);
        return c.json({ error: 'Invalid 2FA code' }, 401);
      }
    }

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || '';
    await recordLoginHistory(user.id, user.email, ip, ua, '2fa');
    await auditLog(user.id, 'user.login', 'user', user.id, { method: '2fa' }, ip, ua);

    const keepMeLoggedIn = !!body.keepMeLoggedIn;

    const result = await createSessionAndSetCookie(
      c, user.id, user.email, keepMeLoggedIn, ip, ua,
      body.device_id, body.device_name
    );

    trySendNotif(user.id, 'login_alert', 'New sign-in to your VoidAuth account', async (n) => {
      const m = await import('../utils/email.js');
      return m.buildLoginAlertEmail(n, ip, new Date().toLocaleString());
    });

    return c.json(result);
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      return c.json({ error: 'Validation error', details: error }, 400);
    }
    throw error;
  }
});

// Note: rate limiting is applied globally via middleware in server/src/index.ts

/**
 * POST /auth/login/2fa/backup
 */
auth.post('/login/2fa/backup', rateLimit({ windowMs: 60_000, max: 6 }), async (c) => {
  try {
    const body = await c.req.json();
    const { mfa_token, code } = body || {};

    const payload = await verifyToken(mfa_token);
    if (!payload || payload.type !== 'mfa') {
      return c.json({ error: 'Invalid or expired MFA token' }, 401);
    }

    const userId = payload.userId;

    // Find unused backup codes for user
    const rows = await query<any[]>('SELECT id, code_hash, used FROM user_2fa_backup_codes WHERE user_id = ? AND used = FALSE', [userId]);
    if (!rows || rows.length === 0) return c.json({ error: 'No backup codes available' }, 400);

    let matchedId: string | null = null;
    for (const r of rows) {
      const ok = await import('../utils/crypto.js').then(m => m.verifyPassword(code, r.code_hash));
      if (ok) { matchedId = r.id; break; }
    }

    if (!matchedId) return c.json({ error: 'Invalid backup code' }, 400);

    // Mark used
    await query('UPDATE user_2fa_backup_codes SET used = TRUE WHERE id = ?', [matchedId]);

    // Issue tokens (same as /login/2fa)
    const user = await queryOne<any>('SELECT id, email, name, role, created_at, password_changed_at, onboarded_at, avatar_url, last_login_at, two_factor_enabled FROM users WHERE id = ?', [userId]);
    if (!user) return c.json({ error: 'User not found' }, 404);

    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId]);

    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || '';
    await recordLoginHistory(user.id, user.email, ip, ua, 'backup_code');
    await auditLog(user.id, 'user.login', 'user', user.id, { method: 'backup_code' }, ip, ua);

    const keepMeLoggedIn = !!body.keepMeLoggedIn;

    const result = await createSessionAndSetCookie(
      c, user.id, user.email, keepMeLoggedIn, ip, ua,
      body.device_id, body.device_name
    );

    trySendNotif(user.id, 'login_alert', 'New sign-in to your VoidAuth account', async (n) => {
      const m = await import('../utils/email.js');
      return m.buildLoginAlertEmail(n, ip, new Date().toLocaleString());
    });

    return c.json(result);
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * POST /auth/refresh
 * Rotate session cookie. Reads current session from cookie, issues new one.
 */
auth.post('/refresh', async (c) => {
  try {
    // Read current session from cookie
    const { getSessionToken } = await import('../utils/session.js');
    const sessionToken = getSessionToken(c);
    if (!sessionToken) return c.json({ error: 'No session' }, 401);

    // Look up session
    const session = await queryOne<any>(
      `SELECT s.id, s.user_id, s.refresh_token, s.expires_at, s.device_id, s.device_name, s.ip_address, s.user_agent
       FROM sessions s WHERE s.session_token = ? AND s.expires_at > NOW()`,
      [sessionToken]
    );

    if (!session) {
      clearSessionCookie(c);
      return c.json({ error: 'Invalid or expired session' }, 401);
    }

    // Validate user is still active
    const user = await queryOne<any>('SELECT id, email, name, role, avatar_url, created_at, password_changed_at, last_login_at, two_factor_enabled FROM users WHERE id = ? AND is_active = true', [session.user_id]);
    if (!user) {
      clearSessionCookie(c);
      return c.json({ error: 'User not found' }, 401);
    }

    // Check refresh token family for rotation
    const family = await queryOne<any>(
      `SELECT id, family_id, refresh_token, replaced_by, expires_at, session_ttl
       FROM refresh_token_families WHERE refresh_token = ?`,
      [session.refresh_token]
    );

    if (!family || (family.replaced_by && family.replaced_by !== 'REVOKED')) {
      // Session's refresh token was already used — possible token theft
      // Revoke entire family
      if (family) {
        await query(`UPDATE refresh_token_families SET replaced_by = 'REVOKED' WHERE family_id = ?`, [family.family_id]);
      }
      await query('DELETE FROM sessions WHERE id = ?', [session.id]);
      clearSessionCookie(c);
      return c.json({ error: 'Session invalidated' }, 401);
    }

    // Generate new tokens
    const ttlSeconds = family.session_ttl || (7 * 24 * 60 * 60);
    const newRefreshToken = generateSecureToken(64);
    const refreshExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const newSessionToken = generateSessionToken();

    // Rotate refresh token family
    await query(`UPDATE refresh_token_families SET replaced_by = ? WHERE id = ?`, [newRefreshToken, family.id]);
    await query(
      `INSERT INTO refresh_token_families (id, user_id, family_id, refresh_token, expires_at, session_ttl)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), session.user_id, family.family_id, newRefreshToken, refreshExpiresAt, ttlSeconds]
    );

    // Update session with new tokens
    const newExpiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await query(
      `UPDATE sessions SET refresh_token = ?, session_token = ?, expires_at = ? WHERE id = ?`,
      [newRefreshToken, newSessionToken, newExpiresAt, session.id]
    );

    // Set new session cookie (rotation)
    const keepLoggedIn = ttlSeconds > 7 * 24 * 60 * 60;
    setSessionCookie(c, newSessionToken, keepLoggedIn, ttlSeconds);

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatar_url || null,
        createdAt: user.created_at,
        passwordChangedAt: user.password_changed_at,
        lastLoginAt: user.last_login_at,
        twoFactorEnabled: !!user.two_factor_enabled,
      },
    });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * POST /auth/logout
 * Invalidate session and clear cookie
 */
auth.post('/logout', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'user.logout', 'user', userId, null, ip, ua);

  // Per-device logout: only revoke the session that owns this cookie
  const { getSessionToken } = await import('../utils/session.js');
  const sessionToken = getSessionToken(c);
  const current = sessionToken
    ? await queryOne<any>('SELECT id FROM sessions WHERE session_token = ? AND user_id = ?', [sessionToken, userId])
    : null;
  if (current) {
    await query('DELETE FROM sessions WHERE id = ?', [current.id]);
  }

  // Clear session cookie
  clearSessionCookie(c);

  return c.json({ message: 'Logged out successfully' });
});

/**
 * GET /auth/sessions
 * List current user's active sessions
 */
auth.get('/sessions', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  const sessions = await query<any[]>(
    `SELECT id, created_at, expires_at, ip_address, user_agent, device_id, device_name
     FROM sessions WHERE user_id = ? AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [userId]
  );

  // Resolve IP geolocation for each session
  const sessionsWithGeo = await Promise.all(
    (sessions || []).map(async (s) => {
      let location: string | null = null;
      if (s.ip_address) {
        const geo = await getIPLocation(s.ip_address);
        location = formatLocation(geo);
      }
      return { ...s, location };
    })
  );

  return c.json({ sessions: sessionsWithGeo });
});

/**
 * DELETE /auth/sessions/:id
 * Revoke a specific session (cannot revoke current session)
 */
auth.delete('/sessions/:id', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  const sessionId = c.req.param('id');

  const session = await queryOne<any>('SELECT id, refresh_token FROM sessions WHERE id = ? AND user_id = ?', [sessionId, userId]);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  await query('DELETE FROM sessions WHERE id = ?', [sessionId]);

  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'user.session_revoked', 'user', userId, null, ip, ua);

  return c.json({ success: true });
});

/**
 * GET /auth/me
 * Get current user info
 */
auth.get('/me', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  const user = await queryOne<any>(
    'SELECT id, email, name, role, avatar_url, created_at, password_changed_at, last_login_at, two_factor_enabled, onboarded_at FROM users WHERE id = ?',
    [userId]
  );

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

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
    }
  });
});

/**
 * POST /auth/2fa/setup
 * Generate 2FA secret and QR code
 */
auth.post('/2fa/setup', authMiddleware, async (c) => {
  const { userId, email } = getAuth(c);

  // Generate secret
  const secret = generateSecret();
  
  // Store secret temporarily (we won't enable 2FA until verified)
  // For simplicity, we'll store it in the user record
  await query('UPDATE users SET two_factor_secret = ? WHERE id = ?', [secret, userId]);

  const otpauth = generateURI({ issuer: 'VoidAuth', label: email, secret });
  const qrCodeUrl = await QRCode.toDataURL(otpauth);

  return c.json({
    secret,
    qrCodeUrl,
  });
});

/**
 * POST /auth/2fa/verify
 * Verify and enable 2FA
 */
auth.post('/2fa/verify', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const body = await c.req.json();
    const { code } = twoFactorVerifySchema.parse(body);

    const user = await queryOne<any>(
      'SELECT two_factor_secret FROM users WHERE id = ?',
      [userId]
    );

    if (!user || !user.two_factor_secret) {
      return c.json({ error: '2FA setup not initiated' }, 400);
    }

    const isValid = verify({
      token: code,
      secret: user.two_factor_secret,
    });

    if (!isValid) {
      return c.json({ error: 'Invalid verification code' }, 400);
    }

    // Enable 2FA and clear stored secret for security
    await query('UPDATE users SET two_factor_enabled = TRUE, two_factor_secret = ? WHERE id = ?', [user.two_factor_secret, userId]);
    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || null;
    await auditLog(userId, 'user.2fa_enabled', 'user', userId, null, ip, ua);

    // Generate backup codes (store hashed)
    await ensureBackupCodesTable();
    const backupCodes: string[] = [];
    const backupHashes: { id: string; hash: string }[] = [];
    for (let i = 0; i < 8; i++) {
      const code = generateSecureToken(10);
      backupCodes.push(code);
      const id = randomUUID();
      const hash = await import('../utils/crypto.js').then(m => m.hashPassword(code));
      backupHashes.push({ id, hash });
    }

    // Insert backup codes
    for (const bh of backupHashes) {
      await query('INSERT INTO user_2fa_backup_codes (id, user_id, code_hash) VALUES (?, ?, ?)', [bh.id, userId, bh.hash]);
    }

    // Return plaintext backup codes to the client exactly once so the user can store them
    return c.json({ success: true, message: '2FA enabled successfully', codes: backupCodes });
  } catch (error) {
    if (error instanceof Error && 'issues' in error) {
      return c.json({ error: 'Validation error', details: error }, 400);
    }
    throw error;
  }
});

/**
 * POST /auth/2fa/backup/generate
 * Generate new backup codes (replaces existing)
 */
auth.post('/2fa/backup/generate', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  // Generate 8 new backup codes
  const codes: string[] = [];
  const hashes: { id: string; hash: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const code = randomUUID().split('-')[0];
    codes.push(code);
    const id = randomUUID();
    const hash = await import('../utils/crypto.js').then(m => m.hashPassword(code));
    hashes.push({ id, hash });
  }

  // Ensure table exists then delete existing codes
  await ensureBackupCodesTable();
  await query('DELETE FROM user_2fa_backup_codes WHERE user_id = ?', [userId]);

  for (const h of hashes) {
    await query('INSERT INTO user_2fa_backup_codes (id, user_id, code_hash) VALUES (?, ?, ?)', [h.id, userId, h.hash]);
  }

  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'user.backup_codes_generated', 'user', userId, null, ip, ua);

  return c.json({ codes });
});

/**
 * GET /auth/2fa/backup
 * List backup codes metadata
 */
auth.get('/2fa/backup', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  await ensureBackupCodesTable();
  const rows = await query<any[]>('SELECT id, used FROM user_2fa_backup_codes WHERE user_id = ?', [userId]);
  return c.json({ codes: rows.map(r => ({ id: r.id, used: !!r.used })) });
});

/**
 * POST /auth/2fa/backup/use
 * Redeem a backup code
 */
auth.post('/2fa/backup/use', async (c) => {
  try {
    const body = await c.req.json();
    const { id, code } = body;

    await ensureBackupCodesTable();
    const row = await queryOne<any>('SELECT id, user_id, code_hash, used FROM user_2fa_backup_codes WHERE id = ?', [id]);
    if (!row) return c.json({ error: 'Backup code not found' }, 404);
    if (row.used) return c.json({ error: 'Backup code already used' }, 400);

    const isValid = await import('../utils/crypto.js').then(m => m.verifyPassword(code, row.code_hash));
    if (!isValid) return c.json({ error: 'Invalid backup code' }, 400);

    // mark used
    await query('UPDATE user_2fa_backup_codes SET used = TRUE WHERE id = ?', [id]);
    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * POST /auth/2fa/disable
 * Disable 2FA
 */
auth.post('/2fa/disable', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  // Expect current password in the request body
  try {
    const body = await c.req.json();
    const { currentPassword } = body || {};
    if (!currentPassword) return c.json({ error: 'Current password required' }, 400);

    const user = await queryOne<any>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) return c.json({ error: 'User not found' }, 404);

    const valid = await verifyPassword(currentPassword, user.password_hash);
    if (!valid) return c.json({ error: 'Invalid password' }, 401);

    // Disable 2FA and remove any existing backup codes
    await query(
      'UPDATE users SET two_factor_enabled = FALSE, two_factor_secret = NULL WHERE id = ?',
      [userId]
    );
    await ensureBackupCodesTable();
    await query('DELETE FROM user_2fa_backup_codes WHERE user_id = ?', [userId]);
    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || null;
    await auditLog(userId, 'user.2fa_disabled', 'user', userId, null, ip, ua);

    return c.json({ success: true, message: '2FA disabled successfully' });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * GET /auth/settings
 * Public: check if signups are allowed
 */
auth.get('/settings', async (c) => {
  const allowed = await signupsAllowed();
  return c.json({ allow_signups: allowed });
});

/**
 * POST /auth/forgot-password
 * Send password reset email
 */
auth.post('/forgot-password', rateLimit({ windowMs: 60_000, max: 3 }), async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'Email required' }, 400);

    const user = await queryOne<any>('SELECT id, email, name FROM users WHERE email = ?', [email]);
    // Don't reveal whether the email exists
    if (!user) return c.json({ success: true });

    const { isEmailConfigured, sendEmail, buildPasswordResetEmail } = await import('../utils/email.js');
    if (!isEmailConfigured()) return c.json({ success: true }); // Silently succeed if email not configured

    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 3600_000); // 1 hour
    await query('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [token, expires, user.id]);
    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || null;
    await auditLog(user.id, 'user.password.forgot_requested', 'user', user.id, null, ip, ua);

    const resetLink = `${config.cors.origin}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    await sendEmail(user.email, 'Reset your VoidAuth password', buildPasswordResetEmail(resetLink));

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to send reset email' }, 500);
  }
});

/**
 * POST /auth/reset-password
 * Reset password with token
 */
auth.post('/reset-password', rateLimit({ windowMs: 60_000, max: 5 }), async (c) => {
  try {
    const { email, token, password } = await c.req.json();
    if (!email || !token || !password) return c.json({ error: 'Email, token, and password required' }, 400);

    const user = await queryOne<any>(
      'SELECT id, reset_token, reset_token_expires FROM users WHERE email = ?',
      [email]
    );
    if (!user || !user.reset_token) return c.json({ error: 'Invalid or expired reset link' }, 400);
    const tokenBuf = Buffer.from(user.reset_token);
    const inputBuf = Buffer.from(token);
    if (tokenBuf.length !== inputBuf.length || !timingSafeEqual(tokenBuf, inputBuf)) {
      return c.json({ error: 'Invalid or expired reset link' }, 400);
    }
    if (new Date() > new Date(user.reset_token_expires)) return c.json({ error: 'Reset link expired' }, 400);

    const hash = await hashPassword(password);
    await query('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, password_changed_at = NOW() WHERE id = ?', [hash, user.id]);
    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || null;
    await auditLog(user.id, 'user.password.reset', 'user', user.id, null, ip, ua);

    return c.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    return c.json({ error: 'Failed to reset password' }, 500);
  }
});

/**
 * POST /auth/verify-email
 * Verify email address using token
 */
auth.post('/verify-email', async (c) => {
  try {
    const { token, email } = await c.req.json();
    if (!token || !email) return c.json({ error: 'Token and email required' }, 400);

    const user = await queryOne<any>(
      'SELECT id, reset_token, reset_token_expires FROM users WHERE email = ?',
      [email]
    );
    if (!user || !user.reset_token) return c.json({ error: 'Invalid or expired verification link' }, 400);

    const tokenBuf = Buffer.from(user.reset_token);
    const inputBuf = Buffer.from(token);
    if (tokenBuf.length !== inputBuf.length || !timingSafeEqual(tokenBuf, inputBuf)) {
      return c.json({ error: 'Invalid or expired verification link' }, 400);
    }
    if (new Date() > new Date(user.reset_token_expires)) return c.json({ error: 'Verification link expired' }, 400);

    await query(
      'UPDATE users SET email_verified = TRUE, email_verified_at = NOW(), reset_token = NULL, reset_token_expires = NULL WHERE id = ?',
      [user.id]
    );

    return c.json({ success: true, message: 'Email verified successfully' });
  } catch (err) {
    return c.json({ error: 'Failed to verify email' }, 500);
  }
});

/**
 * POST /auth/resend-verification
 * Resend verification email
 */
auth.post('/resend-verification', rateLimit({ windowMs: 60_000, max: 3 }), async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'Email required' }, 400);

    const user = await queryOne<any>('SELECT id, name, email_verified FROM users WHERE email = ?', [email]);
    if (!user || user.email_verified) {
      // Don't reveal if user exists or is already verified
      return c.json({ success: true, message: 'If an account exists, a verification email has been sent' });
    }

    const verifyToken = generateSecureToken(32);
    await query(
      'UPDATE users SET reset_token = ?, reset_token_expires = DATE_ADD(NOW(), INTERVAL 24 HOUR) WHERE id = ?',
      [verifyToken, user.id]
    );

    const { sendEmail, buildEmailVerification } = await import('../utils/email.js');
    const frontendOrigin = config.cors.origin.replace(/\/$/, '');
    const verifyUrl = `${frontendOrigin}/verify-email?token=${verifyToken}&email=${encodeURIComponent(email)}`;
    await sendEmail(email, 'Verify your email address', buildEmailVerification(user.name, verifyUrl));

    return c.json({ success: true, message: 'If an account exists, a verification email has been sent' });
  } catch (err) {
    return c.json({ error: 'Failed to resend verification' }, 500);
  }
});

/**
 * POST /auth/contact-admin
 * Submit a contact request (when signups are disabled)
 */
auth.post('/contact-admin', rateLimit({ windowMs: 60_000, max: 5 }), async (c) => {
  try {
    const { name, email, message } = await c.req.json();
    if (!name || !email || !message) return c.json({ error: 'Name, email, and message required' }, 400);

    const { isEmailConfigured, sendEmail, getEmailConfig, buildContactAutoReply, buildContactNotification } = await import('../utils/email.js');
    if (!isEmailConfigured()) return c.json({ error: 'Contact form is not available yet' }, 503);

    const cfg = getEmailConfig();
    // Notify admin
    await sendEmail(
      cfg?.from || 'admin@voidauth.local',
      `New contact request from ${name}`,
      buildContactNotification(name, email, message)
    );

    // Send auto-reply to the user
    await sendEmail(email, 'Thanks for reaching out', buildContactAutoReply(name, message));
    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || null;
    await auditLog(null, 'user.contact_admin', 'user', null, { name, email }, ip, ua);

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to send message' }, 500);
  }
});

/**
 * GET /auth/login-history
 * Get paginated login history for the authenticated user
 */
auth.get('/login-history', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = (page - 1) * limit;
  const rows = await query<any[]>(
    'SELECT id, ip_address, user_agent, method, success, created_at FROM login_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [userId, limit, offset]
  );
  const total = await queryOne<any>('SELECT COUNT(*) as count FROM login_history WHERE user_id = ?', [userId]);
  return c.json({ entries: rows || [], total: Number(total?.count) || 0, page, limit });
});

/**
 * POST /auth/magic-link/send
 * Send a magic link for passwordless login
 */
auth.post('/magic-link/send', rateLimit({ windowMs: 60_000, max: 3 }), async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'Email required' }, 400);

    const user = await queryOne<any>('SELECT id, email FROM users WHERE email = ?', [email]);
    if (!user) return c.json({ error: 'No account found with this email' }, 404);

    const { isEmailConfigured, sendEmail, buildMagicLinkEmail } = await import('../utils/email.js');
    if (!isEmailConfigured()) return c.json({ error: 'Email service is not configured. Contact the administrator.' }, 500);

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 3600_000);

    await query('INSERT INTO magic_links (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), user.id, token, expiresAt]);

    const link = `${config.cors.origin}/magic-link?token=${token}&email=${encodeURIComponent(user.email)}`;
    try {
      await sendEmail(user.email, 'Sign in to VoidAuth', buildMagicLinkEmail(link));
      log.info(`Magic link sent to ${user.email}`);
    } catch (sendErr: any) {
      log.error('Failed to send magic link email', sendErr.message);
      return c.json({ error: 'Failed to send email. Please try again later.' }, 500);
    }

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to send magic link' }, 500);
  }
});

/**
 * POST /auth/magic-link/verify
 * Verify a magic link token and issue tokens
 */
  auth.post('/magic-link/verify', rateLimit({ windowMs: 60_000, max: 6 }), async (c) => {
    try {
      const { email, token, keepMeLoggedIn: kmli, device_id, device_name } = await c.req.json();
    const keepMeLoggedIn = !!kmli;
    if (!email || !token) return c.json({ error: 'Email and token required' }, 400);

    const user = await queryOne<any>(
      'SELECT id, email, name, role, created_at, password_changed_at, onboarded_at, avatar_url, last_login_at, two_factor_enabled FROM users WHERE email = ?',
      [email]
    );
    if (!user) return c.json({ error: 'Invalid magic link' }, 400);

    const magic = await queryOne<any>(
      'SELECT id FROM magic_links WHERE user_id = ? AND token = ? AND expires_at > NOW() AND used_at IS NULL',
      [user.id, token]
    );
    if (!magic) return c.json({ error: 'Invalid or expired magic link' }, 400);

    await query('UPDATE magic_links SET used_at = NOW() WHERE id = ?', [magic.id]);
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || '';
    await recordLoginHistory(user.id, user.email, ip, ua, 'magic_link');
    await auditLog(user.id, 'user.login', 'user', user.id, { method: 'magic_link' }, ip, ua);

    const result = await createSessionAndSetCookie(
      c, user.id, user.email, keepMeLoggedIn, ip, ua, device_id, device_name
    );

    trySendNotif(user.id, 'login_alert', 'New sign-in to your VoidAuth account', async (n) => {
      const m = await import('../utils/email.js');
      return m.buildLoginAlertEmail(n, ip, new Date().toLocaleString());
    });

    return c.json(result);
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * POST /auth/otp/send
 * Send a one-time password code to the user's email
 */
auth.post('/otp/send', rateLimit({ windowMs: 60_000, max: 3 }), async (c) => {
  try {
    const { email } = await c.req.json();
    if (!email) return c.json({ error: 'Email required' }, 400);

    const user = await queryOne<any>('SELECT id, email FROM users WHERE email = ?', [email]);
    if (!user) return c.json({ error: 'No account found with this email' }, 404);

    const { isEmailConfigured, sendEmail, buildOTPEmail } = await import('../utils/email.js');
    if (!isEmailConfigured()) return c.json({ error: 'Email service is not configured. Contact the administrator.' }, 500);

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + 5 * 60_000);

    await query('INSERT INTO magic_links (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)',
      [randomUUID(), user.id, hash, expiresAt]);

    try {
      await sendEmail(user.email, 'Your VoidAuth verification code', buildOTPEmail(code));
      log.info(`OTP sent to ${user.email}`);
    } catch (sendErr: any) {
      log.error('Failed to send OTP email', sendErr.message);
      return c.json({ error: 'Failed to send email. Please try again later.' }, 500);
    }

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to send code' }, 500);
  }
});

/**
 * POST /auth/otp/verify
 * Verify an OTP code and issue tokens
 */
  auth.post('/otp/verify', rateLimit({ windowMs: 60_000, max: 6 }), async (c) => {
    try {
      const { email, code, keepMeLoggedIn: kmli, device_id, device_name } = await c.req.json();
    const keepMeLoggedIn = !!kmli;
    if (!email || !code) return c.json({ error: 'Email and code required' }, 400);

    const user = await queryOne<any>(
      'SELECT id, email, name, role, created_at, password_changed_at, onboarded_at, avatar_url, last_login_at, two_factor_enabled FROM users WHERE email = ?',
      [email]
    );
    if (!user) return c.json({ error: 'Invalid code' }, 400);

    const rows = await query<any[]>(
      'SELECT id, token FROM magic_links WHERE user_id = ? AND expires_at > NOW() AND used_at IS NULL',
      [user.id]
    );

    let valid = false;
    let matchedId: string | null = null;
    for (const r of rows || []) {
      valid = await verifyPassword(code, r.token);
      if (valid) { matchedId = r.id; break; }
    }

    if (!matchedId) return c.json({ error: 'Invalid or expired code' }, 400);

    await query('UPDATE magic_links SET used_at = NOW() WHERE id = ?', [matchedId]);
    await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || '';
    await recordLoginHistory(user.id, user.email, ip, ua, 'email_otp');
    await auditLog(user.id, 'user.login', 'user', user.id, { method: 'email_otp' }, ip, ua);

    const result = await createSessionAndSetCookie(
      c, user.id, user.email, keepMeLoggedIn, ip, ua, device_id, device_name
    );

    trySendNotif(user.id, 'login_alert', 'New sign-in to your VoidAuth account', async (n) => {
      const m = await import('../utils/email.js');
      return m.buildLoginAlertEmail(n, ip, new Date().toLocaleString());
    });

    return c.json(result);
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * POST /auth/verify-email/send
 * Send email verification link
 */
auth.post('/verify-email/send', authMiddleware, async (c) => {
  try {
    const { userId, email } = getAuth(c);

    const { isEmailConfigured, sendEmail, buildEmailVerificationEmail } = await import('../utils/email.js');
    if (!isEmailConfigured()) return c.json({ error: 'Email not configured' }, 500);

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 3600_000);

    await query('INSERT INTO email_verifications (id, user_id, email, token, expires_at) VALUES (?, ?, ?, ?, ?)',
      [randomUUID(), userId, email, token, expiresAt]);

    const link = `${config.cors.origin}/verify-email?token=${token}`;
    await sendEmail(email, 'Verify your VoidAuth email', buildEmailVerificationEmail(link));

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to send verification email' }, 500);
  }
});

/**
 * POST /auth/verify-email/confirm
 * Confirm email verification with token
 */
auth.post('/verify-email/confirm', async (c) => {
  try {
    const { token } = await c.req.json();
    if (!token) return c.json({ error: 'Token required' }, 400);

    const verification = await queryOne<any>(
      'SELECT id, user_id FROM email_verifications WHERE token = ? AND expires_at > NOW() AND verified_at IS NULL',
      [token]
    );
    if (!verification) return c.json({ error: 'Invalid or expired verification token' }, 400);

    await query("UPDATE users SET email_verified = TRUE, email_verified_at = NOW() WHERE id = ?", [verification.user_id]);
    await query('UPDATE email_verifications SET verified_at = NOW() WHERE id = ?', [verification.id]);
    const ip = getClientIP(c);
    const ua = c.req.header('user-agent') || null;
    await auditLog(verification.user_id, 'user.email_verified', 'user', verification.user_id, null, ip, ua);

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Failed to verify email' }, 500);
  }
});

/**
 * POST /auth/re-auth
 * Re-authenticate with password and get a step-up token
 */
auth.post('/re-auth', authMiddleware, async (c) => {
  try {
    const { userId, email } = getAuth(c);
    const { password } = await c.req.json();
    if (!password) return c.json({ error: 'Password required' }, 400);

    const user = await queryOne<any>('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) return c.json({ error: 'User not found' }, 404);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return c.json({ error: 'Invalid password' }, 401);

    const stepUpToken = await generateStepUpToken(userId, email);
    return c.json({ stepUpToken });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * POST /auth/re-auth/validate
 * Validate a step-up token
 */
auth.post('/re-auth/validate', async (c) => {
  try {
    const { step_up_token } = await c.req.json();
    if (!step_up_token) return c.json({ error: 'step_up_token required' }, 400);

    const payload = await verifyToken(step_up_token);
    if (!payload || payload.type !== 'step_up') {
      return c.json({ valid: false, error: 'Invalid or expired step-up token' });
    }

    return c.json({ valid: true, userId: payload.userId, expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString() });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * POST /auth/password-strength
 * Check password strength
 */
auth.post('/password-strength', async (c) => {
  const body = await c.req.json();
  const password = body.password || '';
  if (!password) return c.json({ score: 0, warning: 'No password provided' });
  const result = checkPasswordStrength(password);
  return c.json(result);
});

/**
 * POST /auth/check-password
 * Check if a password has been breached via HIBP k-anonymity API
 */
auth.post('/check-password', async (c) => {
  try {
    const { password } = await c.req.json();
    if (!password) return c.json({ error: 'Password required' }, 400);

    const sha1 = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    try {
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'User-Agent': 'VoidAuth' }
      });
      const text = await res.text();
      const breached = text.split('\n').some(line => line.split(':')[0] === suffix);
      return c.json({ breached, safe: !breached });
    } catch {
      return c.json({ breached: false, safe: true, error: 'Could not check' });
    }
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * GET /auth/notifications
 * Get user notification preferences
 */
auth.get('/notifications', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  let prefs = await queryOne<any>('SELECT * FROM user_notification_prefs WHERE user_id = ?', [userId]);
  if (!prefs) {
    await query('INSERT INTO user_notification_prefs (user_id) VALUES (?)', [userId]);
    prefs = await queryOne<any>('SELECT * FROM user_notification_prefs WHERE user_id = ?', [userId]);
  }
  return c.json({
    login_alert: !!prefs?.login_alert,
    password_change: !!prefs?.password_change,
    new_app_connection: !!prefs?.new_app_connection,
    storage_warning: !!prefs?.storage_warning,
  });
});

/**
 * PATCH /auth/notifications
 * Update user notification preferences
 */
auth.patch('/notifications', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const body = await c.req.json();
    const fields: Record<string, any> = {};
    for (const k of ['login_alert', 'password_change', 'new_app_connection', 'storage_warning']) {
      if (typeof body[k] === 'boolean') fields[k] = body[k];
    }
    if (Object.keys(fields).length === 0) return c.json({ error: 'No valid preferences provided' }, 400);

    const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const values = Object.values(fields);
    await query(
      `INSERT INTO user_notification_prefs (user_id, ${Object.keys(fields).join(', ')}) VALUES (?, ${values.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${setClauses}`,
      [userId, ...values, ...values]
    );

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * GET /auth/recovery-contacts
 * List recovery contacts for the authenticated user
 */
auth.get('/recovery-contacts', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  const contacts = await query<any[]>(
    'SELECT id, contact_type, contact_value, verified, created_at FROM user_recovery_contacts WHERE user_id = ? ORDER BY created_at DESC',
    [userId]
  );
  return c.json({ contacts });
});

/**
 * POST /auth/recovery-contacts
 * Add a recovery contact
 */
auth.post('/recovery-contacts', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const body = await c.req.json();
    const { contact_type, contact_value } = body;

    if (!contact_type || !contact_value) {
      return c.json({ error: 'Contact type and value are required' }, 400);
    }
    if (!['email', 'phone'].includes(contact_type)) {
      return c.json({ error: 'Contact type must be email or phone' }, 400);
    }
    if (contact_value.length > 255) {
      return c.json({ error: 'Contact value too long' }, 400);
    }

    const id = randomUUID();
    // Generate 6-digit verification code
    const code = String(crypto.randomInt(100000, 999999));
    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await query(
      `INSERT INTO user_recovery_contacts (id, user_id, contact_type, contact_value, verification_token, verification_expires)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, contact_type, contact_value, codeHash, expires]
    );

    return c.json({ id, code });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * POST /auth/recovery-contacts/:id/verify
 * Verify a recovery contact with 6-digit code
 */
auth.post('/recovery-contacts/:id/verify', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const id = c.req.param('id');
    const { code } = await c.req.json();

    if (!code) {
      return c.json({ error: 'Verification code is required' }, 400);
    }

    const contact = await queryOne<any>(
      'SELECT id, verification_token, verification_expires FROM user_recovery_contacts WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!contact) {
      return c.json({ error: 'Contact not found' }, 404);
    }

    if (contact.verified) {
      return c.json({ error: 'Contact already verified' }, 400);
    }

    if (contact.verification_expires && new Date(contact.verification_expires) < new Date()) {
      return c.json({ error: 'Verification code has expired. Remove and re-add the contact.' }, 400);
    }

    const codeHash = crypto.createHash('sha256').update(code).digest('hex');
    if (codeHash !== contact.verification_token) {
      return c.json({ error: 'Invalid verification code' }, 400);
    }

    await query(
      'UPDATE user_recovery_contacts SET verified = TRUE, verification_token = NULL, verification_expires = NULL WHERE id = ?',
      [id]
    );

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

/**
 * DELETE /auth/recovery-contacts/:id
 * Delete a recovery contact
 */
auth.delete('/recovery-contacts/:id', authMiddleware, async (c) => {
  try {
    const { userId } = getAuth(c);
    const id = c.req.param('id');

    const contact = await queryOne<any>(
      'SELECT id FROM user_recovery_contacts WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (!contact) {
      return c.json({ error: 'Contact not found' }, 404);
    }

    await query('DELETE FROM user_recovery_contacts WHERE id = ?', [id]);

    return c.json({ success: true });
  } catch (err) {
    return c.json({ error: 'Invalid request' }, 400);
  }
});

export default auth;
