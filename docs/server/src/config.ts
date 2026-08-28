/**
 * Server configuration — env-driven only.
 * NO secrets are hardcoded or committed. See .env.example at the repo root.
 */

const config = {
  port: parseInt(process.env.PORT || "3005", 10),
  voidauthUrl: (process.env.VOIDAUTH_URL || "https://auth.stwupid.tech").replace(/\/+$/, ""),
  clientId: process.env.VDOCS_CLIENT_ID || "docs",
  clientSecret: process.env.VDOCS_CLIENT_SECRET || "",
  appUrl: process.env.APP_URL || "http://localhost:5176",
  sessionSecret: process.env.SESSION_SECRET || "",
  allowedOrigins: (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** Max bytes per relayed message (E2E ciphertext). */
  maxWsMessageBytes: 8 * 1024 * 1024,
  /** Max simultaneous connections per room. */
  maxRoomPeers: 32,
  /** Where the escrow database lives (relative to repo root when run via scripts). */
  dataDir: process.env.DATA_DIR || "./data",
} as const

export function isSecure(): boolean {
  return config.appUrl.startsWith("https://")
}

export function apiBase(): string {
  return `${config.appUrl.replace(/\/+$/, "")}`
}

export default config