import bcrypt from 'bcrypt';

const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a random secure token (uniform distribution, no modulo bias)
 */
export function generateSecureToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charCount = chars.length;
  // Largest multiple of charCount that fits in a byte
  const maxValid = 256 - (256 % charCount);
  let result = '';
  while (result.length < length) {
    const randomValues = new Uint8Array(length - result.length);
    crypto.getRandomValues(randomValues);
    for (const byte of randomValues) {
      if (byte < maxValid) {
        result += chars[byte % charCount];
      }
    }
  }
  return result;
}

/**
 * Generate a cryptographically secure random string
 */
export function generateRandomString(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}
