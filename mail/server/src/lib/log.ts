/**
 * Minimal structured logger. Never logs credentials or message bodies.
 */
export function log(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...extra,
  }
  if (level === "error") console.error(JSON.stringify(line))
  else if (level === "warn") console.warn(JSON.stringify(line))
  else console.log(JSON.stringify(line))
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra),
}