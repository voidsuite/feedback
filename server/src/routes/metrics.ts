import { Hono } from 'hono';
import { query } from '../db/connection.js';

const metrics = new Hono();

let requestCount = 0;
let errorCount = 0;
let startTime = Date.now();

export function incrementRequestCount() { requestCount++; }
export function incrementErrorCount() { errorCount++; }

metrics.get('/', async (c) => {
  const uptime = (Date.now() - startTime) / 1000;

  // Gather metrics from DB
  let totalUsers = 0;
  let activeSessions = 0;
  let totalTokens = 0;

  try {
    const [users, sessions, tokens] = await Promise.all([
      query<any[]>('SELECT COUNT(*) as count FROM users'),
      query<any[]>('SELECT COUNT(*) as count FROM sessions WHERE expires_at > NOW()'),
      query<any[]>('SELECT COUNT(*) as count FROM oauth_tokens WHERE expires_at > NOW() AND revoked_at IS NULL'),
    ]);
    totalUsers = Number(users?.[0]?.count) || 0;
    activeSessions = Number(sessions?.[0]?.count) || 0;
    totalTokens = Number(tokens?.[0]?.count) || 0;
  } catch {}

  const lines = [
    '# HELP voidauth_uptime_seconds Time since server start',
    '# TYPE voidauth_uptime_seconds gauge',
    `voidauth_uptime_seconds ${uptime}`,
    '',
    '# HELP voidauth_requests_total Total HTTP requests',
    '# TYPE voidauth_requests_total counter',
    `voidauth_requests_total ${requestCount}`,
    '',
    '# HELP voidauth_errors_total Total HTTP errors',
    '# TYPE voidauth_errors_total counter',
    `voidauth_errors_total ${errorCount}`,
    '',
    '# HELP voidauth_users_total Total registered users',
    '# TYPE voidauth_users_total gauge',
    `voidauth_users_total ${totalUsers}`,
    '',
    '# HELP voidauth_sessions_active Active sessions',
    '# TYPE voidauth_sessions_active gauge',
    `voidauth_sessions_active ${activeSessions}`,
    '',
    '# HELP voidauth_oauth_tokens_active Active OAuth tokens',
    '# TYPE voidauth_oauth_tokens_active gauge',
    `voidauth_oauth_tokens_active ${totalTokens}`,
    '',
    '# HELP voidauth_process_memory_bytes Process memory usage',
    '# TYPE voidauth_process_memory_bytes gauge',
    `voidauth_process_memory_bytes ${process.memoryUsage().heapUsed}`,
    '',
    '# HELP voidauth_process_resident_memory_bytes Resident memory',
    '# TYPE voidauth_process_resident_memory_bytes gauge',
    `voidauth_process_resident_memory_bytes ${process.memoryUsage().rss}`,
  ];

  c.header('Content-Type', 'text/plain; version=0.0.4');
  return c.text(lines.join('\n'));
});

export default metrics;
