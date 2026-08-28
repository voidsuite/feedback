import { Hono } from 'hono';
import { query } from '../db/connection.js';
import { getRedis } from '../utils/redis.js';

const health = new Hono();

health.get('/', async (c) => {
  const checks: Record<string, { status: string; latency?: number }> = {};

  // Database check
  const dbStart = Date.now();
  try {
    await query('SELECT 1');
    checks.database = { status: 'healthy', latency: Date.now() - dbStart };
  } catch (err) {
    checks.database = { status: 'unhealthy', latency: Date.now() - dbStart };
  }

  // Redis check
  const redis = getRedis();
  if (redis) {
    const redisStart = Date.now();
    try {
      await redis.ping();
      checks.redis = { status: 'healthy', latency: Date.now() - redisStart };
    } catch (err) {
      checks.redis = { status: 'unhealthy', latency: Date.now() - redisStart };
    }
  } else {
    checks.redis = { status: 'not_configured' };
  }

  const allHealthy = Object.values(checks).every(c => c.status === 'healthy' || c.status === 'not_configured');

  return c.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  }, allHealthy ? 200 : 503);
});

export default health;
