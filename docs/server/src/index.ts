/**
 * docs gateway — serves the built client (client/dist) plus the API:
 *   /api/auth/*    VoidAuth OAuth proxy (PKCE, httpOnly session cookie)
 *   /api/storage/* VoidAuth storage proxy (Bearer access token)
 *   /api/vdocs/*   Vault-key escrow (automatic cross-device key sync)
 *   /api/ws        Encrypted multiplayer relay (E2E-dumb WebSocket rooms)
 */

import { Hono } from "hono"
import { cors } from "hono/cors"
import { fileURLToPath } from "node:url"
import path from "node:path"
import config from "./config.js"
import authRoutes from "./routes/oauth.js"
import storageRoutes from "./routes/storage.js"
import vdocsRoutes from "./routes/vdocs.js"
import { wsHandlers, handleWsUpgrade } from "./routes/ws.js"
import { logger } from "./lib/log.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST_DIR = path.resolve(__dirname, "../../client/dist")

const app = new Hono()

app.use(
  "*",
  cors({
    origin: config.allowedOrigins.length ? config.allowedOrigins : config.appUrl,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    credentials: true,
  })
)

app.route("/api/auth", authRoutes)
app.route("/api/storage", storageRoutes)
app.route("/api/vdocs", vdocsRoutes)

app.get("/health", (c) => c.json({ status: "ok", service: "vdocs" }))

// Static client + SPA fallback
const MIME_TYPES: Record<string, string> = {
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  txt: "text/plain",
  map: "application/json",
  webmanifest: "application/manifest+json",
}

app.get("*", async (c) => {
  const reqPath = c.req.path
  const filePath = reqPath === "/" ? "/index.html" : reqPath
  const ext = filePath.split(".").pop()?.toLowerCase() || ""
  const f = Bun.file(path.join(DIST_DIR, filePath))
  const exists = await f.exists()

  if (exists) {
    return new Response(f, {
      headers: { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" },
    })
  }
  if (!reqPath.startsWith("/api/")) {
    const fallback = Bun.file(path.join(DIST_DIR, "index.html"))
    if (await fallback.exists()) {
      return new Response(fallback, { headers: { "Content-Type": "text/html" } })
    }
  }
  return c.json({ error: "Not found" }, 404)
})

logger.info("docs gateway starting", { port: config.port, appUrl: config.appUrl, voidauthUrl: config.voidauthUrl })

export default {
  port: config.port,
  fetch: async (req: Request, server: import("bun").Server<unknown>) => {
    const url = new URL(req.url)
    if (url.pathname === "/api/ws" && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const res = handleWsUpgrade(req, server)
      if (res) return res
      return undefined
    }
    return app.fetch(req)
  },
  websocket: wsHandlers,
}