import { createSign, createVerify, randomUUID } from 'crypto';
import { config } from '../config/index.js';
import { getKeyPair } from './jwtKeys.js';

export interface JWTPayload {
  userId: string;
  email: string;
  type: 'access' | 'refresh' | 'mfa' | 'step_up';
  [key: string]: any;
}

const ALGORITHM = 'RS256';
const KID = 'voidauth-rs256-1';

function b64url(input: Buffer | string): string {
  return Buffer.from(input as any).toString('base64url');
}

function parseDurationToSeconds(input: string | number): number {
  if (typeof input === 'number') return input;
  const m = String(input).match(/^(\d+)\s*(s|m|h|d)?$/i);
  if (!m) return 15 * 60; // default 15m
  const n = parseInt(m[1], 10);
  const unit = (m[2] || 's').toLowerCase();
  switch (unit) {
    case 'd':
      return n * 24 * 60 * 60;
    case 'h':
      return n * 60 * 60;
    case 'm':
      return n * 60;
    default:
      return n; // seconds
  }
}

export interface SignOptions {
  subject?: string;
  jti?: string;
  notBefore?: number;
}

/**
 * Sign a JWT (RS256) using the persisted keypair.
 */
export async function signJwt(
  payload: Record<string, any>,
  expiresInSec: number,
  options: SignOptions = {},
): Promise<string> {
  const { privateKey } = await getKeyPair();
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: ALGORITHM, kid: KID, typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    ...payload,
    iat: nowSec,
    exp: nowSec + expiresInSec,
    ...(options.notBefore !== undefined ? { nbf: options.notBefore } : {}),
    ...(options.subject ? { sub: options.subject } : {}),
    ...(options.jti ? { jti: options.jti } : {}),
  }));
  const data = `${header}.${body}`;
  const signature = createSign('RSA-SHA256').update(data).sign(privateKey);
  return `${data}.${b64url(signature)}`;
}

/**
 * Verify a JWT signature and expiration. Returns payload or null.
 */
export async function verifyJwt(token: string): Promise<JWTPayload | null> {
  try {
    const { publicKey } = await getKeyPair();
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, bodyB64, sigB64] = parts;
    const data = `${headerB64}.${bodyB64}`;
    const signature = Buffer.from(sigB64, 'base64url');
    const valid = createVerify('RSA-SHA256').update(data).verify(publicKey, signature);
    if (!valid) return null;

    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8')) as JWTPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && nowSec > payload.exp + 60) return null; // 60s clock tolerance
    if (payload.nbf && nowSec < payload.nbf - 60) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate a short-lived MFA token
 */
export async function generateMFAToken(userId: string, email: string): Promise<string> {
  return signJwt({ userId, email, type: 'mfa' }, 5 * 60, { subject: userId });
}

/**
 * Generate a JWT access token
 */
export async function generateAccessToken(userId: string, email: string): Promise<string> {
  const ttl = parseDurationToSeconds(config.jwt.expiresIn || '15m');
  return signJwt({ userId, email, type: 'access' }, ttl, { subject: userId });
}

/**
 * Generate a JWT refresh token
 * @param ttlSeconds - Optional override for TTL (e.g. 30 days for "keep me logged in")
 */
export async function generateRefreshToken(userId: string, email: string, ttlSeconds?: number): Promise<string> {
  const ttl = ttlSeconds ?? parseDurationToSeconds(config.jwt.refreshExpiresIn || '7d');
  return signJwt({ userId, email, type: 'refresh' }, ttl, { subject: userId, jti: randomUUID() });
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  // Expected for OAuth tokens (non-JWT) — returns null
  return verifyJwt(token);
}

/**
 * Generate a short-lived step-up token for re-authentication
 */
export async function generateStepUpToken(userId: string, email: string): Promise<string> {
  return signJwt({ userId, email, type: 'step_up' }, 5 * 60, { subject: userId });
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return null;
  return parts[1];
}
