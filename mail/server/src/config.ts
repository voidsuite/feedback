/**
 * Server configuration — env-driven only.
 * NO secrets are hardcoded or committed. See .env.example at the repo root.
 */

const config = {
  port: parseInt(process.env.PORT || "3003", 10),
  voidauthUrl: (process.env.VOIDAUTH_URL || "https://auth.stwupid.tech").replace(/\/+$/, ""),
  clientId: process.env.M3IL_CLIENT_ID || "m3il",
  clientSecret: process.env.M3IL_CLIENT_SECRET || "",
  appUrl: process.env.APP_URL || "http://localhost:5174",
  sessionSecret: process.env.SESSION_SECRET || "",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const

export function isSecure(): boolean {
  return config.appUrl.startsWith("https://")
}

export function apiBase(): string {
  return `${config.appUrl.replace(/\/+$/, "")}`
}

export default config