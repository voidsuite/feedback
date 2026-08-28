/**
 * Server configuration — env-driven only.
 * NO secrets are hardcoded or committed. See .env.example at the repo root.
 */

const config = {
  port: parseInt(process.env.PORT || "3006", 10),
  voidauthUrl: (process.env.VOIDAUTH_URL || "https://auth.stwupid.tech").replace(/\/+$/, ""),
  clientId: process.env.VOIDBOARD_CLIENT_ID || "voidboard",
  clientSecret: process.env.VOIDBOARD_CLIENT_SECRET || "",
  appUrl: process.env.APP_URL || "http://localhost:5177",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Where the SQLite database and uploaded files live (relative to repo root). */
  dataDir: process.env.DATA_DIR || "./data",
  /** Max simultaneous connections per board room. */
  maxRoomPeers: 64,
  /** Max upload size in bytes (8 MiB). */
  maxUploadBytes: 8 * 1024 * 1024,
} as const

export function isSecure(): boolean {
  return config.appUrl.startsWith("https://")
}

export default config