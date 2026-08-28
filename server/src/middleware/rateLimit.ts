import { getAuth } from './auth.js';
import { log } from '../utils/log.js';
import { getClientIP } from '../utils/ip.js';
import { checkRateLimit as redisCheckRateLimit, getRedis } from '../utils/redis.js';

const TIERS: Record<string, number> = {
  standard: 120,
  strict: 30,
  relaxed: 300,
};

const MAX_ENTRIES = 20000;
const stores = new Map<string, { count: number; resetAt: number }>();

function pruneStores(now: number) {
  for (const [key, entry] of stores) {
    if (now > entry.resetAt) stores.delete(key);
  }
  if (stores.size > MAX_ENTRIES) {
    let removed = 0;
    for (const [key, entry] of stores) {
      stores.delete(key);
      if (++removed >= 5000) break;
    }
  }
}

export function rateLimit({ windowMs = 60000, max, prefix = '', tier = 'standard' }: {
  windowMs?: number;
  max?: number;
  prefix?: string;
  tier?: 'standard' | 'strict' | 'relaxed';
} = {}) {
  const effectiveMax = max ?? TIERS[tier] ?? 120;

  return async (c, next) => {
    try {
      const ip = getClientIP(c);

      let userId = '';
      try {
        const auth = getAuth(c);
        if (auth?.userId) userId = auth.userId;
      } catch {}

      const idKey = userId ? `${ip}:${userId}` : ip;
      const key = `${prefix}:${idKey}:${c.req.path}`;

      // Use Redis if available
      if (getRedis()) {
        const result = await redisCheckRateLimit(key, windowMs, effectiveMax);
        if (!result.allowed) {
          return c.json({ error: 'Too many requests, try again later' }, 429);
        }
        await next();
        return;
      }

      // Fallback to in-memory
      const now = Date.now();
      let entry = stores.get(key);
      if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
      }
      entry.count += 1;
      stores.set(key, entry);

      if (entry.count > effectiveMax) {
        return c.json({ error: 'Too many requests, try again later' }, 429);
      }

      if (stores.size > MAX_ENTRIES) pruneStores(now);

      await next();
    } catch (err) {
      log.error('RateLimit middleware error', err as Error);
      await next();
    }
  }
}

export function resetRateLimit() {
  stores.clear();
}
