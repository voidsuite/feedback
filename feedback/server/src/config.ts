/**
 * Server configuration — env-driven only.
 * NO secrets are hardcoded or committed. See .env.example at the repo root.
 */

const config = {
  port: parseInt(process.env.PORT || "3009", 10),
  voidauthUrl: (process.env.VOIDAUTH_URL || "https://auth.stwupid.tech").replace(/\/+$/, ""),
  clientId: process.env.VOIDFEEDBACK_CLIENT_ID || "voidfeedback",
  clientSecret: process.env.VOIDFEEDBACK_CLIENT_SECRET || "",
  appUrl: process.env.APP_URL || "http://localhost:5179",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Where the SQLite database and uploaded files live (relative to repo root). */
  dataDir: process.env.DATA_DIR || "./data",
  /** Max upload size in bytes (8 MiB). */
  maxUploadBytes: 8 * 1024 * 1024,
  /** SMTP for email notifications. Left empty disables the email notify source. */
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "Void Feedback <noreply@stwupid.tech>",
  },
  /** Public base URL used in notification links/emails. */
  publicUrl: (process.env.PUBLIC_URL || process.env.APP_URL || "http://localhost:5179").replace(/\/+$/, ""),
} as const

export function isSecure(): boolean {
  return config.appUrl.startsWith("https://")
}

export default config
