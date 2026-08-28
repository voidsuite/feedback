import fs from "fs";
// Configuration management with environment variables
export const config = {
  server: {
    port: parseInt(process.env.PORT || "3001"),
    host: process.env.HOST || "127.0.0.1",
    nodeEnv: process.env.NODE_ENV || "development",
  },
  ssl: process.env.DB_SSL_CA
    ? { ca: fs.readFileSync(process.env.DB_SSL_CA) }
    : { rejectUnauthorized: false },
  database: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "voidauth",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "voidauth",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  },
  jwt: {
    secret: process.env.JWT_SECRET || "",
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d",
  },
  oauth: {
    codeExpiresIn: parseInt(process.env.OAUTH_CODE_EXPIRES_IN || "600"), // 10 minutes
    tokenExpiresIn: parseInt(process.env.OAUTH_TOKEN_EXPIRES_IN || "3600"), // 1 hour
  },
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },
  session: {
    domain: process.env.SESSION_DOMAIN || undefined,
    secure: process.env.SESSION_SECURE !== 'false',
    maxAge: parseInt(process.env.SESSION_MAX_AGE || String(30 * 24 * 60 * 60)),
    maxAgeRememberMe: parseInt(process.env.SESSION_REMEMBER_MAX_AGE || String(90 * 24 * 60 * 60)),
    name: process.env.SESSION_COOKIE_NAME || 'va_session',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY || "",
  },
  redis: {
    url: process.env.REDIS_URL || "",
  },
  internal: {
    // Shared secret used to authorise server-to-server calls to internal-only
    // API routes (the official frontend is authorised via session cookie or
    // trusted Origin; the internal key is for nginx/server-side integrations).
    apiKey: process.env.INTERNAL_API_KEY || "",
  },
};

// Validate required configuration
export function validateConfig() {
  const required = ["DB_PASSWORD"];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`,
    );
  }
}
