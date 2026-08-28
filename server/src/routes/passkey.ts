import { Hono } from 'hono';
import { randomUUID } from 'crypto';
import { log } from '../utils/log.js';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';
import { query, queryOne } from '../db/connection.js';
import { authMiddleware, getAuth } from '../middleware/auth.js';
import { config } from '../config/index.js';
import { generateMFAToken } from '../utils/jwt.js';
import { auditLog } from '../utils/audit.js';
import { getClientIP } from '../utils/ip.js';
import { generateSessionToken, setSessionCookie } from '../utils/session.js';
import { generateSecureToken } from '../utils/crypto.js';

const passkey = new Hono();

// RP = Relying Party
const rpName = 'VoidAuth';
const origin = config.cors.origin; // e.g. http://localhost:5173
// Use hostname from origin, fallback to localhost if origin is invalid or '*'
const getRpID = () => {
  try {
    if (origin === '*') return 'localhost';
    return new URL(origin).hostname;
  } catch {
    return 'localhost';
  }
};
const rpID = getRpID();

// Simple in-memory challenge store (use Redis in production)
const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_CHALLENGES = 10000;

function setChallenge(key: string, challenge: string) {
  if (challengeStore.size >= MAX_CHALLENGES) {
    // Bound memory: drop expired entries first, then oldest
    const now = Date.now();
    for (const [k, v] of challengeStore) {
      if (now > v.expiresAt) challengeStore.delete(k);
    }
    if (challengeStore.size >= MAX_CHALLENGES) {
      let removed = 0;
      for (const k of challengeStore.keys()) {
        challengeStore.delete(k);
        if (++removed >= 2000) break;
      }
    }
  }
  challengeStore.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function getChallenge(key: string): string | undefined {
  const entry = challengeStore.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    challengeStore.delete(key);
    return undefined;
  }
  return entry.challenge;
}

/**
 * GET /passkey/register-options
 * Generate options for passkey registration
 */
passkey.get('/register-options', authMiddleware, async (c) => {
  const { userId, email } = getAuth(c);

  // Get existing passkeys to prevent re-registration
  const userPasskeys = await query<any[]>(
    'SELECT credential_id FROM user_passkeys WHERE user_id = ?',
    [userId]
  );

  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userID: Buffer.from(userId),
    userName: email,
    userDisplayName: email,
    attestationType: 'none',
    excludeCredentials: userPasskeys.map(p => ({
      id: p.credential_id,
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'required',
      userVerification: 'discouraged',
      // Removed authenticatorAttachment: 'platform' to allow phones/security keys
    },
  });

  // Store challenge for verification
  setChallenge(`reg_${userId}`, options.challenge);

  return c.json(options);
});

/**
 * POST /passkey/register-verify
 * Verify passkey registration and save
 */
passkey.post('/register-verify', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  const body = await c.req.json() as RegistrationResponseJSON;
  const { name } = c.req.query();

  const expectedChallenge = getChallenge(`reg_${userId}`);

  if (!expectedChallenge) {
    return c.json({ error: 'Registration challenge not found' }, 400);
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (verification.verified && verification.registrationInfo) {
      log.debug(`Registration verified: credentialId=${verification.registrationInfo?.credential?.id ? 'present' : 'missing'}`);
      
      const info = verification.registrationInfo as any;
      // Handle both old and new simplewebauthn versions
      const credential = info.credential || {};
      const credentialID = info.credentialID || credential.id;
      const credentialPublicKey = info.credentialPublicKey || credential.publicKey;
      const counter = info.counter !== undefined ? info.counter : credential.counter;

      if (!credentialID) {
        log.error('credentialID is undefined in registrationInfo');
        return c.json({ error: 'Verification failed: missing credentialID' }, 400);
      }

      // If it's already a string (as seen in logs), use it directly, otherwise convert to base64url
      const finalCredentialID = typeof credentialID === 'string' 
        ? credentialID 
        : Buffer.from(credentialID).toString('base64url');

      await query(
        `INSERT INTO user_passkeys (id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          userId,
          finalCredentialID,
          Buffer.from(credentialPublicKey),
          counter,
          verification.registrationInfo.credentialDeviceType,
          verification.registrationInfo.credentialBackedUp,
          JSON.stringify(body.response.transports || []),
          name || 'Passkey'
        ]
      );

      challengeStore.delete(`reg_${userId}`);
      const ip = getClientIP(c);
      const ua = c.req.header('user-agent') || null;
      await auditLog(userId, 'passkey.registered', 'user_passkey', finalCredentialID, { name: name || 'Passkey' }, ip, ua);
      return c.json({ verified: true });
    }

    return c.json({ error: 'Verification failed' }, 400);
  } catch (error) {
    log.error('Registration verification error', error as Error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * POST /passkey/login-options
 * Generate options for passkey login
 */
passkey.post('/login-options', async (c) => {
  const { email } = await c.req.json();

  const user = await queryOne<any>(
    'SELECT id FROM users WHERE email = ?',
    [email]
  );

  if (!user) {
    return c.json({ error: 'User not found' }, 404);
  }

  const userPasskeys = await query<any[]>(
    'SELECT credential_id, transports FROM user_passkeys WHERE user_id = ?',
    [user.id]
  );

  if (userPasskeys.length === 0) {
    return c.json({ error: 'No passkeys found for this user' }, 400);
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: userPasskeys.map(p => ({
      id: p.credential_id,
      type: 'public-key',
      transports: JSON.parse(p.transports || '[]'),
    })),
    userVerification: 'discouraged',
  });

  // Store challenge
  setChallenge(`auth_${user.id}`, options.challenge);

  return c.json({
    options,
    userId: user.id
  });
});

/**
 * POST /passkey/login-verify
 * Verify passkey login and issue tokens
 */
passkey.post('/login-verify', async (c) => {
  const { body, keepMeLoggedIn: kmli, device_id, device_name } = await c.req.json() as { 
    body: AuthenticationResponseJSON, 
    keepMeLoggedIn?: boolean,
    device_id?: string,
    device_name?: string,
  };
  const keepMeLoggedIn = !!kmli;

  // Look up passkey by credential_id alone (don't trust client-supplied userId)
  const passkeyRow = await queryOne<any>(
    'SELECT * FROM user_passkeys WHERE credential_id = ?',
    [body.id]
  );

  if (!passkeyRow) {
    return c.json({ error: 'Passkey not found' }, 400);
  }

  const userId = passkeyRow.user_id;
  const expectedChallenge = getChallenge(`auth_${userId}`);
  if (!expectedChallenge) {
    return c.json({ error: 'Authentication challenge not found' }, 400);
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: passkeyRow.credential_id,
        publicKey: passkeyRow.public_key,
        counter: Number(passkeyRow.counter),
      },
    });

    if (verification.verified) {
      log.debug(`Authentication verified: newCounter=${verification.authenticationInfo?.newCounter}`);
      // Update counter
      await query(
        'UPDATE user_passkeys SET counter = ?, last_used_at = NOW() WHERE id = ?',
        [verification.authenticationInfo.newCounter, passkeyRow.id]
      );

      // Passkey authentication is considered a strong auth factor; proceed to issue tokens regardless of 2FA

      // Update user last login
      await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [userId]);

      // Look up user email from DB (don't trust client)
      const user = await queryOne<any>('SELECT email FROM users WHERE id = ?', [userId]);
      const email = user?.email || '';

      const sessionDays = keepMeLoggedIn ? 30 : 7;
      const sessionTtlSeconds = sessionDays * 24 * 60 * 60;
      const expiresAt = new Date(Date.now() + sessionTtlSeconds * 1000);
      const ip = getClientIP(c);
      const ua = c.req.header('user-agent') || null;

      // Generate refresh token for family tracking
      const refreshToken = await import('../utils/jwt.js').then(m => m.generateRefreshToken(userId, email, sessionTtlSeconds));

      // Generate session token for cookie
      const sessionToken = generateSessionToken();

      // Per-device sessions: revoke any existing session for this device
      if (device_id) {
        const stale = await query<any[]>(
          'SELECT refresh_token FROM sessions WHERE user_id = ? AND device_id = ?',
          [userId, device_id]
        );
        for (const s of stale || []) {
          if (s.refresh_token) {
            await query(`UPDATE refresh_token_families SET replaced_by = ? WHERE refresh_token = ?`, ['REVOKED', s.refresh_token]);
          }
        }
        await query('DELETE FROM sessions WHERE user_id = ? AND device_id = ?', [userId, device_id]);
      }

      const sessionId = randomUUID();
      await query(
        'INSERT INTO sessions (id, user_id, refresh_token, expires_at, ip_address, user_agent, device_id, device_name, session_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [sessionId, userId, refreshToken, expiresAt, ip, ua, device_id || null, device_name || null, sessionToken]
      );

      // Insert into refresh token family for rotation
      const familyId = randomUUID().replace(/-/g, '');
      await query(
        `INSERT INTO refresh_token_families (id, user_id, family_id, refresh_token, expires_at, session_ttl)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [randomUUID(), userId, familyId, refreshToken, expiresAt, sessionTtlSeconds]
      );

      challengeStore.delete(`auth_${userId}`);

      // Get user info for response
      const userRow = await queryOne<any>('SELECT id, email, name, role, avatar_url, created_at, password_changed_at, last_login_at, two_factor_enabled FROM users WHERE id = ?', [userId]);

      await auditLog(userId, 'user.login', 'user', userId, { method: 'passkey' }, ip, ua);

      import('../utils/email.js').then(async (m) => {
        if (m.isEmailConfigured()) {
          await m.sendNotificationEmail(userId, 'login_alert', 'New sign-in to your VoidAuth account', (n) => m.buildLoginAlertEmail(n, ip, new Date().toLocaleString()));
        }
      }).catch(() => {});

      // Set session cookie
      setSessionCookie(c, sessionToken, keepMeLoggedIn, sessionTtlSeconds);

      return c.json({
        verified: true,
        user: userRow ? {
          id: userRow.id,
          email: userRow.email,
          name: userRow.name,
          role: userRow.role,
          avatarUrl: userRow.avatar_url || null,
          createdAt: userRow.created_at,
          passwordChangedAt: userRow.password_changed_at,
          lastLoginAt: userRow.last_login_at,
          twoFactorEnabled: !!userRow.two_factor_enabled,
        } : { id: userId, email },
      });
    }

    return c.json({ error: 'Authentication failed' }, 400);
  } catch (error) {
    log.error('Authentication verification error', error as Error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/**
 * GET /passkey/list
 * List user's passkeys
 */
passkey.get('/list', authMiddleware, async (c) => {
  const { userId } = getAuth(c);

  const passkeys = await query<any[]>(
    'SELECT id, name, device_type, created_at, last_used_at FROM user_passkeys WHERE user_id = ?',
    [userId]
  );

  return c.json({ passkeys });
});

/**
 * DELETE /passkey/:id
 * Delete a passkey
 */
passkey.delete('/:id', authMiddleware, async (c) => {
  const { userId } = getAuth(c);
  const passkeyId = c.req.param('id');

  const passkey = await queryOne<any>(
    'SELECT name FROM user_passkeys WHERE id = ? AND user_id = ?',
    [passkeyId, userId]
  );
  await query(
    'DELETE FROM user_passkeys WHERE id = ? AND user_id = ?',
    [passkeyId, userId]
  );
  const ip = getClientIP(c);
  const ua = c.req.header('user-agent') || null;
  await auditLog(userId, 'passkey.deleted', 'user_passkey', passkeyId, { name: passkey?.name || 'Unknown' }, ip, ua);

  return c.json({ success: true });
});

export default passkey;
