/**
 * Void Feedback gateway — serves the built client (client/dist) plus the API:
 *   /api/auth/*    VoidAuth OAuth proxy (PKCE, httpOnly session cookie)
 *   /api/threads*  feedback threads, messages, votes
 *   /api/admin/*   admin analytics + notifications (role-gated)
 *   /api/ws        realtime (live chat, support lobby, admin presence)
 *
 * Data lives in SQLite (DATA_DIR/voidfeedback.db) — submit once, it's there on
 * any device, no passphrase, nothing to enter.
 */

import { Hono } from "hono"
import { cors } from "hono/cors"
import { fileURLToPath } from "node:url"
import path from "node:path"
import config from "./config.js"
import authRoutes from "./routes/auth.js"
import threadsRoutes from "./routes/threads.js"
import messagesRoutes from "./routes/messages.js"
import votesRoutes from "./routes/votes.js"
import adminRoutes from "./routes/admin.js"
import notificationsRoutes from "./routes/notifications.js"
import uploadsRoutes, { uploadStatic } from "./routes/uploads.js"
import { wsHandlers, handleWsUpgrade } from "./routes/ws.js"

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

// Dev-friendly request log.
app.use("*", async (c, next) => {
  await next()
  const res = c.res
  if (res.status >= 400) {
    const body = await res.clone().text().catch(() => "")
    console.log(`[http] ${c.req.method} ${c.req.path} -> ${res.status} ${body.slice(0, 200)}`)
  } else {
    console.log(`[http] ${c.req.method} ${c.req.path} -> ${res.status}`)
  }
})

app.route("/api/auth", authRoutes)
app.route("/api/threads", threadsRoutes)
app.route("/api/threads", messagesRoutes)
app.route("/api/threads", votesRoutes)
app.route("/api/admin", adminRoutes)
app.route("/api/admin/notifications", notificationsRoutes)
app.route("/api/uploads", uploadsRoutes)
app.route("/uploads", uploadStatic)

app.get("/health", (c) => c.json({ status: "ok", service: "voidfeedback" }))

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

console.log(`[voidfeedback] gateway starting on :${config.port} (${config.appUrl})`)

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
