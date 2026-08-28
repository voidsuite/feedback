import Redis from 'ioredis';
import { log } from './log.js';

let redis: Redis | null = null;

export function getRedis(): Redis | null {
  return redis;
}

export async function initRedis(url?: string): Promise<boolean> {
  if (!url) {
    log.info('Redis not configured, using in-memory stores');
    return false;
  }

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    await redis.connect();
    log.info('Redis connected');

    redis.on('error', (err) => {
      log.error('Redis error', { error: err.message });
    });

    redis.on('close', () => {
      log.warn('Redis connection closed');
    });

    return true;
  } catch (err) {
    log.error('Redis connection failed', { error: String(err) });
    redis = null;
    return false;
  }
}

export async function closeRedis() {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// Rate limiting via Redis
export async function checkRateLimit(key: string, windowMs: number, max: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  if (!redis) {
    return { allowed: true, remaining: max, resetAt: Date.now() + windowMs };
  }

  const now = Date.now();
  const windowStart = now - windowMs;
  const redisKey = `ratelimit:${key}`;

  const multi = redis.multi();
  multi.zremrangebyscore(redisKey, 0, windowStart);
  multi.zadd(redisKey, now, `${now}:${Math.random()}`);
  multi.zcard(redisKey);
  multi.pexpire(redisKey, windowMs);

  const results = await multi.exec();
  const count = results?.[2]?.[1] as number || 0;

  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetAt: now + windowMs,
  };
}

// WebAuthn challenge storage via Redis
export async function setChallenge(key: string, challenge: string, ttlMs: number = 120_000): Promise<void> {
  if (!redis) return;
  await redis.set(`challenge:${key}`, challenge, 'PX', ttlMs);
}

export async function getChallenge(key: string): Promise<string | null> {
  if (!redis) return null;
  return await redis.get(`challenge:${key}`);
}

export async function deleteChallenge(key: string): Promise<void> {
  if (!redis) return;
  await redis.del(`challenge:${key}`);
}
