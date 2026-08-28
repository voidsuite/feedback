/**
 * Structured logger with JSON output in production and colored console output in development.
 */

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
} as const;

const IS_PROD = process.env.NODE_ENV === 'production';

function timestamp(): string {
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${C.dim}${h}:${m}:${s}${C.reset}`;
}

function prefix(label: string, color: string): string {
  return `${timestamp()} ${color}${label}${C.reset}`;
}

function jsonLog(level: string, msg: string, extra?: Record<string, any>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: msg,
    ...extra,
  };
  console.log(JSON.stringify(entry));
}

export const log = {
  info(msg: string, extra?: Record<string, any>) {
    if (IS_PROD) {
      jsonLog('info', msg, extra);
    } else {
      console.log(`${prefix('[·]', C.blue)} ${msg}`);
    }
  },

  ok(msg: string, extra?: Record<string, any>) {
    if (IS_PROD) {
      jsonLog('info', msg, extra);
    } else {
      console.log(`${prefix('[✓]', C.green)} ${msg}`);
    }
  },

  warn(msg: string, extra?: Record<string, any>) {
    if (IS_PROD) {
      jsonLog('warn', msg, extra);
    } else {
      console.log(`${prefix('[!]', C.yellow)} ${msg}`);
    }
  },

  error(msg: string, err?: unknown) {
    if (IS_PROD) {
      const extra = err instanceof Error ? { error: err.message, stack: err.stack } : err ? { error: String(err) } : undefined;
      jsonLog('error', msg, extra);
    } else {
      const suffix = err instanceof Error ? ` — ${err.message}` : err ? ` — ${err}` : '';
      console.error(`${prefix('[✗]', C.red)} ${msg}${suffix}`);
    }
  },

  debug(msg: string, extra?: Record<string, any>) {
    if (IS_PROD) {
      jsonLog('debug', msg, extra);
    } else {
      console.log(`${prefix('[·]', C.gray)} ${msg}`);
    }
  },

  request(method: string, path: string, status: number, durationMs: number) {
    if (IS_PROD) {
      jsonLog('info', 'request', { method, path, status, durationMs });
    } else {
      const methodColor = method === 'GET' ? C.cyan
        : method === 'POST' ? C.green
        : method === 'PUT' || method === 'PATCH' ? C.yellow
        : method === 'DELETE' ? C.red
        : C.white;

      const statusColor = status >= 500 ? C.red
        : status >= 400 ? C.yellow
        : status >= 300 ? C.magenta
        : status >= 200 ? C.green
        : C.white;

      console.log(
        `${timestamp()} ${C.dim}${'─'}${C.reset} ` +
        `${methodColor}${method.padEnd(6)}${C.reset} ` +
        `${C.white}${path}${C.reset} ` +
        `${statusColor}${status}${C.reset} ` +
        `${C.dim}${durationMs}ms${C.reset}`
      );
    }
  },

  migration(msg: string) {
    if (IS_PROD) {
      jsonLog('info', msg);
    } else {
      console.log(`${prefix('[▸]', C.magenta)} ${msg}`);
    }
  },

  startup(title: string, port: string | number, env: string) {
    if (IS_PROD) {
      jsonLog('info', `${title} started`, { port, env });
    } else {
      const line = `${C.dim}${'─'.repeat(44)}${C.reset}`;
      console.log('');
      console.log(`${line}`);
      console.log(`  ${C.bold}${C.white}${title}${C.reset}  ${C.dim}v1.0.0${C.reset}`);
      console.log(`  ${C.blue}port${C.reset}     ${port}`);
      console.log(`  ${C.blue}env${C.reset}      ${env}`);
      console.log(`${line}`);
      console.log('');
    }
  },

  shutdown() {
    if (IS_PROD) {
      jsonLog('info', 'Shutting down...');
    } else {
      console.log('');
      console.log(`${prefix('[■]', C.yellow)} Shutting down...`);
    }
  },
};
