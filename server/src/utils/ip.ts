import type { Context } from 'hono';

// Direct peers we trust to append X-Forwarded-For (nginx on the same host).
const TRUSTED_PROXIES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function peerAddress(c: Context): string {
  const incoming = (c.env as any)?.incoming;
  const remote = incoming?.socket?.remoteAddress || incoming?.socket?.remoteAddress;
  if (typeof remote === 'string') return remote;
  const req = (c as any).req?.raw as any;
  if (req?.socket?.remoteAddress) return req.socket.remoteAddress;
  return '127.0.0.1';
}

/**
 * Resolve the real client IP.
 * Only trusts X-Forwarded-For when the direct peer is a known trusted proxy,
 * and then only the LAST entry (the one nginx appended), never client-supplied
 * values that may be prepended by the caller.
 */
export function getClientIP(c: Context): string {
  const peer = peerAddress(c);
  if (!TRUSTED_PROXIES.has(peer)) return peer;

  const forwarded = c.req.header('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  const realIp = c.req.header('x-real-ip');
  if (realIp) return realIp;
  return peer;
}
